import { Location, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CompaniesService } from '../../../core/services/companies.service';
import { OrdersService } from '../../../core/services/orders.service';
import { Company } from '../../../core/models/company.model';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLOR_CLASS } from '../../../core/utils/order-status-labels';
import { paymentBadge } from '../../../core/utils/order-payment-badge';
import { formatShortDateTime } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { Pager } from '../../../shared/pager/pager';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

const STATUS_FILTER_OPTIONS: SelectOption<OrderStatus | 'active' | 'all'>[] = [
  { value: 'active', label: 'En curso' },
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'ready_for_pickup', label: 'Listos para recoger' },
  { value: 'on_the_way', label: 'En camino' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'rejected', label: 'Rechazados' },
];

interface TimelineStep {
  label: string;
  at: string | null;
}

/**
 * Pedidos de un negocio vistos por el super-admin — SOLO LECTURA (avanzar/cancelar/asignar
 * repartidor sigue siendo del dueño en delivery-pedidos-admin). Reutiliza el mismo modelo,
 * etiquetas de estado e insignia de pago que esa app; el detalle muestra si el pedido fue a
 * domicilio con repartidor o de recoger en sucursal, con la línea de tiempo de cada paso.
 */
@Component({
  selector: 'app-negocio-pedidos',
  standalone: true,
  imports: [FormsModule, DecimalPipe, Icon, Pager, Select, Skeleton],
  templateUrl: './negocio-pedidos.html',
  styleUrl: './negocio-pedidos.scss',
})
export class NegocioPedidos implements OnInit {
  readonly formatShortDateTime = formatShortDateTime;
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly statusColorClass = ORDER_STATUS_COLOR_CLASS;
  readonly paymentBadge = paymentBadge;
  readonly statusFilterOptions = STATUS_FILTER_OPTIONS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly companiesService = inject(CompaniesService);
  private readonly ordersService = inject(OrdersService);
  private readonly toast = inject(ToastService);

  private companyId!: number;

  /** Solo true antes de la primerísima carga — de ahí en adelante nunca vuelve a taparlo todo. */
  readonly isLoading = signal(true);
  /** true durante un refresco por filtro/paginación — solo tapa la lista, toolbar y pager se quedan. */
  readonly isRefreshing = signal(false);
  readonly company = signal<Company | null>(null);
  readonly orders = signal<Order[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  statusFilter: OrderStatus | 'active' | 'all' = 'active';
  /** null = todas las sucursales de la empresa. */
  storeFilter: number | null = null;

  readonly selectedOrder = signal<Order | null>(null);

  readonly branches = computed(() => this.company()?.branches ?? []);
  readonly showStoreFilter = computed(() => this.branches().length > 1);
  readonly storeFilterOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Todas las sucursales' },
    ...this.branches().map((b) => ({ value: b.id, label: this.branchName(b.id) })),
  ]);

  goBack(): void {
    this.location.back();
  }

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.statusFilter = (getQueryParam(this.route, 'status') as OrderStatus | 'active' | 'all' | null) ?? 'active';
    const storeParam = getQueryParam(this.route, 'storeId');
    this.storeFilter = storeParam ? Number(storeParam) : null;

    this.isLoading.set(true);
    try {
      const company = await this.companiesService.getOne(this.companyId);
      this.company.set(company);
      // Un storeId de la URL que ya no pertenece a la empresa se descarta.
      if (this.storeFilter !== null && !company.branches?.some((b) => b.id === this.storeFilter)) {
        this.storeFilter = null;
      }
      await this.reload(true);
    } catch {
      this.toast.error('No se pudo cargar el negocio');
    } finally {
      this.isLoading.set(false);
    }
  }

  onFilterChange(): void {
    this.page.set(1);
    this.reload();
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

  async reload(silent = false): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      status: this.statusFilter !== 'active' ? this.statusFilter : null,
      storeId: this.storeFilter,
    });
    if (!silent) this.isRefreshing.set(true);
    try {
      const result = await this.ordersService.listByCompany(this.companyId, {
        page: this.page(),
        pageSize: this.pageSize(),
        status: this.statusFilter,
        storeId: this.storeFilter,
      });
      this.orders.set(result.data);
      this.totalPages.set(result.meta.totalPages);
      this.total.set(result.meta.total);
    } catch {
      this.toast.error('No se pudieron cargar los pedidos');
    } finally {
      if (!silent) this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  branchName(storeId: number): string {
    const branch = this.branches().find((b) => b.id === storeId);
    if (!branch) return `Sucursal #${storeId}`;
    return branch.department ? `${branch.name} (${branch.department})` : branch.name;
  }

  itemsSummary(order: Order): string {
    return order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ');
  }

  toNumber(value: string): number {
    return Number(value);
  }

  openDetail(order: Order): void {
    this.selectedOrder.set(order);
  }

  closeDetail(): void {
    this.selectedOrder.set(null);
  }

  /** Pasos ya ocurridos de un pedido, en orden — para la línea de tiempo del detalle. */
  timeline(order: Order): TimelineStep[] {
    const steps: TimelineStep[] = [
      { label: 'Pedido recibido', at: order.createdAt },
      { label: 'Confirmado', at: order.confirmedAt },
      { label: 'En preparación', at: order.preparedAt },
    ];
    if (order.fulfillmentType === 'delivery') {
      steps.push({ label: 'Repartidor en la tienda', at: order.arrivedAtStoreAt });
      steps.push({ label: 'Salió a domicilio', at: order.pickedUpAt });
      steps.push({ label: 'Entregado', at: order.deliveredAt });
    } else {
      steps.push({ label: 'Listo para recoger', at: order.pickedUpAt ?? order.preparedAt });
      steps.push({ label: 'Recogido por el cliente', at: order.deliveredAt });
    }
    if (order.cancelledAt) {
      steps.push({ label: order.status === 'rejected' ? 'Rechazado' : 'Cancelado', at: order.cancelledAt });
    }
    return steps.filter((s) => s.at !== null);
  }
}
