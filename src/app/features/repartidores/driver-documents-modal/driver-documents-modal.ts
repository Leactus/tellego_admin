import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

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
  imports: [DatePipe, Icon, Skeleton],
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

  async review(doc: DriverDocumentFile, status: 'approved' | 'rejected'): Promise<void> {
    let reason: string | undefined;
    if (status === 'rejected') {
      const input = window.prompt(
        'Motivo del rechazo — el repartidor lo verá en su app para saber qué corregir.',
        doc.reviewReason ?? '',
      );
      if (input === null) return;
      if (!input.trim()) {
        this.toast.error('Indica el motivo del rechazo');
        return;
      }
      reason = input.trim();
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
