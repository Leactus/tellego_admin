import { Location } from '@angular/common';
import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../core/config/environment';
import { CompaniesService } from '../../../core/services/companies.service';
import { PaymentsService } from '../../../core/services/payments.service';
import { StoresService } from '../../../core/services/stores.service';
import { BusinessTypesService } from '../../../core/services/business-types.service';
import { SubcategoriesService } from '../../../core/services/subcategories.service';
import { ApayCredencial, Company, CompanyBillingType, CompanySales, Department, PlatformPayment } from '../../../core/models/company.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { formatLongDate } from '../../../core/utils/format-date';
import { addMonthsToDateOnly } from '../../../core/utils/billing';
import { Store, StoreInput } from '../../../core/models/store.model';
import { SubcategoryAvailability } from '../../../core/models/subcategory.model';
import { Icon } from '../../../shared/icon/icon';
import { LocationField } from '../../../shared/location-field/location-field';
import { Pager } from '../../../shared/pager/pager';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { StoreRatingsModal } from '../store-ratings-modal/store-ratings-modal';
import { MultiSelect } from '../../../shared/multi-select/multi-select';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { TempPasswordModalService } from '../../../shared/temp-password-modal/temp-password-modal.service';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';

const METHOD_OPTIONS: SelectOption[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

const BILLING_TYPE_OPTIONS: SelectOption<CompanyBillingType>[] = [
  { value: 'commission', label: 'Comisión sobre ventas' },
  { value: 'fee', label: 'Cuota fija mensual' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tab = 'info' | 'cobro' | 'sucursales' | 'facturacion' | 'pagos';

@Component({
  selector: 'app-negocio-detalle',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, Select, MultiSelect, Pager, LocationField, Skeleton, StoreRatingsModal],
  templateUrl: './negocio-detalle.html',
  styleUrl: './negocio-detalle.scss',
})
export class NegocioDetalle implements OnInit {
  readonly formatLongDate = formatLongDate;

  readonly activeTab = signal<Tab>('info');
  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  /** Vuelve a la página/búsqueda exacta de la que se vino (respeta filtros) en vez de una ruta fija —
   * ver el mismo criterio en query-param-state.ts. */
  goBack(): void {
    this.location.back();
  }

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly companiesService = inject(CompaniesService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly storesService = inject(StoresService);
  private readonly businessTypesService = inject(BusinessTypesService);
  private readonly subcategoriesService = inject(SubcategoriesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly tempPasswordModal = inject(TempPasswordModalService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly methodOptions = METHOD_OPTIONS;
  readonly billingTypeOptions = BILLING_TYPE_OPTIONS;
  readonly isLoading = signal(true);
  readonly company = signal<Company | null>(null);
  readonly isUploadingLogo = signal(false);
  readonly isRemovingLogo = signal(false);
  readonly isUploadingCover = signal(false);
  readonly isRemovingCover = signal(false);
  readonly isSavingOwner = signal(false);
  readonly isResettingPassword = signal(false);
  ownerForm = { name: '', email: '', phone: '' };
  /** true recién después de un intento de "Guardar datos del dueño" fallido — antes de eso no se marca nada en rojo. */
  readonly ownerSubmitted = signal(false);
  readonly apayCredencial = signal<ApayCredencial | null>(null);
  readonly isSavingApay = signal(false);
  readonly revealedApay = signal<{ apayToken: string; apayBusinessId: string | null } | null>(null);
  readonly isRevealingApay = signal(false);
  apayForm = { apayToken: '', apayBusinessId: '' };
  readonly apayModalOpen = signal(false);
  readonly ratingsModalOpen = signal(false);
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly apaySubmitted = signal(false);

  isApayTokenInvalid(): boolean {
    return this.apaySubmitted() && !this.apayForm.apayToken.trim();
  }

  /** Endpoint del webhook de pagos, para pegar en el campo "Endpoint" del perfil de APay del negocio.
   * Fijo por deploy (environment.apiUrl), no depende del negocio — igual que en delivery-pedidos-admin. */
  readonly apayWebhookUrl = `${environment.apiUrl}/apay/webhook`;
  readonly payments = signal<PlatformPayment[]>([]);
  readonly paymentsPage = signal(1);
  readonly paymentsPageSize = signal(DEFAULT_PAGE_SIZE);
  readonly paymentsTotalPages = signal(1);
  readonly paymentsTotal = signal(0);

  billingForm = {
    billingType: 'fee' as CompanyBillingType,
    monthlyFee: 0,
    commissionRate: 0,
    nextPaymentDueDate: '',
    billingStartsAt: '',
    /** null = usa el periodo de gracia general (Configuraciones > Tipo de pago). */
    gracePeriodDays: null as number | null,
    /** Si está en false, esta empresa nunca se bloquea automáticamente por mora. */
    penaltyEnabled: true,
  };
  /** Checkbox "usar override propio" — controla si gracePeriodDays se manda null o un número. */
  useCustomGracePeriod = false;

  readonly paymentModalOpen = signal(false);
  readonly isCalculatingSales = signal(false);
  readonly salesInfo = signal<CompanySales | null>(null);
  paymentForm = { amount: 0, method: 'cash' as 'cash' | 'transfer' | 'card', periodStart: '', periodEnd: '', note: '' };
  /** Solo para cuota fija — con comisión no existe "adelantar", el monto depende de ventas que todavía no pasaron. */
  advanceForm = { months: 1, method: 'cash' as 'cash' | 'transfer' | 'card', note: '' };
  /** true recién después de un intento de "Guardar" fallido en el modal de pago (cualquiera de los dos modos). */
  readonly paymentSubmitted = signal(false);

  readonly storeModalOpen = signal(false);
  readonly isSavingStore = signal(false);
  readonly departmentOptions = signal<SelectOption<number>[]>([]);
  editingStore: Store | null = null;
  storeForm: {
    name: string;
    description: string;
    address: string;
    departmentId: number | null;
    phone: string;
    lat: number | null;
    lng: number | null;
  } = {
    name: '',
    description: '',
    address: '',
    departmentId: null,
    phone: '',
    lat: null,
    lng: null,
  };
  /** true recién después de un intento de "Guardar" fallido en el modal de sucursal. */
  readonly storeSubmitted = signal(false);

  // --- Tipo de negocio y subcategorías: GLOBALES para toda la empresa (companies.businessTypeId),
  // compartidos por todas sus sucursales. Se editan aparte del modal de sucursal (ver template).
  readonly isSavingBusinessType = signal(false);
  readonly businessTypeOptions = signal<SelectOption<number>[]>([]);
  readonly subcategoryOptions = signal<SelectOption<number>[]>([]);
  /** true recién después de un intento de "Guardar tipo de negocio" fallido — antes de eso no se marca nada en rojo. */
  readonly businessTypeSubmitted = signal(false);
  businessTypeForm: { businessTypeId: number | null; subcategoryIds: number[] } = {
    businessTypeId: null,
    subcategoryIds: [],
  };

  // Subcategorías habilitadas para el país de la empresa, de TODOS los tipos
  // de negocio — se filtra por tipo elegido en updateSubcategoryOptions() sin
  // volver a pedirlo al backend cada vez que cambia el tipo.
  private countrySubcategories: SubcategoryAvailability[] = [];

  private companyId!: number;

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    this.paymentsPage.set(getQueryParamNumber(this.route, 'paymentsPage', 1));
    this.paymentsPageSize.set(getQueryParamNumber(this.route, 'paymentsPageSize', DEFAULT_PAGE_SIZE));
    await this.reload();
  }

  async reload(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [company, departments, businessTypes, apayCredencial] = await Promise.all([
        this.companiesService.getOne(this.companyId),
        this.companiesService.listDepartments(this.companyId),
        this.businessTypesService.list(),
        this.companiesService.getApayCredencial(this.companyId),
        this.loadPayments(),
      ]);
      this.company.set(company);
      this.apayCredencial.set(apayCredencial);
      this.departmentOptions.set(departments.map((d: Department) => ({ value: d.id, label: d.name })));
      this.businessTypeOptions.set(
        businessTypes.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.name })),
      );

      this.countrySubcategories = await this.subcategoriesService.listByCountry(company.countryId);
      this.businessTypeForm = {
        businessTypeId: company.businessType?.id ?? null,
        subcategoryIds: company.subcategories?.map((s) => s.id) ?? [],
      };
      this.updateSubcategoryOptions(this.businessTypeForm.businessTypeId);
      this.billingForm = {
        billingType: company.billingType,
        monthlyFee: Number(company.monthlyFee),
        commissionRate: Number(company.commissionRate ?? 0),
        nextPaymentDueDate: company.nextPaymentDueDate ?? '',
        billingStartsAt: company.billingStartsAt ?? '',
        gracePeriodDays: company.gracePeriodDays,
        penaltyEnabled: company.penaltyEnabled,
      };
      this.useCustomGracePeriod = company.gracePeriodDays !== null;
      this.ownerForm = {
        name: company.owner?.name ?? '',
        email: company.owner?.email ?? '',
        phone: company.owner?.phone ?? '',
      };
      this.ownerSubmitted.set(false);
    } catch {
      this.toast.error('No se pudo cargar el negocio');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadPayments(): Promise<void> {
    syncQueryParams(this.router, this.route, {
      paymentsPage: this.paymentsPage() > 1 ? this.paymentsPage() : null,
      paymentsPageSize: this.paymentsPageSize() !== DEFAULT_PAGE_SIZE ? this.paymentsPageSize() : null,
    });
    const { data, meta } = await this.paymentsService.listByCompany(this.companyId, {
      page: this.paymentsPage(),
      pageSize: this.paymentsPageSize(),
    });
    this.payments.set(data);
    this.paymentsTotalPages.set(meta.totalPages);
    this.paymentsTotal.set(meta.total);
  }

  onPaymentsPageChange(page: number): void {
    this.paymentsPage.set(page);
    this.loadPayments();
  }

  onPaymentsPageSizeChange(pageSize: number): void {
    this.paymentsPageSize.set(pageSize);
    this.paymentsPage.set(1);
    this.loadPayments();
  }

  /**
   * Antes de armar el payload, se trae el estado ACTUAL del negocio en la BD — sin esto, el
   * formulario mandaba siempre los 7 campos completos, con los valores que cargó al abrir esta
   * pantalla. Si algo cambió del lado del servidor mientras tanto (ej. un pago vía APay que
   * adelantó next_payment_due_date, ver apay.controller.ts), "Guardar" lo pisaba de vuelta al
   * valor viejo sin que nadie lo pidiera — bastaba con tocar cualquier otro campo (la
   * penalización, el periodo de gracia) para perder ese cambio en silencio. Ahora solo se manda
   * cada campo si de verdad quedó distinto al valor fresco recién leído; lo que no se tocó no
   * viaja en el PATCH y el backend lo deja intacto (ver `!== undefined` en companies.controller.ts).
   */
  async saveBilling(): Promise<void> {
    const form = this.billingForm;
    try {
      const current = await this.companiesService.getOne(this.companyId);

      const nextPaymentDueDate = form.nextPaymentDueDate || null;
      const billingStartsAt = form.billingStartsAt || null;
      const gracePeriodDays = this.useCustomGracePeriod ? form.gracePeriodDays : null;

      const payload = {
        billingType: form.billingType !== current.billingType ? form.billingType : undefined,
        monthlyFee:
          form.billingType === 'fee' && form.monthlyFee !== Number(current.monthlyFee) ? form.monthlyFee : undefined,
        commissionRate:
          form.billingType === 'commission' && form.commissionRate !== Number(current.commissionRate ?? 0)
            ? form.commissionRate
            : undefined,
        nextPaymentDueDate: nextPaymentDueDate !== (current.nextPaymentDueDate ?? null) ? nextPaymentDueDate : undefined,
        billingStartsAt: billingStartsAt !== (current.billingStartsAt ?? null) ? billingStartsAt : undefined,
        gracePeriodDays: gracePeriodDays !== current.gracePeriodDays ? gracePeriodDays : undefined,
        penaltyEnabled: form.penaltyEnabled !== current.penaltyEnabled ? form.penaltyEnabled : undefined,
      };
      const hasChanges = Object.values(payload).some((v) => v !== undefined);
      if (!hasChanges) {
        this.company.set(current);
        this.toast.success('No hay cambios que guardar');
        return;
      }

      const updated = await this.companiesService.updateBilling(this.companyId, payload);
      this.company.set(updated);
      this.billingForm.gracePeriodDays = updated.gracePeriodDays;
      this.useCustomGracePeriod = updated.gracePeriodDays !== null;
      this.toast.success('Facturación actualizada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo actualizar la facturación');
    }
  }

  /** Al desmarcar "usar un periodo de gracia propio", vuelve a usar el general (se manda null al guardar). */
  onToggleCustomGracePeriod(useCustom: boolean): void {
    this.useCustomGracePeriod = useCustom;
    if (useCustom && this.billingForm.gracePeriodDays === null) {
      this.billingForm.gracePeriodDays = 0;
    }
  }

  isOwnerNameInvalid(): boolean {
    return this.ownerSubmitted() && !this.ownerForm.name.trim();
  }

  isOwnerEmailInvalid(): boolean {
    if (!this.ownerSubmitted()) return false;
    const email = this.ownerForm.email.trim();
    return !email || !EMAIL_PATTERN.test(email);
  }

  async saveOwner(): Promise<void> {
    this.ownerSubmitted.set(true);
    const name = this.ownerForm.name.trim();
    const email = this.ownerForm.email.trim();
    if (!name || !email || !EMAIL_PATTERN.test(email)) return;

    this.isSavingOwner.set(true);
    try {
      const owner = await this.companiesService.updateOwner(this.companyId, {
        name,
        email,
        phone: this.ownerForm.phone.trim() || undefined,
      });
      this.company.update((c) => (c ? { ...c, owner } : c));
      this.toast.success('Datos del dueño actualizados');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudieron actualizar los datos del dueño');
    } finally {
      this.isSavingOwner.set(false);
    }
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.isUploadingLogo.set(true);
    try {
      const { logoUrl } = await this.companiesService.uploadLogo(this.companyId, file);
      this.company.update((c) => (c ? { ...c, logoUrl } : c));
      this.toast.success('Logo actualizado');
    } catch {
      this.toast.error('No se pudo subir el logo');
    } finally {
      this.isUploadingLogo.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Quitar logo',
      message: 'El logo del negocio se va a borrar. Se puede subir uno nuevo cuando quieras.',
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!ok) return;

    this.isRemovingLogo.set(true);
    try {
      const { logoUrl } = await this.companiesService.removeLogo(this.companyId);
      this.company.update((c) => (c ? { ...c, logoUrl } : c));
      this.toast.success('Logo quitado');
    } catch {
      this.toast.error('No se pudo quitar el logo');
    } finally {
      this.isRemovingLogo.set(false);
    }
  }

  async onCoverSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.isUploadingCover.set(true);
    try {
      const { coverUrl } = await this.companiesService.uploadCover(this.companyId, file);
      this.company.update((c) => (c ? { ...c, coverUrl } : c));
      this.toast.success('Foto de portada actualizada');
    } catch {
      this.toast.error('No se pudo subir la foto de portada');
    } finally {
      this.isUploadingCover.set(false);
    }
  }

  async removeCover(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Quitar foto de portada',
      message: 'La foto de portada se va a borrar. Se puede subir una nueva cuando quieras.',
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!ok) return;

    this.isRemovingCover.set(true);
    try {
      const { coverUrl } = await this.companiesService.removeCover(this.companyId);
      this.company.update((c) => (c ? { ...c, coverUrl } : c));
      this.toast.success('Foto de portada quitada');
    } catch {
      this.toast.error('No se pudo quitar la foto de portada');
    } finally {
      this.isRemovingCover.set(false);
    }
  }

  async resetOwnerPassword(): Promise<void> {
    const company = this.company();
    if (!company) return;

    const ok = await this.confirm.confirm({
      title: 'Regenerar contraseña',
      message: `Se genera una nueva contraseña temporal para ${company.owner?.name ?? 'el dueño'} — la anterior deja de funcionar. No se puede deshacer.`,
      confirmLabel: 'Regenerar',
      variant: 'danger',
    });
    if (!ok) return;

    this.isResettingPassword.set(true);
    try {
      const tempPassword = await this.companiesService.resetOwnerPassword(this.companyId);
      this.tempPasswordModal.show({
        title: 'Contraseña regenerada',
        email: company.owner?.email ?? '',
        password: tempPassword,
      });
    } catch {
      this.toast.error('No se pudo regenerar la contraseña');
    } finally {
      this.isResettingPassword.set(false);
    }
  }

  openApayModal(): void {
    this.apayForm = { apayToken: '', apayBusinessId: '' };
    this.apaySubmitted.set(false);
    this.apayModalOpen.set(true);
  }

  closeApayModal(): void {
    this.apayModalOpen.set(false);
  }

  /** Guarda un token nuevo (rota el anterior si había uno activo). El ambiente (pruebas/producción) es fijo en el backend, no se pide aquí. */
  async saveApay(): Promise<void> {
    this.apaySubmitted.set(true);
    const apayToken = this.apayForm.apayToken.trim();
    if (!apayToken) return;

    this.isSavingApay.set(true);
    try {
      const credencial = await this.companiesService.saveApayCredencial(this.companyId, {
        apayToken,
        apayBusinessId: this.apayForm.apayBusinessId.trim() || undefined,
      });
      this.apayCredencial.set(credencial);
      this.revealedApay.set(null);
      this.closeApayModal();
      this.toast.success('Credencial APay guardada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la credencial APay');
    } finally {
      this.isSavingApay.set(false);
    }
  }

  /** Alterna entre mostrar el token/id_business completos (consulta explícita al backend) y volver a ocultarlos. */
  async toggleRevealApay(): Promise<void> {
    if (this.revealedApay()) {
      this.revealedApay.set(null);
      return;
    }

    this.isRevealingApay.set(true);
    try {
      const data = await this.companiesService.revealApayCredencial(this.companyId);
      this.revealedApay.set(data);
    } catch {
      this.toast.error('No se pudo revelar la credencial APay');
    } finally {
      this.isRevealingApay.set(false);
    }
  }

  async copyApayWebhookUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.apayWebhookUrl);
      this.toast.success('URL copiada');
    } catch {
      this.toast.error('No se pudo copiar la URL');
    }
  }

  async removeApay(): Promise<void> {
    const credencial = this.apayCredencial();
    if (!credencial) return;

    const ok = await this.confirm.confirm({
      title: 'Quitar credencial APay',
      message: 'El negocio dejará de poder cobrar con tarjeta hasta que se cargue un token nuevo. ¿Confirmas?',
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await this.companiesService.deleteApayCredencial(this.companyId, credencial.id);
      this.apayCredencial.set(null);
      this.revealedApay.set(null);
      this.toast.success('Credencial APay desactivada');
    } catch {
      this.toast.error('No se pudo desactivar la credencial APay');
    }
  }

  async toggleStatus(): Promise<void> {
    const company = this.company();
    if (!company) return;

    const suspending = company.status === 'active';
    const ok = await this.confirm.confirm({
      title: suspending ? 'Suspender negocio' : 'Activar negocio',
      message: suspending
        ? `${company.name} perderá acceso a la plataforma. ¿Confirmas?`
        : `${company.name} recuperará acceso a la plataforma. ¿Confirmas?`,
      variant: suspending ? 'danger' : 'default',
      confirmLabel: suspending ? 'Suspender' : 'Activar',
    });
    if (!ok) return;

    try {
      const updated = await this.companiesService.updateStatus(company.id, suspending ? 'suspended' : 'active');
      this.company.set(updated);
      this.toast.success(suspending ? 'Negocio suspendido' : 'Negocio activado');
    } catch {
      this.toast.error('No se pudo actualizar el negocio');
    }
  }

  /** Aprueba una sucursal 'pending_approval' (auto-registrada por su dueño) sin diálogo de confirmación — mismo patrón sin fricción que repartidores.ts#approve. */
  async approveStore(branch: Store): Promise<void> {
    try {
      const updated = await this.storesService.updateStatus(branch.id, 'active');
      this.patchBranch(updated);
      this.toast.success('Sucursal aprobada');
    } catch {
      this.toast.error('No se pudo aprobar la sucursal');
    }
  }

  /** Suspende/reactiva una sucursal ya aprobada — mismo diálogo de confirmación que toggleStatus (Company) de arriba. */
  async toggleStoreStatus(branch: Store): Promise<void> {
    const suspending = branch.status === 'active';
    const ok = await this.confirm.confirm({
      title: suspending ? 'Suspender sucursal' : 'Activar sucursal',
      message: suspending
        ? `${branch.name} dejará de verse en la app de clientes. ¿Confirmas?`
        : `${branch.name} volverá a verse en la app de clientes. ¿Confirmas?`,
      variant: suspending ? 'danger' : 'default',
      confirmLabel: suspending ? 'Suspender' : 'Activar',
    });
    if (!ok) return;

    try {
      const updated = await this.storesService.updateStatus(branch.id, suspending ? 'suspended' : 'active');
      this.patchBranch(updated);
      this.toast.success(suspending ? 'Sucursal suspendida' : 'Sucursal activada');
    } catch {
      this.toast.error('No se pudo actualizar la sucursal');
    }
  }

  private patchBranch(updated: Store): void {
    const company = this.company();
    if (!company?.branches) return;
    this.company.set({
      ...company,
      branches: company.branches.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
    });
  }

  /** Subcategorías disponibles (habilitadas para el país de la empresa) para el tipo de negocio elegido. */
  private updateSubcategoryOptions(businessTypeId: number | null): void {
    const options = businessTypeId
      ? this.countrySubcategories
          .filter((s) => s.enabled && s.businessTypeId === businessTypeId)
          .map((s) => ({ value: s.id, label: s.name }))
      : [];
    this.subcategoryOptions.set(options);
  }

  /** Al elegir/cambiar el tipo de negocio (solo aplica mientras la empresa no tenga uno asignado): recarga sus subcategorías y limpia la selección anterior. */
  onBusinessTypeChange(businessTypeId: number | null): void {
    this.businessTypeForm.subcategoryIds = [];
    this.updateSubcategoryOptions(businessTypeId);
  }

  async saveBusinessType(): Promise<void> {
    const company = this.company();
    if (!company) return;
    this.businessTypeSubmitted.set(true);
    if (!this.businessTypeForm.businessTypeId) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isSavingBusinessType.set(true);
    try {
      const updated = await this.companiesService.updateBusinessType(this.companyId, {
        businessTypeId: company.businessType ? undefined : this.businessTypeForm.businessTypeId,
        subcategoryIds: this.businessTypeForm.subcategoryIds,
      });
      this.company.set(updated);
      this.toast.success('Tipo de negocio guardado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el tipo de negocio');
    } finally {
      this.isSavingBusinessType.set(false);
    }
  }

  onStoreLatChange(lat: number | null): void {
    this.storeForm.lat = lat;
  }

  onStoreLngChange(lng: number | null): void {
    this.storeForm.lng = lng;
  }

  isStoreNameInvalid(): boolean {
    return this.storeSubmitted() && !this.storeForm.name.trim();
  }

  openNewStoreModal(): void {
    this.editingStore = null;
    this.storeForm = {
      name: '',
      description: '',
      address: '',
      departmentId: null,
      phone: '',
      lat: null,
      lng: null,
    };
    this.storeSubmitted.set(false);
    this.storeModalOpen.set(true);
  }

  openEditStoreModal(store: Store): void {
    this.editingStore = store;
    this.storeForm = {
      name: store.name,
      description: store.description ?? '',
      address: store.address ?? '',
      departmentId: store.departmentId,
      phone: store.phone ?? '',
      lat: store.lat,
      lng: store.lng,
    };
    this.storeSubmitted.set(false);
    this.storeModalOpen.set(true);
  }

  closeStoreModal(): void {
    this.storeModalOpen.set(false);
  }

  async saveStore(): Promise<void> {
    this.storeSubmitted.set(true);
    const name = this.storeForm.name.trim();
    if (!name) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }
    if ((this.storeForm.lat === null) !== (this.storeForm.lng === null)) {
      this.toast.error('Debes completar tanto la latitud como la longitud');
      return;
    }

    this.isSavingStore.set(true);
    try {
      const input: StoreInput = {
        name,
        description: this.storeForm.description.trim(),
        address: this.storeForm.address.trim(),
        departmentId: this.storeForm.departmentId,
        phone: this.storeForm.phone.trim(),
        lat: this.storeForm.lat,
        lng: this.storeForm.lng,
      };
      if (this.editingStore) {
        await this.storesService.update(this.editingStore.id, input);
        this.toast.success('Sucursal actualizada');
      } else {
        await this.storesService.create(this.companyId, input);
        this.toast.success('Sucursal creada');
      }
      this.closeStoreModal();
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la sucursal');
    } finally {
      this.isSavingStore.set(false);
    }
  }

  openPaymentModal(): void {
    const company = this.company();
    const today = new Date().toISOString().slice(0, 10);
    this.salesInfo.set(null);
    if (company?.billingType === 'commission') {
      // Periodo por defecto: desde el fin del último pago registrado (o desde que arrancó
      // la facturación si no hay pagos aún) hasta hoy — el admin puede ajustarlo.
      const periodStart = this.payments()[0]?.periodEnd ?? company.billingStartsAt ?? today;
      this.paymentForm = { amount: 0, method: 'cash', periodStart, periodEnd: today, note: '' };
      // Con el periodo por defecto ya calculado, se sugiere el monto de una vez — el admin no
      // tiene que acordarse de darle a "Calcular desde ventas" antes de poder guardar.
      this.calculateFromSales();
    } else {
      this.advanceForm = { months: 1, method: 'cash', note: '' };
    }
    this.paymentSubmitted.set(false);
    this.paymentModalOpen.set(true);
  }

  /** Recalcula automáticamente al tocar cualquiera de las dos fechas del periodo — el admin ya no
   * tiene que darle a "Calcular desde ventas" de nuevo cada vez que ajusta el rango. */
  onPaymentPeriodChange(): void {
    this.calculateFromSales();
  }

  closePaymentModal(): void {
    this.paymentModalOpen.set(false);
  }

  /** Punto de partida de los meses a adelantar: el próximo pago pendiente de la empresa (o hoy si nunca ha pagado). */
  private advanceStartDate(company: Company): string {
    return company.nextPaymentDueDate ?? company.billingStartsAt ?? new Date().toISOString().slice(0, 10);
  }

  /** Total a pagar por los meses elegidos — solo vista previa, el backend calcula el monto real. */
  advanceTotal(): number {
    const company = this.company();
    if (!company) return 0;
    return Number(company.monthlyFee) * (this.advanceForm.months || 0);
  }

  /** Hasta cuándo queda cubierto el negocio tras este adelanto — solo vista previa. */
  advanceNextDueDate(): string {
    const company = this.company();
    if (!company) return '';
    return addMonthsToDateOnly(this.advanceStartDate(company), this.advanceForm.months || 0);
  }

  /** Suma las ventas reales del periodo (todas las sucursales) y sugiere el monto = ventas × % de comisión. */
  async calculateFromSales(): Promise<void> {
    const { periodStart, periodEnd } = this.paymentForm;
    if (!periodStart || !periodEnd) return;

    this.isCalculatingSales.set(true);
    try {
      const sales = await this.companiesService.getSales(this.companyId, periodStart, periodEnd);
      this.salesInfo.set(sales);
      this.paymentForm.amount = sales.suggestedAmount;
      // Deja constancia del cálculo en el historial, sin pisar una nota que el admin ya haya escrito a mano.
      if (!this.paymentForm.note.trim()) {
        this.paymentForm.note = `Comisión ${sales.commissionRate}% sobre $${sales.totalSales} en ventas`;
      }
    } catch {
      this.toast.error('No se pudieron calcular las ventas del periodo');
    } finally {
      this.isCalculatingSales.set(false);
    }
  }

  isPaymentAmountInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.amount;
  }

  isPaymentPeriodStartInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.periodStart;
  }

  isPaymentPeriodEndInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.periodEnd;
  }

  isAdvanceMonthsInvalid(): boolean {
    return this.paymentSubmitted() && (!this.advanceForm.months || this.advanceForm.months < 1);
  }

  async savePayment(): Promise<void> {
    this.paymentSubmitted.set(true);
    if (!this.paymentForm.amount || !this.paymentForm.periodStart || !this.paymentForm.periodEnd) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    try {
      const { company } = await this.paymentsService.create(this.companyId, this.paymentForm);
      this.company.set(company);
      this.paymentsPage.set(1);
      await this.loadPayments();
      this.closePaymentModal();
      this.toast.success('Pago registrado');
    } catch {
      this.toast.error('No se pudo registrar el pago');
    }
  }

  async saveAdvancePayment(): Promise<void> {
    this.paymentSubmitted.set(true);
    if (!this.advanceForm.months || this.advanceForm.months < 1) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    try {
      const { company, totalAmount } = await this.paymentsService.createAdvance(this.companyId, this.advanceForm);
      this.company.set(company);
      this.paymentsPage.set(1);
      await this.loadPayments();
      this.closePaymentModal();
      this.toast.success(`${this.advanceForm.months} pago(s) registrado(s) por $${totalAmount.toFixed(2)}`);
    } catch {
      this.toast.error('No se pudo registrar el adelanto');
    }
  }
}
