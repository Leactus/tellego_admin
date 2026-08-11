import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MultiSelect } from '../../../shared/multi-select/multi-select';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { TempPasswordModalService } from '../../../shared/temp-password-modal/temp-password-modal.service';

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

@Component({
  selector: 'app-negocio-detalle',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, Select, MultiSelect, Pager, LocationField, Skeleton],
  templateUrl: './negocio-detalle.html',
  styleUrl: './negocio-detalle.scss',
})
export class NegocioDetalle implements OnInit {
  readonly formatLongDate = formatLongDate;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly companiesService = inject(CompaniesService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly storesService = inject(StoresService);
  private readonly businessTypesService = inject(BusinessTypesService);
  private readonly subcategoriesService = inject(SubcategoriesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly tempPasswordModal = inject(TempPasswordModalService);

  readonly methodOptions = METHOD_OPTIONS;
  readonly billingTypeOptions = BILLING_TYPE_OPTIONS;
  readonly isLoading = signal(true);
  readonly company = signal<Company | null>(null);
  readonly isSavingOwner = signal(false);
  readonly isResettingPassword = signal(false);
  ownerForm = { name: '', email: '', phone: '' };
  readonly apayCredencial = signal<ApayCredencial | null>(null);
  readonly isSavingApay = signal(false);
  apayForm = { apayToken: '', apayBusinessId: '' };
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

  // --- Tipo de negocio y subcategorías: GLOBALES para toda la empresa (companies.businessTypeId),
  // compartidos por todas sus sucursales. Se editan aparte del modal de sucursal (ver template).
  readonly isSavingBusinessType = signal(false);
  readonly businessTypeOptions = signal<SelectOption<number>[]>([]);
  readonly subcategoryOptions = signal<SelectOption<number>[]>([]);
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

  async saveBilling(): Promise<void> {
    const form = this.billingForm;
    try {
      const updated = await this.companiesService.updateBilling(this.companyId, {
        billingType: form.billingType,
        monthlyFee: form.billingType === 'fee' ? form.monthlyFee : undefined,
        commissionRate: form.billingType === 'commission' ? form.commissionRate : undefined,
        nextPaymentDueDate: form.nextPaymentDueDate || null,
        billingStartsAt: form.billingStartsAt || null,
        gracePeriodDays: this.useCustomGracePeriod ? form.gracePeriodDays : null,
        penaltyEnabled: form.penaltyEnabled,
      });
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

  isOwnerEmailInvalid(): boolean {
    const email = this.ownerForm.email.trim();
    return email.length > 0 && !EMAIL_PATTERN.test(email);
  }

  async saveOwner(): Promise<void> {
    const name = this.ownerForm.name.trim();
    const email = this.ownerForm.email.trim();
    if (!name || !email) return;
    if (!EMAIL_PATTERN.test(email)) {
      this.toast.error('Ingresa un correo electrónico válido');
      return;
    }

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

  /** Guarda un token nuevo (rota el anterior si había uno activo). El ambiente (pruebas/producción) es fijo en el backend, no se pide aquí. */
  async saveApay(): Promise<void> {
    const apayToken = this.apayForm.apayToken.trim();
    if (!apayToken) {
      this.toast.error('Ingresa el token de la cuenta APay');
      return;
    }

    this.isSavingApay.set(true);
    try {
      const credencial = await this.companiesService.saveApayCredencial(this.companyId, {
        apayToken,
        apayBusinessId: this.apayForm.apayBusinessId.trim() || undefined,
      });
      this.apayCredencial.set(credencial);
      this.apayForm = { apayToken: '', apayBusinessId: '' };
      this.toast.success('Credencial APay guardada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la credencial APay');
    } finally {
      this.isSavingApay.set(false);
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
    if (!this.businessTypeForm.businessTypeId) {
      this.toast.error('Elige un tipo de negocio');
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
    this.storeModalOpen.set(true);
  }

  closeStoreModal(): void {
    this.storeModalOpen.set(false);
  }

  async saveStore(): Promise<void> {
    const name = this.storeForm.name.trim();
    if (!name) return;
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
    } else {
      this.advanceForm = { months: 1, method: 'cash', note: '' };
    }
    this.paymentModalOpen.set(true);
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

  async savePayment(): Promise<void> {
    if (!this.paymentForm.amount || !this.paymentForm.periodStart || !this.paymentForm.periodEnd) return;

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
    if (!this.advanceForm.months || this.advanceForm.months < 1) return;

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
