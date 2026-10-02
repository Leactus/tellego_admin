import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DriverPayoutsService } from '../../core/services/driver-payouts.service';
import { BillingSettingsService } from '../../core/services/billing-settings.service';
import {
  DriverPayout,
  PayoutOrder,
  PendingPayoutRow,
  PendingPayouts,
} from '../../core/models/driver-payout.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { formatLongDate, formatShortDate, formatShortDateTime } from '../../core/utils/format-date';
import { Icon } from '../../shared/icon/icon';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Pager } from '../../shared/pager/pager';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';

type Tab = 'pendientes' | 'realizados';

const DOW_OPTIONS: SelectOption[] = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

/** Hoy en hora local del navegador como 'YYYY-MM-DD' (toISOString daría la fecha UTC). */
function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' menos un día — el corte es "antes del lunes", o sea "hasta el domingo". */
function previousDay(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Desembolsos a repartidores FREELANCE: cuánto se le debe a cada uno (pedidos con tarjeta/
 * transferencia: ganancia de envío + propina — el efectivo ya lo cobró él), registrar cada depósito
 * con fecha y monto, y el historial. Se paga una vez por semana (por defecto el lunes, todo lo
 * entregado hasta el domingo). El backend nunca deja pagar dos veces el mismo pedido.
 */
@Component({
  selector: 'app-desembolsos',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Pager, Select, Skeleton],
  templateUrl: './desembolsos.html',
  styleUrl: './desembolsos.scss',
})
export class Desembolsos implements OnInit {
  readonly formatLongDate = formatLongDate;
  readonly formatShortDate = formatShortDate;
  readonly formatShortDateTime = formatShortDateTime;
  readonly previousDay = previousDay;
  readonly dowOptions = DOW_OPTIONS;

  private readonly payouts = inject(DriverPayoutsService);
  private readonly settings = inject(BillingSettingsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly tab = signal<Tab>('pendientes');

  // --- Pendientes ---
  readonly pendingLoading = signal(true);
  readonly pending = signal<PendingPayouts | null>(null);
  readonly readyCount = computed(() => this.pending()?.data.filter((r) => r.ready.amount > 0).length ?? 0);
  readonly missingBankCount = computed(
    () => this.pending()?.data.filter((r) => r.ready.amount > 0 && !r.bankAccount).length ?? 0,
  );

  // --- Realizados ---
  readonly historyLoading = signal(true);
  readonly history = signal<DriverPayout[]>([]);
  readonly historyTotal = signal(0);
  readonly historyAmount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);

  // --- Día de pago ---
  payoutDow = 1;
  readonly savingDow = signal(false);

  // --- Modal: registrar desembolso ---
  readonly payTarget = signal<PendingPayoutRow | null>(null);
  readonly paying = signal(false);
  payForm = { paidAt: todayDateOnly(), reference: '', note: '' };

  // --- Modal: pedidos de un pendiente / de un desembolso ---
  readonly ordersModal = signal<{ title: string; subtitle: string; orders: PayoutOrder[] | null } | null>(null);

  async ngOnInit(): Promise<void> {
    const qpTab = getQueryParam(this.route, 'tab');
    if (qpTab === 'realizados') this.tab.set('realizados');
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    await Promise.all([this.loadPending(), this.loadHistory()]);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.syncUrl();
  }

  private syncUrl(): void {
    syncQueryParams(this.router, this.route, {
      tab: this.tab() === 'realizados' ? 'realizados' : null,
      page: this.tab() === 'realizados' && this.page() > 1 ? this.page() : null,
    });
  }

  async loadPending(): Promise<void> {
    try {
      const data = await this.payouts.listPending();
      this.pending.set(data);
      this.payoutDow = data.schedule.payoutDow;
    } catch {
      this.toast.error('No se pudieron cargar los montos pendientes');
    } finally {
      this.pendingLoading.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    try {
      const res = await this.payouts.list({ page: this.page(), pageSize: this.pageSize() });
      this.history.set(res.data);
      this.historyTotal.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
      this.historyAmount.set(res.totalAmount);
    } catch {
      this.toast.error('No se pudieron cargar los desembolsos realizados');
    } finally {
      this.historyLoading.set(false);
    }
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.syncUrl();
    this.loadHistory();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.syncUrl();
    this.loadHistory();
  }

  async saveDow(): Promise<void> {
    this.savingDow.set(true);
    try {
      await this.settings.update({ driverPayoutDow: Number(this.payoutDow) });
      this.toast.success('Día de pago actualizado');
      await this.loadPending();
    } catch {
      this.toast.error('No se pudo cambiar el día de pago');
    } finally {
      this.savingDow.set(false);
    }
  }

  dowLabel(dow: number): string {
    return (DOW_OPTIONS.find((o) => o.value === dow)?.label ?? 'Lunes').toLowerCase();
  }

  accountTypeLabel(type: 'checking' | 'savings'): string {
    return type === 'checking' ? 'Corriente' : 'Ahorro';
  }

  money(value: number | string): string {
    return `$${Number(value).toFixed(2)}`;
  }

  // --- Registrar desembolso ---

  openPay(row: PendingPayoutRow): void {
    if (row.ready.amount <= 0 || !row.bankAccount) return;
    this.payForm = { paidAt: todayDateOnly(), reference: '', note: '' };
    this.payTarget.set(row);
  }

  closePay(): void {
    if (this.paying()) return;
    this.payTarget.set(null);
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copiado');
    } catch {
      /* el navegador no dejó copiar — no pasa nada */
    }
  }

  async confirmPay(): Promise<void> {
    const row = this.payTarget();
    const schedule = this.pending()?.schedule;
    if (!row || !schedule || this.paying()) return;
    if (!this.payForm.paidAt) {
      this.toast.error('Indica la fecha del depósito');
      return;
    }
    this.paying.set(true);
    try {
      await this.payouts.create({
        driverId: row.driver.id,
        cutoff: schedule.readyCutoff,
        expectedAmount: row.ready.amount,
        paidAt: this.payForm.paidAt,
        reference: this.payForm.reference.trim() || undefined,
        note: this.payForm.note.trim() || undefined,
      });
      this.toast.success(`Desembolso de ${this.money(row.ready.amount)} registrado para ${row.driver.name}`);
      this.payTarget.set(null);
      await Promise.all([this.loadPending(), this.loadHistory()]);
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(message ?? 'No se pudo registrar el desembolso');
      // 409 = el monto cambió o ya se pagó: recargar para que vea lo real.
      await this.loadPending();
    } finally {
      this.paying.set(false);
    }
  }

  // --- Ver pedidos ---

  async openPendingOrders(row: PendingPayoutRow, scope: 'ready' | 'running'): Promise<void> {
    const schedule = this.pending()?.schedule;
    const subtitle =
      scope === 'ready'
        ? `Entregados hasta el ${formatShortDate(previousDay(schedule?.readyCutoff ?? todayDateOnly()))} · ${this.money(row.ready.amount)}`
        : `Semana en curso, se paga el ${formatShortDate(schedule?.nextPayoutDate)} · ${this.money(row.running.amount)}`;
    this.ordersModal.set({ title: row.driver.name, subtitle, orders: null });
    try {
      const res = await this.payouts.listPendingOrders(row.driver.id, scope);
      this.ordersModal.update((m) => (m ? { ...m, orders: res.data } : m));
    } catch {
      this.toast.error('No se pudieron cargar los pedidos');
      this.ordersModal.set(null);
    }
  }

  async openPayoutOrders(payout: DriverPayout): Promise<void> {
    const name = payout.driver?.user?.name ?? `Repartidor #${payout.driverId}`;
    this.ordersModal.set({
      title: name,
      subtitle: `Depositado el ${formatShortDate(payout.paidAt)} · ${this.money(payout.amount)}${payout.reference ? ' · Ref. ' + payout.reference : ''}`,
      orders: null,
    });
    try {
      const full = await this.payouts.get(payout.id);
      this.ordersModal.update((m) => (m ? { ...m, orders: full.orders ?? [] } : m));
    } catch {
      this.toast.error('No se pudo cargar el desembolso');
      this.ordersModal.set(null);
    }
  }

  closeOrders(): void {
    this.ordersModal.set(null);
  }
}
