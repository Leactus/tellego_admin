import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CompaniesService } from '../../../core/services/companies.service';
import { StaffService } from '../../../core/services/staff.service';
import { Company } from '../../../core/models/company.model';
import { StaffMember } from '../../../core/models/store.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { debounce } from '../../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { Icon } from '../../../shared/icon/icon';
import { Pager } from '../../../shared/pager/pager';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PendingActions } from '../../../shared/pending-actions';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cargos comunes en una sucursal de restaurante/delivery — evita que cada quien escriba el suyo a su manera. */
const POSITION_OPTIONS: SelectOption<string>[] = [
  { value: 'Encargado/a de sucursal', label: 'Encargado/a de sucursal' },
  { value: 'Cajero/a', label: 'Cajero/a' },
  { value: 'Cocinero/a', label: 'Cocinero/a' },
  { value: 'Auxiliar de cocina', label: 'Auxiliar de cocina' },
  { value: 'Mesero/a', label: 'Mesero/a' },
  { value: 'Repartidor/a', label: 'Repartidor/a' },
  { value: 'Supervisor/a', label: 'Supervisor/a' },
];

@Component({
  selector: 'app-negocio-personal',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, Pager, Select, Skeleton],
  templateUrl: './negocio-personal.html',
  styleUrl: './negocio-personal.scss',
})
export class NegocioPersonal implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly companiesService = inject(CompaniesService);
  private readonly staffService = inject(StaffService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  private companyId!: number;

  /** Solo true antes de la primerísima carga — de ahí en adelante nunca vuelve a taparlo todo (filtros incluidos). */
  readonly isLoading = signal(true);
  /** true durante un refresco por búsqueda/filtro/paginación — solo tapa la lista con esqueleto, filtros y pager se quedan montados. */
  readonly isRefreshing = signal(false);
  readonly company = signal<Company | null>(null);
  readonly staff = signal<StaffMember[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  searchQuery = '';
  private readonly debouncedSearch = debounce(() => {
    this.page.set(1);
    this.reload();
  }, 300);

  /** Evita doble-click en guardar/borrar/activar. */
  readonly busy = new PendingActions();

  readonly branchOptions = computed<SelectOption[]>(
    () => this.company()?.branches?.map((b) => ({ value: b.id, label: this.branchLabel(b.id) })) ?? [],
  );

  readonly staffModalOpen = signal(false);
  editingStaff: StaffMember | null = null;
  staffForm = {
    name: '',
    email: '',
    password: '',
    phone: '',
    position: '',
    storeId: null as number | null,
  };
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly submitted = signal(false);

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.searchQuery = getQueryParam(this.route, 'search') ?? '';

    this.isLoading.set(true);
    try {
      const company = await this.companiesService.getOne(this.companyId);
      this.company.set(company);
      await this.reload(true);
    } catch {
      this.toast.error('No se pudo cargar el negocio');
    } finally {
      this.isLoading.set(false);
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

  /** `silent`: true para refrescos que no deben mostrar ningún esqueleto (tras guardar/borrar/activar); el resto pasa por `isRefreshing`. */
  async reload(silent = false): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.searchQuery.trim() || null,
    });
    if (!silent) this.isRefreshing.set(true);
    try {
      const staffPage = await this.staffService.list(this.companyId, {
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.searchQuery.trim(),
      });
      this.staff.set(staffPage.data);
      this.totalPages.set(staffPage.meta.totalPages);
      this.total.set(staffPage.meta.total);
    } catch {
      this.toast.error('No se pudo cargar el personal');
    } finally {
      if (!silent) this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  branchLabel(storeId: number): string {
    const branch = this.company()?.branches?.find((b) => b.id === storeId);
    if (!branch) return '—';
    return branch.department ? `${branch.name} (${branch.department})` : branch.name;
  }

  /** Incluye el cargo actual como opción extra si no coincide con la lista predefinida, para no perderlo al editar. */
  get positionOptions(): SelectOption<string>[] {
    const current = this.staffForm.position.trim();
    if (current && !POSITION_OPTIONS.some((o) => o.value === current)) {
      return [{ value: current, label: current }, ...POSITION_OPTIONS];
    }
    return POSITION_OPTIONS;
  }

  isNameInvalid(): boolean {
    return this.submitted() && !this.staffForm.name.trim();
  }

  isStoreInvalid(): boolean {
    return this.submitted() && !this.staffForm.storeId;
  }

  /** true si el correo está vacío o con formato inválido — aplica tanto al crear como al editar. */
  isEmailInvalid(): boolean {
    if (!this.submitted()) return false;
    const email = this.staffForm.email.trim();
    return !email || !EMAIL_PATTERN.test(email);
  }

  /** La contraseña solo es obligatoria al crear — al editar el campo ni siquiera se muestra. */
  isPasswordInvalid(): boolean {
    return this.submitted() && !this.editingStaff && this.staffForm.password.length < 6;
  }

  openNewStaff(): void {
    this.editingStaff = null;
    this.staffForm = {
      name: '',
      email: '',
      password: '',
      phone: '',
      position: '',
      storeId: this.company()?.branches?.[0]?.id ?? null,
    };
    this.submitted.set(false);
    this.staffModalOpen.set(true);
  }

  openEditStaff(member: StaffMember): void {
    this.editingStaff = member;
    this.staffForm = {
      name: member.user?.name ?? '',
      email: member.user?.email ?? '',
      password: '',
      phone: member.user?.phone ?? '',
      position: member.position ?? '',
      storeId: member.storeId,
    };
    this.submitted.set(false);
    this.staffModalOpen.set(true);
  }

  closeStaffModal(): void {
    this.staffModalOpen.set(false);
  }

  async saveStaff(): Promise<void> {
    this.submitted.set(true);
    const name = this.staffForm.name.trim();
    const email = this.staffForm.email.trim();
    const storeId = this.staffForm.storeId;
    const passwordInvalid = !this.editingStaff && this.staffForm.password.length < 6;
    if (!name || !storeId || !email || !EMAIL_PATTERN.test(email) || passwordInvalid) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    await this.busy.run('save-staff', async () => {
      try {
        if (this.editingStaff) {
          await this.staffService.update(this.editingStaff.id, {
            name,
            email,
            phone: this.staffForm.phone.trim() || undefined,
            position: this.staffForm.position.trim() || undefined,
            storeId,
          });
          this.toast.success('Personal actualizado');
        } else {
          await this.staffService.create(this.companyId, {
            name,
            email,
            password: this.staffForm.password,
            phone: this.staffForm.phone.trim() || undefined,
            position: this.staffForm.position.trim() || undefined,
            storeId,
          });
          this.toast.success('Empleado creado');
        }
        this.closeStaffModal();
        await this.reload(true);
      } catch (err) {
        const message = (err as { error?: { message?: string } })?.error?.message;
        this.toast.error(message ?? 'No se pudo guardar el personal');
      }
    });
  }

  async toggleStaffStatus(member: StaffMember): Promise<void> {
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    await this.busy.run(`toggle-staff-${member.id}`, async () => {
      try {
        await this.staffService.update(member.id, { status: nextStatus });
        await this.reload(true);
        this.toast.success(nextStatus === 'active' ? 'Empleado activado' : 'Empleado suspendido');
      } catch {
        this.toast.error('No se pudo actualizar el estado');
      }
    });
  }

  async deleteStaff(member: StaffMember): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Quitar personal',
      message: `${member.user?.name ?? 'Este empleado'} perderá el acceso a su sucursal asignada.`,
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!confirmed) return;

    await this.busy.run(`delete-staff-${member.id}`, async () => {
      try {
        await this.staffService.delete(member.id);
        await this.reload(true);
        this.toast.success('Personal eliminado');
      } catch {
        this.toast.error('No se pudo quitar el personal');
      }
    });
  }
}
