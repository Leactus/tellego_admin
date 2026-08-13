import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DriversService } from '../../core/services/drivers.service';
import { Driver } from '../../core/models/driver.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { debounce } from '../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { Icon } from '../../shared/icon/icon';
import { Pager } from '../../shared/pager/pager';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';
import { TempPasswordModalService } from '../../shared/temp-password-modal/temp-password-modal.service';

@Component({
  selector: 'app-repartidores',
  standalone: true,
  imports: [DatePipe, FormsModule, Icon, Pager, Skeleton],
  templateUrl: './repartidores.html',
  styleUrl: './repartidores.scss',
})
export class Repartidores implements OnInit {
  private readonly drivers = inject(DriversService);
  private readonly toast = inject(ToastService);
  private readonly tempPasswordModal = inject(TempPasswordModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly items = signal<Driver[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly formModalOpen = signal(false);
  readonly isSaving = signal(false);
  editingDriver: Driver | null = null;
  form = { name: '', email: '', phone: '', vehicleType: '', plateNumber: '', licenseNumber: '' };

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
    await this.reload();
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

  async reload(): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.search.trim() || null,
    });
    this.isLoading.set(true);
    try {
      const { data, meta } = await this.drivers.list({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.trim(),
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
    } catch {
      this.toast.error('No se pudieron cargar los repartidores');
    } finally {
      this.isLoading.set(false);
    }
  }

  openNewModal(): void {
    this.editingDriver = null;
    this.form = { name: '', email: '', phone: '', vehicleType: '', plateNumber: '', licenseNumber: '' };
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
    };
    this.formModalOpen.set(true);
  }

  closeFormModal(): void {
    this.formModalOpen.set(false);
  }

  async saveDriver(): Promise<void> {
    const name = this.form.name.trim();
    if (!name) return;

    this.isSaving.set(true);
    try {
      if (this.editingDriver) {
        await this.drivers.update(this.editingDriver.id, {
          name,
          phone: this.form.phone.trim(),
          vehicleType: this.form.vehicleType.trim(),
          plateNumber: this.form.plateNumber.trim(),
          licenseNumber: this.form.licenseNumber.trim(),
        });
        this.closeFormModal();
        this.toast.success('Repartidor actualizado');
      } else {
        const email = this.form.email.trim();
        if (!email) return;
        const { tempPassword } = await this.drivers.create({
          name,
          email,
          phone: this.form.phone.trim(),
          vehicleType: this.form.vehicleType.trim(),
          plateNumber: this.form.plateNumber.trim(),
          licenseNumber: this.form.licenseNumber.trim(),
        });
        this.closeFormModal();
        this.tempPasswordModal.show({ title: 'Repartidor creado', email, password: tempPassword });
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
      const updated = await this.drivers.updateStatus(driver.id, 'active');
      this.items.update((list) => list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
      this.toast.success('Repartidor aprobado');
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
      const updated = await this.drivers.updateStatus(driver.id, 'suspended', this.suspendDays ?? undefined);
      this.items.update((list) => list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
      this.toast.success('Repartidor suspendido');
      this.closeSuspendModal();
    } catch {
      this.toast.error('No se pudo suspender el repartidor');
    } finally {
      this.isSuspending.set(false);
    }
  }
}
