import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { CompaniesService } from '../../../core/services/companies.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { Company } from '../../../core/models/company.model';
import { Store } from '../../../core/models/store.model';
import { StoreScheduleDay } from '../../../core/models/schedule.model';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';

interface DayForm {
  dayOfWeek: number;
  label: string;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
}

/** Lunes(1) .. Domingo(0), orden natural de semana para la UI (el backend usa 0=domingo..6=sábado). */
const DAY_ORDER: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: 'Lunes' },
  { dayOfWeek: 2, label: 'Martes' },
  { dayOfWeek: 3, label: 'Miércoles' },
  { dayOfWeek: 4, label: 'Jueves' },
  { dayOfWeek: 5, label: 'Viernes' },
  { dayOfWeek: 6, label: 'Sábado' },
  { dayOfWeek: 0, label: 'Domingo' },
];

/** A partir de cuántas sucursales (ya filtradas) se virtualiza la lista de destinos. */
const VIRTUAL_SCROLL_THRESHOLD = 20;

function toInputTime(value: string | null): string {
  return value ? value.slice(0, 5) : '';
}

@Component({
  selector: 'app-negocio-horario',
  standalone: true,
  imports: [FormsModule, ScrollingModule, Select, Skeleton],
  templateUrl: './negocio-horario.html',
  styleUrl: './negocio-horario.scss',
})
export class NegocioHorario implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly companiesService = inject(CompaniesService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);

  /** Vuelve a la página/pestaña exacta de la que se vino (respeta filtros/paginación) en vez de una
   * ruta fija — ver el mismo criterio en query-param-state.ts. */
  goBack(): void {
    this.location.back();
  }

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isCopying = signal(false);
  readonly company = signal<Company | null>(null);
  readonly selectedStoreId = signal<number | null>(null);
  readonly days = signal<DayForm[]>([]);

  readonly storeOptions = computed<SelectOption[]>(
    () => this.company()?.branches?.map((b) => ({ value: b.id, label: b.department ? `${b.name} (${b.department})` : b.name })) ?? [],
  );

  /** Todas las sucursales de la empresa, para el panel "Copiar a otras sucursales". */
  readonly allBranches = computed<Store[]>(() => this.company()?.branches ?? []);
  readonly selectedTargetIds = signal<Set<number>>(new Set());
  readonly branchSearchQuery = signal('');

  readonly showBranchSearch = computed(() => this.allBranches().length > 1);

  readonly filteredBranches = computed(() => {
    const query = this.branchSearchQuery().trim().toLowerCase();
    if (!query) return this.allBranches();
    return this.allBranches().filter(
      (b) => b.name.toLowerCase().includes(query) || (b.department ?? '').toLowerCase().includes(query),
    );
  });

  readonly useVirtualScroll = computed(() => this.filteredBranches().length > VIRTUAL_SCROLL_THRESHOLD);

  readonly allFilteredSelected = computed(() => {
    const visible = this.filteredBranches();
    return visible.length > 0 && visible.every((b) => this.selectedTargetIds().has(b.id));
  });

  private companyId!: number;

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    this.isLoading.set(true);
    try {
      const company = await this.companiesService.getOne(this.companyId);
      this.company.set(company);
      const firstStoreId = company.branches?.[0]?.id ?? null;
      this.selectedStoreId.set(firstStoreId);
      if (firstStoreId) await this.loadSchedule(firstStoreId);
    } catch {
      this.toast.error('No se pudo cargar el negocio');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onStoreChange(storeId: number): Promise<void> {
    this.selectedStoreId.set(storeId);
    this.selectedTargetIds.set(new Set());
    this.branchSearchQuery.set('');
    await this.loadSchedule(storeId);
  }

  async loadSchedule(storeId: number): Promise<void> {
    try {
      const schedule = await this.scheduleService.get(storeId);
      this.days.set(this.toForm(schedule));
    } catch {
      this.toast.error('No se pudo cargar el horario');
    }
  }

  private toForm(schedule: StoreScheduleDay[]): DayForm[] {
    const byDay = new Map(schedule.map((d) => [d.dayOfWeek, d]));
    return DAY_ORDER.map(({ dayOfWeek, label }) => {
      const row = byDay.get(dayOfWeek);
      return {
        dayOfWeek,
        label,
        isClosed: row?.isClosed ?? true,
        openTime: toInputTime(row?.openTime ?? null),
        closeTime: toInputTime(row?.closeTime ?? null),
      };
    });
  }

  copyToAll(source: DayForm): void {
    this.days.update((days) =>
      days.map((d) => ({ ...d, isClosed: source.isClosed, openTime: source.openTime, closeTime: source.closeTime })),
    );
  }

  trackByBranchId(_index: number, branch: Store): number {
    return branch.id;
  }

  isTargetSelected(storeId: number): boolean {
    return this.selectedTargetIds().has(storeId);
  }

  toggleTarget(storeId: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedTargetIds.update((set) => {
      const next = new Set(set);
      if (checked) next.add(storeId);
      else next.delete(storeId);
      return next;
    });
  }

  /** Selecciona o quita todas las sucursales actualmente visibles (respeta el filtro de búsqueda). */
  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const visibleIds = this.filteredBranches().map((b) => b.id);
    this.selectedTargetIds.update((set) => {
      const next = new Set(set);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** null = válido; si no, el mensaje de error a mostrar. */
  private validateDays(): string | null {
    for (const d of this.days()) {
      if (d.isClosed) continue;
      if (!d.openTime || !d.closeTime) return `Completa la hora de apertura y cierre de ${d.label}`;
      if (d.closeTime <= d.openTime) return `En ${d.label}, la hora de cierre debe ser después de la hora de apertura`;
    }
    return null;
  }

  private buildSchedulePayload(): StoreScheduleDay[] {
    return this.days().map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isClosed: d.isClosed,
      openTime: d.isClosed ? null : d.openTime,
      closeTime: d.isClosed ? null : d.closeTime,
    }));
  }

  /** Copia SIEMPRE lo que está en pantalla ahora mismo: guarda esta sucursal primero y recién entonces copia, para no arrastrar un horario viejo si hay cambios sin guardar. */
  async copyToBranches(): Promise<void> {
    const storeId = this.selectedStoreId();
    const targetIds = [...this.selectedTargetIds()];
    if (!storeId || targetIds.length === 0) return;

    const error = this.validateDays();
    if (error) {
      this.toast.error(error);
      return;
    }

    const names = this.allBranches()
      .filter((b) => targetIds.includes(b.id))
      .map((b) => b.name)
      .join(', ');

    const confirmed = await this.confirmService.confirm({
      title: 'Copiar horario',
      message: `Se guardan tus cambios en esta sucursal y se reemplaza el horario de: ${names}. No se puede deshacer.`,
      confirmLabel: 'Copiar',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.isCopying.set(true);
    try {
      const updated = await this.scheduleService.update(storeId, this.buildSchedulePayload());
      this.days.set(this.toForm(updated));
      await this.scheduleService.copyToBranches(storeId, targetIds);
      this.selectedTargetIds.set(new Set());
      this.toast.success('Horario guardado y copiado');
    } catch {
      this.toast.error('No se pudo copiar el horario');
    } finally {
      this.isCopying.set(false);
    }
  }

  async save(): Promise<void> {
    const storeId = this.selectedStoreId();
    if (!storeId) return;

    const error = this.validateDays();
    if (error) {
      this.toast.error(error);
      return;
    }

    this.isSaving.set(true);
    try {
      const updated = await this.scheduleService.update(storeId, this.buildSchedulePayload());
      this.days.set(this.toForm(updated));
      this.toast.success('Horario guardado');
    } catch {
      this.toast.error('No se pudo guardar el horario');
    } finally {
      this.isSaving.set(false);
    }
  }
}
