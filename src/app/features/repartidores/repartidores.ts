import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DriversService, DriverStatusFilter } from '../../core/services/drivers.service';
import { CompaniesService } from '../../core/services/companies.service';
import { Driver } from '../../core/models/driver.model';
import { Country } from '../../core/models/company.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { Select, SelectOption } from '../../shared/select/select';
import { debounce } from '../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { Icon } from '../../shared/icon/icon';
import { Pager } from '../../shared/pager/pager';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';
import { TempPasswordModalService } from '../../shared/temp-password-modal/temp-password-modal.service';
import { scrollToFirstInvalid } from '../../shared/scroll-to-invalid';
import { DriverRatingsModal } from './driver-ratings-modal/driver-ratings-modal';
import { DriverDocumentsModal } from './driver-documents-modal/driver-documents-modal';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-repartidores',
  standalone: true,
  imports: [DatePipe, FormsModule, Icon, Pager, Select, Skeleton, DriverRatingsModal, DriverDocumentsModal],
  templateUrl: './repartidores.html',
  styleUrl: './repartidores.scss',
})
export class Repartidores implements OnInit, OnDestroy {
  private readonly drivers = inject(DriversService);
  private readonly companiesService = inject(CompaniesService);
  private readonly toast = inject(ToastService);
  private readonly tempPasswordModal = inject(TempPasswordModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** Solo true antes de la primerísima carga — de ahí en adelante nunca vuelve a taparlo todo (filtros incluidos). */
  readonly isLoading = signal(true);
  /** true durante un refresco por búsqueda/filtro/paginación — solo tapa la lista con esqueleto, filtros y pager se quedan montados. */
  readonly isRefreshing = signal(false);
  readonly items = signal<Driver[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  /** Pestaña de estado. 'active' es el default: los que se crean desde este panel entran activos;
   * solo los que se registran solos por la app caen en 'pending'. Se refleja en la URL (?estado=) para
   * que un refresh (F5) no reinicie la vista. */
  readonly tab = signal<DriverStatusFilter>('active');
  readonly statusCounts = signal({ active: 0, pending: 0, suspended: 0 });
  readonly tabs: { value: DriverStatusFilter; label: string }[] = [
    { value: 'active', label: 'Activos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'suspended', label: 'Suspendidos' },
  ];

  readonly ratingsDriverId = signal<number | null>(null);
  readonly ratingsDriverName = signal('');

  openRatings(driver: Driver): void {
    this.ratingsDriverName.set(driver.User?.name ?? 'Repartidor');
    this.ratingsDriverId.set(driver.id);
  }

  closeRatings(): void {
    this.ratingsDriverId.set(null);
  }

  readonly docsDriverId = signal<number | null>(null);
  readonly docsDriverName = signal('');

  openDocs(driver: Driver): void {
    this.docsDriverName.set(driver.User?.name ?? 'Repartidor');
    this.docsDriverId.set(driver.id);
  }

  closeDocs(): void {
    this.docsDriverId.set(null);
  }

  /** El repartidor pasó a 'active' desde el modal de documentos: refrescar lista + contadores. */
  async onDriverApproved(): Promise<void> {
    this.tab.set('active');
    this.page.set(1);
    await this.reload(true);
  }

  readonly formModalOpen = signal(false);
  readonly isSaving = signal(false);
  editingDriver: Driver | null = null;
  form = {
    name: '',
    email: '',
    phone: '',
    vehicleType: '',
    plateNumber: '',
    licenseNumber: '',
    countryId: null as number | null,
  };
  readonly countries = signal<Country[]>([]);

  get countryOptions(): SelectOption<number | null>[] {
    return [{ value: null, label: 'Sin país' }, ...this.countries().map((c) => ({ value: c.id, label: c.name }))];
  }
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly formSubmitted = signal(false);

  isNameInvalid(): boolean {
    return this.formSubmitted() && !this.form.name.trim();
  }

  /** El correo solo es obligatorio al crear — al editar el campo ni siquiera se muestra. */
  isEmailInvalid(): boolean {
    if (!this.formSubmitted() || this.editingDriver) return false;
    const email = this.form.email.trim();
    return !email || !EMAIL_PATTERN.test(email);
  }

  readonly suspendModalOpen = signal(false);
  readonly isSuspending = signal(false);
  suspendingDriver: Driver | null = null;
  /** Días de suspensión desde ahora; vacío = indefinida (ver DriverSuspension.service.ts en el backend). */
  suspendDays: number | null = null;

  search = '';
  private readonly debouncedSearch = debounce(() => {
    this.page.set(1);
    this.reload();
  }, 300);

  async ngOnInit(): Promise<void> {
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.search = getQueryParam(this.route, 'search') ?? '';
    const tab = getQueryParam(this.route, 'estado') as DriverStatusFilter | null;
    if (tab && this.tabs.some((t) => t.value === tab)) this.tab.set(tab);
    this.companiesService
      .listCountries()
      .then((c) => this.countries.set(c))
      .catch(() => undefined);
    await this.reload();
  }

  /** Cambiar de pestaña es un filtro nuevo: siempre vuelve a la página 1. */
  setTab(tab: DriverStatusFilter): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.page.set(1);
    this.reload();
  }

  /** Cancela el debounce pendiente al salir de la pantalla — ver el comentario de `debounce()` en
   * core/utils/debounce.ts. */
  ngOnDestroy(): void {
    this.debouncedSearch.cancel();
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

  /** `silent`: true para refrescos que no deben mostrar ningún esqueleto (tras crear/editar); el resto pasa por `isRefreshing`. */
  async reload(silent = false): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.search.trim() || null,
      estado: this.tab() !== 'active' ? this.tab() : null,
    });
    if (!silent) this.isRefreshing.set(true);
    try {
      const { data, meta, statusCounts } = await this.drivers.list({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.trim(),
        status: this.tab(),
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
      this.statusCounts.set(statusCounts);
    } catch {
      this.toast.error('No se pudieron cargar los repartidores');
    } finally {
      if (!silent) this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  openNewModal(): void {
    this.editingDriver = null;
    this.form = {
      name: '',
      email: '',
      phone: '',
      vehicleType: '',
      plateNumber: '',
      licenseNumber: '',
      countryId: this.countries()[0]?.id ?? null,
    };
    this.formSubmitted.set(false);
    this.formModalOpen.set(true);
  }

  openEditModal(driver: Driver): void {
    this.editingDriver = driver;
    this.form = {
      name: driver.User?.name ?? '',
      email: driver.User?.email ?? '',
      phone: driver.User?.phone ?? '',
      vehicleType: driver.vehicleType ?? '',
      plateNumber: driver.plateNumber ?? '',
      licenseNumber: driver.licenseNumber ?? '',
      countryId: driver.countryId ?? null,
    };
    this.formSubmitted.set(false);
    this.formModalOpen.set(true);
  }

  closeFormModal(): void {
    this.formModalOpen.set(false);
  }

  async saveDriver(): Promise<void> {
    this.formSubmitted.set(true);
    const name = this.form.name.trim();
    const email = this.form.email.trim();
    if (!name || (!this.editingDriver && (!email || !EMAIL_PATTERN.test(email)))) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isSaving.set(true);
    try {
      if (this.editingDriver) {
        await this.drivers.update(this.editingDriver.id, {
          name,
          phone: this.form.phone.trim(),
          vehicleType: this.form.vehicleType.trim(),
          plateNumber: this.form.plateNumber.trim(),
          licenseNumber: this.form.licenseNumber.trim(),
          countryId: this.form.countryId,
        });
        this.closeFormModal();
        this.toast.success('Repartidor actualizado');
      } else {
        const { tempPassword } = await this.drivers.create({
          name,
          email,
          phone: this.form.phone.trim(),
          vehicleType: this.form.vehicleType.trim(),
          plateNumber: this.form.plateNumber.trim(),
          licenseNumber: this.form.licenseNumber.trim(),
          countryId: this.form.countryId,
        });
        this.closeFormModal();
        this.tempPasswordModal.show({ title: 'Repartidor creado', email, password: tempPassword });
        // Se crea activo — asegura que la pestaña actual lo muestre.
        this.tab.set('active');
      }
      this.page.set(1);
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el repartidor');
    } finally {
      this.isSaving.set(false);
    }
  }

  async approve(driver: Driver): Promise<void> {
    try {
      await this.drivers.updateStatus(driver.id, 'active');
      this.toast.success('Repartidor aprobado');
      // Cambia de estado: sale de "Pendientes" y entra en "Activos" — se recarga para que
      // la lista y los contadores de las pestañas queden al día.
      await this.reload(true);
    } catch {
      this.toast.error('No se pudo aprobar el repartidor');
    }
  }

  openSuspendModal(driver: Driver): void {
    this.suspendingDriver = driver;
    this.suspendDays = null;
    this.suspendModalOpen.set(true);
  }

  closeSuspendModal(): void {
    this.suspendModalOpen.set(false);
  }

  async confirmSuspend(): Promise<void> {
    const driver = this.suspendingDriver;
    if (!driver) return;

    this.isSuspending.set(true);
    try {
      await this.drivers.updateStatus(driver.id, 'suspended', this.suspendDays ?? undefined);
      this.toast.success('Repartidor suspendido');
      this.closeSuspendModal();
      await this.reload(true);
    } catch {
      this.toast.error('No se pudo suspender el repartidor');
    } finally {
      this.isSuspending.set(false);
    }
  }
}
