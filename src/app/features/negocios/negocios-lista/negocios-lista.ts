import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CompaniesService } from '../../../core/services/companies.service';
import { BillingSettingsService } from '../../../core/services/billing-settings.service';
import { Company, CompanyBillingType, Country } from '../../../core/models/company.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { debounce } from '../../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { Icon } from '../../../shared/icon/icon';
import { Pager } from '../../../shared/pager/pager';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { TempPasswordModalService } from '../../../shared/temp-password-modal/temp-password-modal.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BILLING_TYPE_OPTIONS: SelectOption<CompanyBillingType>[] = [
  { value: 'commission', label: 'Comisión sobre ventas' },
  { value: 'fee', label: 'Cuota fija mensual' },
];

@Component({
  selector: 'app-negocios-lista',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, Pager, Select, Skeleton],
  templateUrl: './negocios-lista.html',
  styleUrl: './negocios-lista.scss',
})
export class NegociosLista implements OnInit, OnDestroy {
  private readonly companies = inject(CompaniesService);
  private readonly billingSettings = inject(BillingSettingsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly tempPasswordModal = inject(TempPasswordModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly billingTypeOptions = BILLING_TYPE_OPTIONS;

  /** Solo true antes de la primerísima carga — de ahí en adelante nunca vuelve a taparlo todo (filtros incluidos). */
  readonly isLoading = signal(true);
  /** true durante un refresco por búsqueda/filtro/paginación — solo tapa la lista con esqueleto, filtros y pager se quedan montados. */
  readonly isRefreshing = signal(false);
  readonly items = signal<Company[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly createModalOpen = signal(false);
  readonly createSubmitted = signal(false);
  readonly isCreating = signal(false);
  readonly countryOptions = signal<SelectOption<number>[]>([]);
  createForm: {
    companyName: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    countryId: number | null;
    billingType: CompanyBillingType;
    monthlyFee: number;
    commissionRate: number;
  } = {
    companyName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    countryId: null,
    billingType: 'fee',
    monthlyFee: 0,
    commissionRate: 0,
  };

  search = '';
  private readonly debouncedSearch = debounce(() => {
    this.page.set(1);
    this.reload();
  }, 300);

  async ngOnInit(): Promise<void> {
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.search = getQueryParam(this.route, 'search') ?? '';
    await Promise.all([this.reload(), this.loadCountries()]);
  }

  /** Cancela el debounce pendiente al salir de la pantalla (p.ej. al abrir el detalle de un negocio) —
   * ver el comentario de `debounce()` en core/utils/debounce.ts. */
  ngOnDestroy(): void {
    this.debouncedSearch.cancel();
  }

  async loadCountries(): Promise<void> {
    try {
      const countries = await this.companies.listCountries();
      this.countryOptions.set(countries.map((c: Country) => ({ value: c.id, label: `${c.name} (${c.currencyCode})` })));
    } catch {
      this.toast.error('No se pudieron cargar los países');
    }
  }

  onSearchChange(): void {
    this.debouncedSearch();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  /** `silent`: true para refrescos que no deben mostrar ningún esqueleto (tras crear); el resto pasa por `isRefreshing`. */
  async reload(silent = false): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.search.trim() || null,
    });
    if (!silent) this.isRefreshing.set(true);
    try {
      const { data, meta } = await this.companies.list({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.trim(),
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
    } catch {
      this.toast.error('No se pudieron cargar los negocios');
    } finally {
      if (!silent) this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  isCompanyNameInvalid(): boolean {
    return this.createSubmitted() && !this.createForm.companyName.trim();
  }

  isOwnerNameInvalid(): boolean {
    return this.createSubmitted() && !this.createForm.ownerName.trim();
  }

  isOwnerEmailInvalid(): boolean {
    const email = this.createForm.ownerEmail.trim();
    return this.createSubmitted() && (!email || !EMAIL_PATTERN.test(email));
  }

  async openCreateModal(): Promise<void> {
    if (this.countryOptions().length === 0) {
      await this.loadCountries();
    }
    // Prellena cuota/comisión con el default vigente en Configuraciones > Tipo de pago
    // (el admin puede editarlo antes de crear; una vez creado queda congelado en la empresa).
    let defaultMonthlyFee = 0;
    let defaultCommissionRate = 0;
    try {
      const settings = await this.billingSettings.get();
      defaultMonthlyFee = Number(settings.defaultMonthlyFee);
      defaultCommissionRate = Number(settings.defaultCommissionRate);
    } catch {
      // Si falla, se deja en 0 y el admin lo escribe a mano.
    }
    this.createForm = {
      companyName: '',
      ownerName: '',
      ownerEmail: '',
      ownerPhone: '',
      countryId: this.countryOptions()[0]?.value ?? null,
      billingType: 'commission',
      monthlyFee: defaultMonthlyFee,
      commissionRate: defaultCommissionRate,
    };
    this.createSubmitted.set(false);
    this.createModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
  }

  async createCompany(): Promise<void> {
    this.createSubmitted.set(true);
    const { companyName, ownerName, ownerEmail, ownerPhone, countryId, billingType, monthlyFee, commissionRate } = this.createForm;
    if (!companyName.trim() || !ownerName.trim() || !ownerEmail.trim() || !EMAIL_PATTERN.test(ownerEmail.trim())) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isCreating.set(true);
    try {
      const { tempPassword } = await this.companies.create({
        companyName: companyName.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPhone: ownerPhone.trim() || undefined,
        countryId: countryId ?? undefined,
        billingType,
        monthlyFee: billingType === 'fee' ? monthlyFee : undefined,
        commissionRate: billingType === 'commission' ? commissionRate : undefined,
      });
      this.closeCreateModal();
      this.tempPasswordModal.show({ title: 'Negocio creado', email: ownerEmail.trim(), password: tempPassword });
      this.page.set(1);
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo crear el negocio');
    } finally {
      this.isCreating.set(false);
    }
  }

  isOverdue(company: Company): boolean {
    if (!company.nextPaymentDueDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    return company.nextPaymentDueDate < today;
  }

  async toggleStatus(company: Company): Promise<void> {
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
      const updated = await this.companies.updateStatus(company.id, suspending ? 'suspended' : 'active');
      this.items.update((list) => list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      this.toast.success(suspending ? 'Negocio suspendido' : 'Negocio activado');
    } catch {
      this.toast.error('No se pudo actualizar el negocio');
    }
  }
}
