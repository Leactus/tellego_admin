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
  DriverDocumentFieldFormat,
  DriverDocumentFieldType,
  DriverDocumentPhotoSource,
  DriverDocumentType,
  DriverProfileField,
} from '../../../core/models/driver-onboarding.model';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
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
  /** '' = texto libre. */
  format: DriverDocumentFieldFormat | '';
  /** Autollenar leyendo la foto del frente (solo type='text'). */
  ocr: boolean;
  ocrPattern: string;
  ocrAfterLabel: string;
  /** '' = no se copia al perfil. */
  profileField: DriverProfileField | '';
}

function emptyFieldRow(): FieldRow {
  return { label: '', type: 'text', required: true, optionsText: '', format: '', ocr: false, ocrPattern: '', ocrAfterLabel: '', profileField: '' };
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
  imports: [FormsModule, Icon, EmptyState, Select, Skeleton],
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
  readonly photoSourceOptions: SelectOption<DriverDocumentPhotoSource>[] = [
    { value: 'camera_or_gallery', label: 'Cámara o galería' },
    { value: 'camera', label: 'Solo cámara' },
    { value: 'gallery', label: 'Solo galería' },
  ];
  readonly fieldTypeOptions: SelectOption<DriverDocumentFieldType>[] = [
    { value: 'text', label: 'Texto' },
    { value: 'date', label: 'Fecha' },
    { value: 'select', label: 'Lista de opciones' },
  ];
  readonly profileFieldOptions: SelectOption<DriverProfileField | ''>[] = [
    { value: '', label: 'No guardar en el perfil' },
    { value: 'duiNumber', label: 'Nº de DUI' },
    { value: 'licenseNumber', label: 'Nº de licencia' },
    { value: 'drivingPermitNumber', label: 'Nº de permiso de conducir' },
  ];
  readonly fieldFormatOptions: SelectOption<DriverDocumentFieldFormat | ''>[] = [
    { value: '', label: 'Texto libre' },
    { value: 'dui', label: 'Número de DUI' },
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
    photoSource: 'camera_or_gallery' as DriverDocumentPhotoSource,
    isRequired: true,
    isActive: true,
    autoValidate: false,
    validationKeywords: '',
    validationRegex: '',
    validationKeywordsBack: '',
    validationRegexBack: '',
    useCameraFrame: false,
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

  hasOcrFields(t: DriverDocumentType): boolean {
    return (t.fields ?? []).some((f) => f.ocr != null);
  }

  acceptsLabel(accepts: DriverDocumentAccepts): string {
    return this.acceptsOptions.find((o) => o.value === accepts)?.label ?? accepts;
  }

  photoSourceLabel(source: DriverDocumentPhotoSource): string {
    return this.photoSourceOptions.find((o) => o.value === source)?.label ?? source;
  }

  /**
   * Validar con OCR = solo foto de cámara: una imagen de galería o un PDF se
   * saltarían la validación. El backend lo fuerza igual; aquí se refleja en el
   * formulario para que el admin lo vea.
   */
  onAutoValidateChange(): void {
    if (!this.form.autoValidate) return;
    this.form.accepts = 'image';
    this.form.photoSource = 'camera';
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
    this.fields.push(emptyFieldRow());
  }

  /** Autollenado sin patrón ni texto de referencia: solo un campo DUI sabe qué buscar. */
  isOcrIncomplete(f: FieldRow): boolean {
    return f.type === 'text' && f.ocr && f.format !== 'dui' && !f.ocrPattern.trim() && !f.ocrAfterLabel.trim();
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
      if (f.type === 'text') {
        if (f.format) def.format = f.format;
        if (f.profileField) def.profileField = f.profileField;
        if (f.ocr) {
          def.ocr = {};
          if (f.ocrPattern.trim()) def.ocr.pattern = f.ocrPattern.trim();
          if (f.ocrAfterLabel.trim()) def.ocr.afterLabel = f.ocrAfterLabel.trim();
        }
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
      photoSource: 'camera_or_gallery',
      isRequired: true,
      isActive: true,
      autoValidate: false,
      validationKeywords: '',
      validationRegex: '',
      validationKeywordsBack: '',
      validationRegexBack: '',
      useCameraFrame: false,
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
      photoSource: type.photoSource ?? 'camera_or_gallery',
      isRequired: type.isRequired,
      isActive: type.isActive,
      autoValidate: type.autoValidate || false,
      validationKeywords: type.validationKeywords || '',
      validationRegex: type.validationRegex || '',
      validationKeywordsBack: type.validationKeywordsBack || '',
      validationRegexBack: type.validationRegexBack || '',
      useCameraFrame: type.useCameraFrame || false,
      sortOrder: type.sortOrder,
    };
    this.fields = (type.fields ?? []).map((f) => ({
      label: f.label,
      type: f.type,
      required: f.required ?? false,
      optionsText: (f.options ?? []).join(', '),
      format: f.format ?? '',
      ocr: f.ocr != null,
      ocrPattern: f.ocr?.pattern ?? '',
      ocrAfterLabel: f.ocr?.afterLabel ?? '',
      profileField: f.profileField ?? '',
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
    const profileTargets = this.fields.filter((f) => f.label.trim() && f.type === 'text' && f.profileField);
    if (new Set(profileTargets.map((f) => f.profileField)).size !== profileTargets.length) {
      this.toast.error('Dos campos se guardan en el mismo dato del perfil');
      return;
    }
    if (profileTargets.some((f) => f.profileField === 'duiNumber' && f.format !== 'dui')) {
      this.toast.error('Para guardarlo como DUI del perfil, el formato del campo debe ser "Número de DUI"');
      return;
    }
    if (this.fields.some((f) => f.label.trim() && this.isOcrIncomplete(f))) {
      this.toast.error('Para autollenar con OCR indica un patrón o el texto que va antes del dato');
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
      accepts: this.form.autoValidate ? 'image' : this.form.accepts,
      photoSource: this.form.autoValidate ? 'camera' : this.form.photoSource,
      fields: this.fieldsToPayload(),
      isRequired: this.form.isRequired,
      isActive: this.form.isActive,
      autoValidate: this.form.autoValidate,
      validationKeywords: this.form.validationKeywords.trim() || null,
      validationRegex: this.form.validationRegex.trim() || null,
      // Reglas del reverso: solo tienen sentido con frente y reverso.
      validationKeywordsBack: this.form.twoSided ? this.form.validationKeywordsBack.trim() || null : null,
      validationRegexBack: this.form.twoSided ? this.form.validationRegexBack.trim() || null : null,
      useCameraFrame: this.form.useCameraFrame,
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
