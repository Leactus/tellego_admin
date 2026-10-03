import { Location, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CompaniesService } from '../../../core/services/companies.service';
import { CompanyDriverTipsService } from '../../../core/services/company-driver-tips.service';
import { Company } from '../../../core/models/company.model';
import { DriverTipOrder, DriverTipPayout, DriverTipsBoard, DriverTipsRow } from '../../../core/models/driver-tips.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { formatShortDate, formatShortDateTime } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Pager } from '../../../shared/pager/pager';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { ToastService } from '../../../shared/toast/toast.service';

type Tab = 'pendientes' | 'pagos';

interface OrdersModal {
  title: string;
  subtitle: string;
  /** null = cargando. */
  orders: DriverTipOrder[] | null;
}

/**
 * Propinas de los repartidores PROPIOS de un negocio, vistas por el super-admin — SOLO LECTURA,
 * para revisar reclamos ("el negocio no me paga las propinas"). Muestra lo mismo que el negocio
 * ve en su panel (delivery-pedidos-admin > Propinas de repartidores): lo que debe a cada
 * repartidor, su cuenta bancaria, cuánto le pagó ya y el detalle de cada pago con sus pedidos.
 * Las propinas de repartidores freelance las paga la plataforma (Desembolsos), no salen acá.
 */
@Component({
  selector: 'app-negocio-propinas',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, Icon, EmptyState, Pager, Select, Skeleton, UserAvatar],
  templateUrl: './negocio-propinas.html',
  styleUrl: './negocio-propinas.scss',
})
export class NegocioPropinas implements OnInit {
  readonly formatShortDate = formatShortDate;
  readonly formatShortDateTime = formatShortDateTime;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly companiesService = inject(CompaniesService);
  private readonly tipsService = inject(CompanyDriverTipsService);
  private readonly toast = inject(ToastService);

  private companyId!: number;

  readonly company = signal<Company | null>(null);
  readonly tab = signal<Tab>('pendientes');

  readonly boardLoading = signal(true);
  readonly board = signal<DriverTipsBoard | null>(null);

  readonly historyLoading = signal(true);
  readonly history = signal<DriverTipPayout[]>([]);
  readonly historyTotal = signal(0);
  readonly historyAmount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);

  readonly ordersModal = signal<OrdersModal | null>(null);

  /** null = todas las sucursales del negocio. */
  storeFilter: number | null = null;

  readonly branches = computed(() => this.company()?.branches ?? []);
  readonly showStoreFilter = computed(() => this.branches().length > 1);
  readonly storeFilterOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Todas las sucursales' },
    ...this.branches().map((b) => ({ value: b.id, label: b.department ? `${b.name} (${b.department})` : b.name })),
  ]);

  readonly withPending = computed(() => (this.board()?.data ?? []).filter((r) => r.pending.tips > 0));
  readonly withoutPending = computed(() => (this.board()?.data ?? []).filter((r) => r.pending.tips <= 0));

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    this.tab.set(getQueryParam(this.route, 'tab') === 'pagos' ? 'pagos' : 'pendientes');
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    const storeParam = getQueryParam(this.route, 'storeId');
    this.storeFilter = storeParam ? Number(storeParam) : null;

    try {
      const company = await this.companiesService.getOne(this.companyId);
      this.company.set(company);
      if (this.storeFilter !== null && !company.branches?.some((b) => b.id === this.storeFilter)) {
        this.storeFilter = null;
      }
    } catch {
      this.toast.error('No se pudo cargar el negocio');
    }
    await Promise.all([this.loadBoard(), this.loadHistory()]);
  }

  goBack(): void {
    this.location.back();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.syncUrl();
  }

  onStoreChange(): void {
    this.page.set(1);
    this.syncUrl();
    this.boardLoading.set(true);
    this.historyLoading.set(true);
    this.loadBoard();
    this.loadHistory();
  }

  private syncUrl(): void {
    syncQueryParams(this.router, this.route, {
      tab: this.tab() === 'pagos' ? 'pagos' : null,
      storeId: this.storeFilter,
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
    });
  }

  async loadBoard(): Promise<void> {
    try {
      this.board.set(await this.tipsService.getBoard(this.companyId, this.storeFilter));
    } catch {
      this.toast.error('No se pudieron cargar las propinas del negocio');
    } finally {
      this.boardLoading.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    try {
      const res = await this.tipsService.listPayouts(this.companyId, this.storeFilter, this.page(), this.pageSize());
      this.history.set(res.data);
      this.historyTotal.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
      this.historyAmount.set(res.totalAmount);
    } catch {
      this.toast.error('No se pudo cargar el historial de pagos');
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

  money(value: number | string): string {
    return `$${Number(value).toFixed(2)}`;
  }

  accountTypeLabel(type: 'checking' | 'savings'): string {
    return type === 'checking' ? 'Corriente' : 'Ahorro';
  }

  last4(accountNumber: string): string {
    return accountNumber.slice(-4);
  }

  typeLabel(type: string): string {
    return type === 'propio' ? 'Repartidor propio' : 'Ex-freelance';
  }

  async openPendingOrders(row: DriverTipsRow): Promise<void> {
    this.ordersModal.set({
      title: row.driver.name,
      subtitle: `Propinas pendientes · ${this.money(row.pending.tips)} en ${row.pending.count} pedido(s)`,
      orders: null,
    });
    try {
      const orders = await this.tipsService.listPendingOrders(
        this.companyId,
        row.driver.id,
        this.storeFilter,
        this.board()?.asOf,
      );
      this.ordersModal.update((m) => (m ? { ...m, orders } : m));
    } catch {
      this.toast.error('No se pudieron cargar los pedidos');
      this.ordersModal.set(null);
    }
  }

  async openPayoutOrders(payout: DriverTipPayout): Promise<void> {
    this.ordersModal.set({
      title: payout.driver?.user?.name ?? `Repartidor #${payout.driverId}`,
      subtitle: `Pagado el ${formatShortDate(payout.paidAt)} · ${this.money(payout.amount)}${payout.reference ? ' · Ref. ' + payout.reference : ''}`,
      orders: null,
    });
    try {
      const orders = await this.tipsService.listPayoutOrders(this.companyId, payout.id, this.storeFilter);
      this.ordersModal.update((m) => (m ? { ...m, orders } : m));
    } catch {
      this.toast.error('No se pudieron cargar los pedidos de este pago');
      this.ordersModal.set(null);
    }
  }

  closeOrders(): void {
    this.ordersModal.set(null);
  }
}
