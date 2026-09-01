import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CompaniesService } from '../../core/services/companies.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { Company } from '../../core/models/company.model';
import {
  AdminNotification,
  NotificationType,
  ScheduledNotification,
  ScheduleFrequency,
  SendResult,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_LONG,
} from '../../core/models/notification.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { debounce } from '../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { Icon } from '../../shared/icon/icon';
import { MultiSelect } from '../../shared/multi-select/multi-select';
import { Pager } from '../../shared/pager/pager';
import { scrollToFirstInvalid } from '../../shared/scroll-to-invalid';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';

const TYPE_OPTIONS: SelectOption[] = [
  { value: 'pago', label: 'Pago' },
  { value: 'update', label: 'Actualización' },
  { value: 'novedad', label: 'Novedad' },
  { value: 'aviso', label: 'Aviso' },
];

const FREQUENCY_OPTIONS: SelectOption<ScheduleFrequency>[] = [
  { value: 'once', label: 'Una sola vez' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Días de la semana' },
];

const TYPE_LABELS: Record<NotificationType, string> = {
  pago: 'Pago',
  update: 'Actualización',
  novedad: 'Novedad',
  aviso: 'Aviso',
};

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [FormsModule, Icon, Select, MultiSelect, Pager, Skeleton],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.scss',
})
export class Notificaciones implements OnInit, OnDestroy {
  private readonly companiesService = inject(CompaniesService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly typeOptions = TYPE_OPTIONS;
  readonly frequencyOptions = FREQUENCY_OPTIONS;
  readonly typeLabels = TYPE_LABELS;
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly isSending = signal(false);
  readonly isLoadingHistory = signal(true);
  readonly isRefreshingHistory = signal(false);
  readonly composeModalOpen = signal(false);
  readonly composeSubmitted = signal(false);
  readonly companies = signal<Company[]>([]);
  readonly isSearchingCompanies = signal(false);
  readonly history = signal<AdminNotification[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly scheduled = signal<ScheduledNotification[]>([]);
  readonly isLoadingScheduled = signal(true);
  readonly togglingScheduledId = signal<number | null>(null);

  readonly companyOptions = computed<SelectOption<number>[]>(() =>
    this.companies().map((c) => ({ value: c.id, label: c.name })),
  );

  form: {
    title: string;
    body: string;
    type: NotificationType;
    sendToAll: boolean;
    companyIds: number[];
    when: 'now' | 'schedule';
    frequency: ScheduleFrequency;
    runDate: string;
    timeOfDay: string;
    daysOfWeek: number[];
  } = this.blankForm();

  private blankForm() {
    return {
      title: '',
      body: '',
      type: 'aviso' as NotificationType,
      sendToAll: true,
      companyIds: [] as number[],
      when: 'now' as 'now' | 'schedule',
      frequency: 'once' as ScheduleFrequency,
      runDate: '',
      timeOfDay: '09:00',
      daysOfWeek: [] as number[],
    };
  }

  historySearch = '';
  private readonly debouncedHistorySearch = debounce(() => {
    this.page.set(1);
    this.loadHistory();
  }, 300);

  ngOnDestroy(): void {
    this.debouncedHistorySearch.cancel();
  }

  async ngOnInit(): Promise<void> {
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.historySearch = getQueryParam(this.route, 'search') ?? '';
    await Promise.all([this.loadCompanies(), this.loadHistory(), this.loadScheduled()]);
  }

  onHistorySearchChange(): void {
    this.debouncedHistorySearch();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadHistory();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.loadHistory();
  }

  /** El filtro de 'pago' aplica SIEMPRE (broadcast o negocios elegidos) — el aviso solo llega a quien de verdad debe. */
  get isPagoFiltered(): boolean {
    return this.form.type === 'pago';
  }

  isTitleInvalid(): boolean {
    return this.composeSubmitted() && !this.form.title.trim();
  }

  isBodyInvalid(): boolean {
    return this.composeSubmitted() && !this.form.body.trim();
  }

  isCompanyIdsInvalid(): boolean {
    return this.composeSubmitted() && !this.form.sendToAll && this.form.companyIds.length === 0;
  }

  isRunDateInvalid(): boolean {
    return (
      this.composeSubmitted() &&
      this.form.when === 'schedule' &&
      this.form.frequency === 'once' &&
      !this.form.runDate
    );
  }

  isTimeInvalid(): boolean {
    return this.composeSubmitted() && this.form.when === 'schedule' && !this.form.timeOfDay;
  }

  isDaysInvalid(): boolean {
    return (
      this.composeSubmitted() &&
      this.form.when === 'schedule' &&
      this.form.frequency === 'weekly' &&
      this.form.daysOfWeek.length === 0
    );
  }

  toggleWeekday(day: number): void {
    const set = new Set(this.form.daysOfWeek);
    set.has(day) ? set.delete(day) : set.add(day);
    this.form.daysOfWeek = [...set].sort((a, b) => a - b);
  }

  openComposeModal(): void {
    this.form = this.blankForm();
    this.composeSubmitted.set(false);
    this.composeModalOpen.set(true);
  }

  closeComposeModal(): void {
    this.composeModalOpen.set(false);
  }

  async loadCompanies(query = ''): Promise<void> {
    this.isSearchingCompanies.set(true);
    try {
      const { data } = await this.companiesService.list({ pageSize: DEFAULT_PAGE_SIZE, search: query || undefined });
      this.companies.set(data);
    } catch {
      this.toast.error('No se pudieron cargar los negocios');
    } finally {
      this.isSearchingCompanies.set(false);
    }
  }

  async loadHistory(silent = false): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.historySearch.trim() || null,
    });
    if (!silent) this.isRefreshingHistory.set(true);
    try {
      const { data, meta } = await this.notificationsService.listSent({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.historySearch.trim(),
      });
      this.history.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
    } catch {
      this.toast.error('No se pudo cargar el historial de notificaciones');
    } finally {
      if (!silent) this.isRefreshingHistory.set(false);
      this.isLoadingHistory.set(false);
    }
  }

  async loadScheduled(): Promise<void> {
    try {
      this.scheduled.set(await this.notificationsService.listScheduled());
    } catch {
      this.toast.error('No se pudieron cargar las notificaciones programadas');
    } finally {
      this.isLoadingScheduled.set(false);
    }
  }

  /** "Todos los sábados y lunes · 09:00", "Todos los días · 08:00", "Una vez · 10/09/2026 09:00". */
  scheduleSummary(s: ScheduledNotification): string {
    const time = s.timeOfDay ?? '';
    if (s.frequency === 'daily') return `Todos los días · ${time}`;
    if (s.frequency === 'weekly') {
      const days = (s.daysOfWeek ?? []).map((d) => WEEKDAY_LABELS_LONG[d]);
      const list =
        days.length <= 1 ? days.join('') : days.slice(0, -1).join(', ') + ' y ' + days[days.length - 1];
      return `Todos los ${list} · ${time}`;
    }
    const date = s.runDate ? new Date(`${s.runDate}T00:00:00`).toLocaleDateString('es') : '';
    return `Una vez · ${date} ${time}`;
  }

  formatNextRun(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  }

  async toggleScheduledActive(s: ScheduledNotification): Promise<void> {
    this.togglingScheduledId.set(s.id);
    try {
      const updated = await this.notificationsService.setScheduledActive(s.id, !s.isActive);
      this.scheduled.update((list) => list.map((x) => (x.id === s.id ? updated : x)));
      this.toast.success(updated.isActive ? 'Notificación reanudada' : 'Notificación pausada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo actualizar la notificación programada');
    } finally {
      this.togglingScheduledId.set(null);
    }
  }

  async deleteScheduled(s: ScheduledNotification): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Eliminar notificación programada',
      message: `"${s.title}" dejará de enviarse. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.notificationsService.deleteScheduled(s.id);
      this.scheduled.update((list) => list.filter((x) => x.id !== s.id));
      this.toast.success('Notificación programada eliminada');
    } catch {
      this.toast.error('No se pudo eliminar la notificación programada');
    }
  }

  async send(): Promise<void> {
    this.composeSubmitted.set(true);
    const title = this.form.title.trim();
    const body = this.form.body.trim();
    if (!title || !body) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }
    if (!this.form.sendToAll && this.form.companyIds.length === 0) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    if (this.form.when === 'schedule') {
      if (
        this.isTimeInvalid() ||
        (this.form.frequency === 'once' && !this.form.runDate) ||
        (this.form.frequency === 'weekly' && this.form.daysOfWeek.length === 0)
      ) {
        scrollToFirstInvalid(this.elementRef.nativeElement);
        return;
      }

      this.isSending.set(true);
      try {
        await this.notificationsService.createScheduled({
          title,
          body,
          type: this.form.type,
          audience: this.form.sendToAll ? 'all' : 'companies',
          companyIds: this.form.sendToAll ? undefined : this.form.companyIds,
          frequency: this.form.frequency,
          runDate: this.form.frequency === 'once' ? this.form.runDate : null,
          timeOfDay: this.form.timeOfDay,
          daysOfWeek: this.form.frequency === 'weekly' ? this.form.daysOfWeek : null,
        });
        this.toast.success('Notificación programada creada');
        this.closeComposeModal();
        await this.loadScheduled();
      } catch (err: any) {
        this.toast.error(err?.error?.message ?? 'No se pudo programar la notificación');
      } finally {
        this.isSending.set(false);
      }
      return;
    }

    this.isSending.set(true);
    try {
      const result = await this.notificationsService.send({
        title,
        body,
        type: this.form.type,
        companyIds: this.form.sendToAll ? undefined : this.form.companyIds,
      });
      this.toast.success(this.sendSummary(result));
      this.closeComposeModal();
      this.page.set(1);
      await this.loadHistory();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo enviar la notificación');
    } finally {
      this.isSending.set(false);
    }
  }

  /** Texto del toast tras un envío inmediato: incluye a cuántos llegó y, si es 'pago', a cuántos se omitió y por qué. */
  private sendSummary(result: SendResult): string {
    const base = `Notificación enviada a ${result.sentTo} negocio(s)`;
    const s = result.skipped;
    if (!s || s.total === 0) return base;
    const parts: string[] = [];
    if (s.alDia) parts.push(`${s.alDia} al día`);
    if (s.sinFacturar) parts.push(`${s.sinFacturar} sin facturar aún`);
    if (s.sinVentas) parts.push(`${s.sinVentas} sin comisión pendiente`);
    if (s.suspendido) parts.push(`${s.suspendido} suspendido(s)`);
    return `${base}. Se omitieron ${s.total}: ${parts.join(', ')}.`;
  }

  async runDueNow(): Promise<void> {
    try {
      const { dispatched } = await this.notificationsService.runDueScheduled();
      this.toast.success(
        dispatched > 0 ? `${dispatched} notificación(es) programada(s) enviada(s)` : 'No había ninguna pendiente',
      );
      await Promise.all([this.loadScheduled(), this.loadHistory(true)]);
    } catch {
      this.toast.error('No se pudieron ejecutar las notificaciones pendientes');
    }
  }
}
