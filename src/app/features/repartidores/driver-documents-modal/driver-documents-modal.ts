import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DriverDocumentsService } from '../../../core/services/driver-documents.service';
import { DriversService } from '../../../core/services/drivers.service';
import {
  DriverDocumentFile,
  DriverOnboardingState,
  OnboardingDocSlot,
  OnboardingDocType,
} from '../../../core/models/driver-onboarding.model';
import { Icon } from '../../../shared/icon/icon';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

/**
 * Revisión del onboarding de un repartidor: su capital declarado y cada
 * documento subido (DUI frente/reverso, constancia de la PNC, ...). El
 * super-admin aprueba o rechaza cada archivo (rechazar exige un motivo, que
 * el repartidor ve en su app) y, cuando todo lo obligatorio está aprobado,
 * activa la cuenta.
 */
@Component({
  selector: 'app-driver-documents-modal',
  standalone: true,
  imports: [DatePipe, FormsModule, Icon, Skeleton],
  templateUrl: './driver-documents-modal.html',
  styleUrl: './driver-documents-modal.scss',
})
export class DriverDocumentsModal implements OnInit {
  @Input({ required: true }) driverId!: number;
  @Input() driverName = '';
  @Output() close = new EventEmitter<void>();
  /** Emitido cuando el repartidor pasa a 'active' — el padre recarga la lista. */
  @Output() approved = new EventEmitter<void>();

  private readonly service = inject(DriverDocumentsService);
  private readonly drivers = inject(DriversService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly isLoading = signal(true);
  readonly state = signal<DriverOnboardingState | null>(null);
  readonly busyDocIds = signal<Set<number>>(new Set());
  readonly isApproving = signal(false);

  /** "typeId:side" del slot que se está subiendo ahora mismo, o null. */
  readonly uploadingKey = signal<string | null>(null);
  /** Slot para el que se está pidiendo los campos extra (nº de DUI, fecha, ...) antes de subir. */
  readonly fieldsFormFor = signal<{ type: OnboardingDocType; slot: OnboardingDocSlot } | null>(null);
  readonly fieldsFormValues = signal<Record<string, string>>({});
  private pendingUploadFile: File | null = null;
  private uploadTarget: { type: OnboardingDocType; slot: OnboardingDocSlot } | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.state.set(await this.service.getOnboarding(this.driverId));
    } catch {
      this.toast.error('No se pudo cargar la información del repartidor');
    } finally {
      this.isLoading.set(false);
    }
  }

  slotLabel(type: OnboardingDocType, slot: OnboardingDocSlot): string {
    if (slot.side === 'front') return `${type.label} — Frente`;
    if (slot.side === 'back') return `${type.label} — Reverso`;
    return type.label;
  }

  /** Campos extra que el repartidor llenó, con sus labels legibles. */
  fieldEntries(type: OnboardingDocType, doc: DriverDocumentFile): { label: string; value: string }[] {
    const values = doc.fieldValues ?? {};
    return (type.fields ?? [])
      .map((f) => ({ label: f.label, value: values[f.key] != null ? String(values[f.key]) : '' }))
      .filter((e) => e.value !== '');
  }

  slotKey(type: OnboardingDocType, slot: OnboardingDocSlot): string {
    return `${type.id}:${slot.side}`;
  }

  /** Abre el selector de archivos nativo para este slot — el <input> vive oculto en el template. */
  triggerUpload(type: OnboardingDocType, slot: OnboardingDocSlot, input: HTMLInputElement): void {
    this.uploadTarget = { type, slot };
    input.value = ''; // permite volver a elegir el mismo archivo si se cancela el formulario de campos
    input.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const target = this.uploadTarget;
    if (!file || !target) return;

    const { type, slot } = target;
    // Mismo criterio que la app del repartidor: los campos extra (nº de
    // documento, fecha, ...) solo se piden del lado 'front'/'single' — el
    // reverso no vuelve a preguntar lo mismo.
    if (type.fields.length > 0 && slot.side !== 'back') {
      this.fieldsFormValues.set({});
      this.fieldsFormFor.set({ type, slot });
      this.pendingUploadFile = file;
      return;
    }
    this.doUpload(type, slot, file);
  }

  setFieldValue(key: string, value: string): void {
    this.fieldsFormValues.update((v) => ({ ...v, [key]: value }));
  }

  confirmFieldsForm(): void {
    const target = this.fieldsFormFor();
    const file = this.pendingUploadFile;
    if (!target || !file) return;

    for (const f of target.type.fields) {
      if (f.required && !this.fieldsFormValues()[f.key]?.trim()) {
        this.toast.error(`Completá el campo "${f.label}"`);
        return;
      }
    }

    this.doUpload(target.type, target.slot, file, this.fieldsFormValues());
    this.fieldsFormFor.set(null);
    this.pendingUploadFile = null;
  }

  cancelFieldsForm(): void {
    this.fieldsFormFor.set(null);
    this.pendingUploadFile = null;
  }

  /** Sube (o reemplaza) un documento en nombre del repartidor — ver DriverDocumentsService.uploadDocument. */
  private async doUpload(
    type: OnboardingDocType,
    slot: OnboardingDocSlot,
    file: File,
    fieldValues?: Record<string, string>,
  ): Promise<void> {
    const key = this.slotKey(type, slot);
    this.uploadingKey.set(key);
    try {
      const state = await this.service.uploadDocument(this.driverId, type.id, slot.side, file, fieldValues);
      this.state.set(state);
      this.toast.success('Documento subido — queda pendiente de revisión');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo subir el documento');
    } finally {
      this.uploadingKey.set(null);
    }
  }

  async review(doc: DriverDocumentFile, status: 'approved' | 'rejected'): Promise<void> {
    let reason: string | undefined;
    if (status === 'rejected') {
      const input = await this.confirm.prompt({
        title: 'Rechazar documento',
        message: 'Motivo del rechazo — el repartidor lo verá en su app para saber qué corregir.',
        placeholder: 'Ej. La foto sale borrosa, volvé a subirla',
        initialValue: doc.reviewReason ?? '',
        confirmLabel: 'Rechazar',
        variant: 'danger',
        icon: 'x-circle',
      });
      if (input === null) return;
      reason = input;
    }

    this.busyDocIds.update((s) => new Set(s).add(doc.id));
    try {
      const { onboarding } = await this.service.reviewDocument(doc.id, status, reason);
      if (onboarding) this.state.set(onboarding);
      this.toast.success(status === 'approved' ? 'Documento aprobado' : 'Documento rechazado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo revisar el documento');
    } finally {
      this.busyDocIds.update((s) => {
        const next = new Set(s);
        next.delete(doc.id);
        return next;
      });
    }
  }

  async approveDriver(force = false): Promise<void> {
    if (force) {
      const ok = await this.confirm.confirm({
        title: 'Forzar aprobación',
        message:
          'Vas a activar la cuenta sin que el onboarding esté completo (capital o documentos pendientes). Úsalo solo si verificaste la información por otra vía.',
        confirmLabel: 'Activar de todas formas',
        variant: 'danger',
      });
      if (!ok) return;
    }

    this.isApproving.set(true);
    try {
      await this.drivers.updateStatus(this.driverId, 'active', undefined, force || undefined);
      this.toast.success('Repartidor aprobado');
      this.approved.emit();
      this.close.emit();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo aprobar el repartidor');
    } finally {
      this.isApproving.set(false);
    }
  }
}
