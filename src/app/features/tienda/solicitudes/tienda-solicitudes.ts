import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MarketplaceService } from '../../../core/services/marketplace.service';
import {
  MarketplaceOrder,
  MarketplaceOrderCounts,
  MarketplaceOrderStatus,
} from '../../../core/models/marketplace.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { formatShortDate, formatShortDateTime } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Pager } from '../../../shared/pager/pager';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

type StatusFilter = MarketplaceOrderStatus | 'all';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Nuevas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'delivered', label: 'Entregadas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'all', label: 'Todas' },
];

const BUYER_OPTIONS: SelectOption<'' | 'company' | 'driver'>[] = [
  { value: '', label: 'Todos los compradores' },
  { value: 'company', label: 'Negocios' },
  { value: 'driver', label: 'Repartidores' },
];

const STATUS_LABELS: Record<MarketplaceOrderStatus, string> = {
  pending: 'Nueva',
  confirmed: 'Confirmada',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Tienda Tellego > Solicitudes: compras de negocios y repartidores freelance. No hay pago en línea:
 * el admin confirma (el comprador recibe un aviso), coordina el cobro y lo registra (efectivo o
 * transferencia), y marca la entrega. Cancelar devuelve el stock y el cupo de la promo.
 */
@Component({
  selector: 'app-tienda-solicitudes',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Pager, Select, Skeleton],
  templateUrl: './tienda-solicitudes.html',
  styleUrl: './tienda-solicitudes.scss',
})
export class TiendaSolicitudes implements OnInit {
  readonly statusTabs = STATUS_TABS;
  readonly buyerOptions = BUYER_OPTIONS;
  readonly formatShortDate = formatShortDate;
  readonly formatShortDateTime = formatShortDateTime;

  private readonly api = inject(MarketplaceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly orders = signal<MarketplaceOrder[]>([]);
  readonly counts = signal<MarketplaceOrderCounts | null>(null);
  readonly status = signal<StatusFilter>('pending');
  buyerType: '' | 'company' | 'driver' = '';
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  // --- Detalle ---
  readonly selected = signal<MarketplaceOrder | null>(null);
  readonly busy = signal(false);
  readonly payFormOpen = signal(false);
  payForm = { method: 'transfer' as 'cash' | 'transfer', reference: '', paidAt: todayDateOnly() };
  adminNote = '';

  async ngOnInit(): Promise<void> {
    const qpStatus = getQueryParam(this.route, 'status') as StatusFilter | null;
    if (qpStatus && STATUS_TABS.some((t) => t.value === qpStatus)) this.status.set(qpStatus);
    const qpBuyer = getQueryParam(this.route, 'buyer');
    if (qpBuyer === 'company' || qpBuyer === 'driver') this.buyerType = qpBuyer;
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    await this.load();
  }

  private syncUrl(): void {
    syncQueryParams(this.router, this.route, {
      status: this.status() === 'pending' ? null : this.status(),
      buyer: this.buyerType || null,
      page: this.page() > 1 ? this.page() : null,
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const status = this.status();
      const res = await this.api.listOrders({
        page: this.page(),
        pageSize: this.pageSize(),
        status: status === 'all' ? undefined : status,
        buyerType: this.buyerType || undefined,
      });
      this.orders.set(res.data);
      this.counts.set(res.counts);
      this.total.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
    } catch {
      this.toast.error('No se pudieron cargar las solicitudes');
    } finally {
      this.loading.set(false);
    }
  }

  setStatus(status: StatusFilter): void {
    this.status.set(status);
    this.page.set(1);
    this.syncUrl();
    this.load();
  }

  onBuyerChange(): void {
    this.page.set(1);
    this.syncUrl();
    this.load();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.syncUrl();
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.syncUrl();
    this.load();
  }

  countFor(status: StatusFilter): number | null {
    const c = this.counts();
    if (!c || status === 'all') return null;
    return c[status];
  }

  money(value: number | string | null | undefined): string {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }

  statusLabel(status: MarketplaceOrderStatus): string {
    return STATUS_LABELS[status];
  }

  buyerName(order: MarketplaceOrder): string {
    if (order.buyerType === 'company') return order.company?.name ?? `Negocio #${order.id}`;
    return order.driver?.user?.name ?? 'Repartidor';
  }

  buyerSub(order: MarketplaceOrder): string {
    if (order.buyerType === 'company') return order.store ? `Sucursal ${order.store.name}` : 'Negocio';
    return 'Repartidor freelance';
  }

  itemsSummary(order: MarketplaceOrder): string {
    return order.items
      .map((i) => {
        const parts = [];
        if (i.quantity > 0) parts.push(`${i.quantity}×`);
        const free = i.freeQuantity > 0 ? ` (+${i.freeQuantity} gratis)` : '';
        return `${parts.join('')} ${i.productName}${free}`.trim();
      })
      .join(' · ');
  }

  paymentState(order: MarketplaceOrder): 'free' | 'paid' | 'unpaid' {
    if (Number(order.total) === 0) return 'free';
    return order.paidAt ? 'paid' : 'unpaid';
  }

  private errorMessage(err: unknown, fallback: string): string {
    return (err as { error?: { message?: string } })?.error?.message ?? fallback;
  }

  // --- Detalle ---

  open(order: MarketplaceOrder): void {
    this.selected.set(order);
    this.adminNote = order.adminNote ?? '';
    this.payFormOpen.set(false);
  }

  close(): void {
    if (this.busy()) return;
    this.selected.set(null);
  }

  private applyOrder(order: MarketplaceOrder): void {
    this.selected.set(order);
    this.adminNote = order.adminNote ?? '';
    this.orders.update((list) => list.map((o) => (o.id === order.id ? order : o)));
  }

  async changeStatus(status: MarketplaceOrderStatus): Promise<void> {
    const order = this.selected();
    if (!order || this.busy()) return;
    let cancelReason: string | undefined;
    if (status === 'cancelled') {
      const reason = await this.confirm.prompt({
        title: 'Cancelar solicitud',
        message: 'El comprador recibe un aviso con este motivo. El stock y el cupo de la promo vuelven a quedar libres.',
        placeholder: 'Ej: sin stock de esa mochila por ahora',
        confirmLabel: 'Cancelar solicitud',
        cancelLabel: 'Volver',
        variant: 'danger',
      });
      if (!reason) return;
      cancelReason = reason;
    } else if (status === 'delivered' && this.paymentState(order) === 'unpaid') {
      const ok = await this.confirm.confirm({
        title: 'Marcar como entregada',
        message: 'Esta solicitud todavía no tiene el pago registrado. ¿La marcas como entregada de todos modos?',
        confirmLabel: 'Marcar entregada',
      });
      if (!ok) return;
    }

    this.busy.set(true);
    try {
      const updated = await this.api.updateOrderStatus(order.id, {
        status,
        cancelReason,
        adminNote: this.adminNote.trim() !== (order.adminNote ?? '') ? this.adminNote : undefined,
      });
      this.applyOrder(updated);
      this.toast.success(
        status === 'confirmed'
          ? 'Solicitud confirmada — se le avisó al comprador'
          : status === 'delivered'
            ? 'Marcada como entregada'
            : 'Solicitud cancelada',
      );
      await this.load();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo actualizar la solicitud'));
    } finally {
      this.busy.set(false);
    }
  }

  openPayForm(): void {
    this.payForm = { method: 'transfer', reference: '', paidAt: todayDateOnly() };
    this.payFormOpen.set(true);
  }

  async savePayment(): Promise<void> {
    const order = this.selected();
    if (!order || this.busy()) return;
    const [y, m, d] = this.payForm.paidAt.split('-').map(Number);
    const paidAt = this.payForm.paidAt ? new Date(y, m - 1, d, 12).toISOString() : undefined;
    this.busy.set(true);
    try {
      this.applyOrder(
        await this.api.updateOrderPayment(order.id, {
          paid: true,
          method: this.payForm.method,
          reference: this.payForm.reference.trim() || undefined,
          paidAt,
        }),
      );
      this.payFormOpen.set(false);
      this.toast.success('Pago registrado');
      await this.load();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo registrar el pago'));
    } finally {
      this.busy.set(false);
    }
  }

  async undoPayment(): Promise<void> {
    const order = this.selected();
    if (!order || this.busy()) return;
    const ok = await this.confirm.confirm({
      title: 'Quitar pago',
      message: 'La solicitud vuelve a quedar como "por cobrar".',
      confirmLabel: 'Quitar pago',
      variant: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      this.applyOrder(await this.api.updateOrderPayment(order.id, { paid: false }));
      await this.load();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo quitar el pago'));
    } finally {
      this.busy.set(false);
    }
  }

  async saveNote(): Promise<void> {
    const order = this.selected();
    if (!order || this.busy()) return;
    this.busy.set(true);
    try {
      this.applyOrder(await this.api.updateOrderNote(order.id, this.adminNote));
      this.toast.success('Nota guardada — el comprador la ve en su solicitud');
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo guardar la nota'));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copiado');
    } catch {
      /* el navegador no dejó copiar */
    }
  }
}
