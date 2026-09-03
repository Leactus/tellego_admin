import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DriverDocumentsService } from '../../../core/services/driver-documents.service';
import { BillingSettingsService } from '../../../core/services/billing-settings.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { Country } from '../../../core/models/company.model';
import {
  CountryDriverSettings,
  DriverDocumentAccepts,
  DriverDocumentFieldDef,
  DriverDocumentFieldType,
  DriverDocumentType,
} from '../../../core/models/driver-onboarding.model';
import { Icon } from '../../../shared/icon/icon';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

/** Valor especial del selector de país = documentos globales (country_id NULL). */
const GLOBAL = 'global';
type Scope = number | typeof GLOBAL;

interface FieldRow {
  label: string;
  type: DriverDocumentFieldType;
  required: boolean;
  optionsText: string;
}

/**
 * Configuraciones > Documentos de repartidor: la plataforma opera en varios
 * países y cada uno tiene su "reglamento" — su lista de documentos y su
 * capital mínimo. Un documento global (country_id NULL) se pide en todos los
 * países. Cada documento puede pedir campos extra (nº de documento, fecha de
 * vencimiento, ...).
 */
@Component({
  selector: 'app-documentos-repartidor',
  standalone: true,
  imports: [FormsModule, Icon, Select, Skeleton],
  templateUrl: './documentos-repartidor.html',
  styleUrl: './documentos-repartidor.scss',
})
export class DocumentosRepartidor implements OnInit {
  private readonly service = inject(DriverDocumentsService);
  private readonly billingSettings = inject(BillingSettingsService);
  private readonly companies = inject(CompaniesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly isLoading = signal(true);
  readonly countries = signal<Country[]>([]);
  scope: Scope = GLOBAL;

  readonly types = signal<DriverDocumentType[]>([]);

  // Capital
  readonly isSavingCapital = signal(false);
  /** Solo cuando scope = país: settings de ese país. */
  readonly countrySettings = signal<CountryDriverSettings | null>(null);
  /** scope global: el valor de platform_settings.driver_min_capital. */
  globalMinCapital = 50;
  /** input del formulario (país o global según scope). */
  capitalInput = 50;
  useGlobalCapital = false;

  readonly acceptsOptions: SelectOption<DriverDocumentAccepts>[] = [
    { value: 'image', label: 'Solo foto' },
    { value: 'pdf', label: 'Solo PDF' },
    { value: 'image_or_pdf', label: 'Foto o PDF' },
  ];
  readonly fieldTypeOptions: SelectOption<DriverDocumentFieldType>[] = [
    { value: 'text', label: 'Texto' },
    { value: 'date', label: 'Fecha' },
    { value: 'select', label: 'Lista de opciones' },
  ];

  get scopeOptions(): SelectOption<Scope>[] {
    return [
      { value: GLOBAL, label: 'Global (todos los países)' },
      ...this.countries().map((c) => ({ value: c.id as Scope, label: c.name })),
    ];
  }

  get currencySymbol(): string {
    if (this.scope === GLOBAL) return '$';
    return this.countries().find((c) => c.id === this.scope)?.currencySymbol ?? '$';
  }

  get scopeName(): string {
    if (this.scope === GLOBAL) return 'Global (todos los países)';
    return this.countries().find((c) => c.id === this.scope)?.name ?? 'País';
  }

  // Modal
  readonly modalOpen = signal(false);
  readonly isSaving = signal(false);
  readonly submitted = signal(false);
  editing: DriverDocumentType | null = null;
  form = {
    label: '',
    description: '',
    twoSided: false,
    accepts: 'image' as DriverDocumentAccepts,
    isRequired: true,
    isActive: true,
    sortOrder: 0,
  };
  fields: FieldRow[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const [countries, settings] = await Promise.all([
        this.companies.listCountries(),
        this.billingSettings.get(),
      ]);
      this.countries.set(countries);
      this.globalMinCapital = Number(settings.driverMinCapital);
      this.scope = countries[0]?.id ?? GLOBAL;
      await this.reload();
    } catch {
      this.toast.error('No se pudo cargar la configuración de repartidores');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onScopeChange(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    const countryId = this.scope === GLOBAL ? null : this.scope;
    try {
      this.types.set(await this.service.listTypes(countryId));
      if (countryId == null) {
        this.countrySettings.set(null);
        this.capitalInput = this.globalMinCapital;
        this.useGlobalCapital = false;
      } else {
        const cs = await this.service.getCountrySettings(countryId);
        this.countrySettings.set(cs);
        this.useGlobalCapital = !cs.isOverride;
        this.capitalInput = cs.minCapital;
      }
    } catch {
      this.toast.error('No se pudieron cargar los documentos');
    }
  }

  scopeLabel(t: DriverDocumentType): string {
    return t.countryId == null ? 'Global' : (t.country?.name ?? 'País');
  }

  acceptsLabel(accepts: DriverDocumentAccepts): string {
    return this.acceptsOptions.find((o) => o.value === accepts)?.label ?? accepts;
  }

  async saveCapital(): Promise<void> {
    this.isSavingCapital.set(true);
    try {
      if (this.scope === GLOBAL) {
        if (this.capitalInput < 0) throw new Error('negativo');
        const settings = await this.billingSettings.update({ driverMinCapital: this.capitalInput });
        this.globalMinCapital = Number(settings.driverMinCapital);
        this.capitalInput = this.globalMinCapital;
      } else {
        const cs = await this.service.setCountrySettings(
          this.scope,
          this.useGlobalCapital ? null : this.capitalInput,
        );
        this.countrySettings.set(cs);
        this.useGlobalCapital = !cs.isOverride;
        this.capitalInput = cs.minCapital;
      }
      this.toast.success('Capital mínimo actualizado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el capital mínimo');
    } finally {
      this.isSavingCapital.set(false);
    }
  }

  // --- Documentos ---

  addField(): void {
    this.fields.push({ label: '', type: 'text', required: true, optionsText: '' });
  }

  removeField(i: number): void {
    this.fields.splice(i, 1);
  }

  private fieldsToPayload(): DriverDocumentFieldDef[] | null {
    const out: DriverDocumentFieldDef[] = [];
    for (const f of this.fields) {
      if (!f.label.trim()) continue;
      const def: DriverDocumentFieldDef = { key: '', label: f.label.trim(), type: f.type, required: f.required };
      if (f.type === 'select') {
        def.options = f.optionsText
          .split(/[\n,]/)
          .map((o) => o.trim())
          .filter(Boolean);
      }
      out.push(def);
    }
    return out.length ? out : null;
  }

  openNew(): void {
    this.editing = null;
    this.form = {
      label: '',
      description: '',
      twoSided: false,
      accepts: 'image',
      isRequired: true,
      isActive: true,
      sortOrder: this.types().length,
    };
    this.fields = [];
    this.submitted.set(false);
    this.modalOpen.set(true);
  }

  openEdit(type: DriverDocumentType): void {
    this.editing = type;
    this.form = {
      label: type.label,
      description: type.description ?? '',
      twoSided: type.twoSided,
      accepts: type.accepts,
      isRequired: type.isRequired,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
    };
    this.fields = (type.fields ?? []).map((f) => ({
      label: f.label,
      type: f.type,
      required: f.required ?? false,
      optionsText: (f.options ?? []).join(', '),
    }));
    this.submitted.set(false);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  isLabelInvalid(): boolean {
    return this.submitted() && !this.form.label.trim();
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (!this.form.label.trim()) return;
    if (this.fields.some((f) => f.type === 'select' && f.label.trim() && !f.optionsText.trim())) {
      this.toast.error('Cada campo de tipo lista necesita al menos una opción');
      return;
    }

    this.isSaving.set(true);
    const payload = {
      // Al crear: el documento hereda el país del selector (o global). Al editar
      // no se mueve de país.
      ...(this.editing ? {} : { countryId: this.scope === GLOBAL ? null : this.scope }),
      label: this.form.label.trim(),
      description: this.form.description.trim() || null,
      twoSided: this.form.twoSided,
      accepts: this.form.accepts,
      fields: this.fieldsToPayload(),
      isRequired: this.form.isRequired,
      isActive: this.form.isActive,
      sortOrder: Number(this.form.sortOrder) || 0,
    };
    try {
      if (this.editing) {
        await this.service.updateType(this.editing.id, payload);
        this.toast.success('Documento actualizado');
      } else {
        await this.service.createType(payload);
        this.toast.success('Documento agregado');
      }
      await this.reload();
      this.closeModal();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el documento');
    } finally {
      this.isSaving.set(false);
    }
  }

  async remove(type: DriverDocumentType): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Quitar documento',
      message: `"${type.label}" dejará de pedirse a los repartidores nuevos. Los archivos ya subidos por repartidores actuales se conservan.`,
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.service.removeType(type.id);
      await this.reload();
      this.toast.success('Documento quitado');
    } catch {
      this.toast.error('No se pudo quitar el documento');
    }
  }
}
