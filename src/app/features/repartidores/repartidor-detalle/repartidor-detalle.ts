import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { DriversService } from '../../../core/services/drivers.service';
import {
  DriverDetail,
  DriverMoneyBucket,
  DriverOrderFilter,
  DriverOrderRow,
} from '../../../core/models/driver.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { ORDER_STATUS_COLOR_CLASS, ORDER_STATUS_LABELS } from '../../../core/utils/order-status-labels';
import { formatShortDate, formatShortDateTime } from '../../../core/utils/format-date';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../../core/utils/query-param-state';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Pager } from '../../../shared/pager/pager';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { ToastService } from '../../../shared/toast/toast.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BreakdownRow {
  label: string;
  hint: string;
  bucket: DriverMoneyBucket;
  payer: string;
  tone: 'cash' | 'platform' | 'company';
}

/**
 * Ficha de un repartidor (super-admin): sus datos (con correo editable — es su usuario para
 * entrar a la app), cuántos pedidos lleva y el desglose de dinero por QUIÉN le paga:
 *  - Freelance, tarjeta/transferencia → Tellego (envío + propina, desembolso semanal).
 *  - Propio, tarjeta/transferencia → su negocio (la propina; el envío lo arregla con su negocio).
 *  - Efectivo → ya lo cobró en mano.
 * Un ex-freelance contratado por un negocio puede tener las dos partes.
 */
@Component({
  selector: 'app-repartidor-detalle',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon, EmptyState, Pager, Skeleton, UserAvatar],
  templateUrl: './repartidor-detalle.html',
  styleUrl: './repartidor-detalle.scss',
})
export class RepartidorDetalle implements OnInit {
  readonly formatShortDate = formatShortDate;
  readonly formatShortDateTime = formatShortDateTime;
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly statusColor = ORDER_STATUS_COLOR_CLASS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly drivers = inject(DriversService);
  private readonly toast = inject(ToastService);

  private driverId!: number;

  readonly loading = signal(true);
  readonly detail = signal<DriverDetail | null>(null);

  readonly ordersLoading = signal(true);
  readonly orders = signal<DriverOrderRow[]>([]);
  readonly filter = signal<DriverOrderFilter>('all');
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly filters: { value: DriverOrderFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'delivered', label: 'Entregados' },
    { value: 'active', label: 'En curso' },
    { value: 'cancelled', label: 'Cancelados' },
  ];

  readonly driver = computed(() => this.detail()?.driver ?? null);
  readonly isFreelance = computed(() => this.driver()?.type === 'freelance');
  /** Negocio del repartidor propio (para el link a sus propinas). */
  readonly company = computed(() => this.driver()?.store?.company ?? null);

  /** ¿Mostrar la parte de Tellego? Freelance, o propio que todavía tiene algo de cuando era freelance. */
  readonly showPlatform = computed(() => {
    const d = this.detail();
    if (!d) return false;
    return (
      d.driver.type === 'freelance' ||
      d.money.freelance.cash.orders + d.money.freelance.electronic.orders > 0 ||
      d.platform.paid.count > 0
    );
  });

  /** ¿Mostrar la parte de su negocio? Propio, o con propinas/pagos de un negocio. */
  readonly showCompany = computed(() => {
    const d = this.detail();
    if (!d) return false;
    return d.driver.type === 'propio' || d.money.own.cash.orders + d.money.own.electronic.orders > 0 || d.company.paid.count > 0;
  });

  readonly breakdown = computed<BreakdownRow[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const rows: BreakdownRow[] = [];
    if (this.showPlatform()) {
      rows.push(
        {
          label: 'Como freelance · tarjeta / transferencia',
          hint: 'El cliente pagó en línea: el dinero entró a la cuenta del negocio.',
          bucket: d.money.freelance.electronic,
          payer: 'Le paga Tellego (envío + propina)',
          tone: 'platform',
        },
        {
          label: 'Como freelance · efectivo',
          hint: 'Cobró el envío y la propina en mano.',
          bucket: d.money.freelance.cash,
          payer: 'Ya lo cobró en mano',
          tone: 'cash',
        },
      );
    }
    if (this.showCompany()) {
      rows.push(
        {
          label: 'Como propio · tarjeta / transferencia',
          hint: 'El envío lo arregla con su negocio (sueldo / acuerdo).',
          bucket: d.money.own.electronic,
          payer: 'Su negocio le paga la propina',
          tone: 'company',
        },
        {
          label: 'Como propio · efectivo',
          hint: 'La propina la cobró en mano.',
          bucket: d.money.own.cash,
          payer: 'Ya lo cobró en mano',
          tone: 'cash',
        },
      );
    }
    return rows;
  });

  // --- Editar datos de contacto ---
  readonly editOpen = signal(false);
  readonly saving = signal(false);
  readonly editSubmitted = signal(false);
  editForm = { name: '', email: '', phone: '' };

  async ngOnInit(): Promise<void> {
    this.driverId = Number(this.route.snapshot.paramMap.get('id'));
    const f = getQueryParam(this.route, 'pedidos') as DriverOrderFilter | null;
    if (f && this.filters.some((x) => x.value === f)) this.filter.set(f);
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    await Promise.all([this.loadDetail(), this.loadOrders()]);
  }

  private async loadDetail(): Promise<void> {
    try {
      this.detail.set(await this.drivers.getDetail(this.driverId));
    } catch {
      this.toast.error('No se pudo cargar el repartidor');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadOrders(): Promise<void> {
    syncQueryParams(this.router, this.route, {
      pedidos: this.filter() !== 'all' ? this.filter() : null,
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
    });
    this.ordersLoading.set(true);
    try {
      const res = await this.drivers.listOrders(this.driverId, this.filter(), {
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.orders.set(res.data);
      this.total.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
    } catch {
      this.toast.error('No se pudieron cargar los pedidos');
    } finally {
      this.ordersLoading.set(false);
    }
  }

  setFilter(filter: DriverOrderFilter): void {
    if (this.filter() === filter) return;
    this.filter.set(filter);
    this.page.set(1);
    this.loadOrders();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadOrders();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.loadOrders();
  }

  // --- Formato ---

  money(value: number | string | null | undefined): string {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }

  last4(accountNumber: string): string {
    return accountNumber.slice(-4);
  }

  accountTypeLabel(type: 'checking' | 'savings'): string {
    return type === 'checking' ? 'Corriente' : 'Ahorro';
  }

  statusLabel(status: string): string {
    if (status === 'active') return 'Activo';
    if (status === 'suspended') return 'Suspendido';
    return 'Pendiente de aprobación';
  }

  paymentLabel(method: string): string {
    if (method === 'card') return 'Tarjeta';
    if (method === 'transfer') return 'Transferencia';
    return 'Efectivo';
  }

  payerLabel(o: DriverOrderRow): string {
    switch (o.payer) {
      case 'cash':
        return 'Cobrado en mano';
      case 'platform':
        return 'Tellego';
      case 'company':
        return o.tip > 0 ? 'Su negocio (propina)' : 'Su negocio';
      default:
        return '—';
    }
  }

  // --- Editar ---

  openEdit(): void {
    const u = this.driver()?.User;
    this.editForm = { name: u?.name ?? '', email: u?.email ?? '', phone: u?.phone ?? '' };
    this.editSubmitted.set(false);
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  isEditNameInvalid(): boolean {
    return this.editSubmitted() && !this.editForm.name.trim();
  }

  isEditEmailInvalid(): boolean {
    return this.editSubmitted() && !EMAIL_PATTERN.test(this.editForm.email.trim());
  }

  async saveEdit(): Promise<void> {
    this.editSubmitted.set(true);
    if (this.isEditNameInvalid() || this.isEditEmailInvalid()) return;
    this.saving.set(true);
    try {
      await this.drivers.update(this.driverId, {
        name: this.editForm.name.trim(),
        email: this.editForm.email.trim(),
        phone: this.editForm.phone.trim(),
      });
      this.toast.success('Datos actualizados');
      this.closeEdit();
      await this.loadDetail();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudieron guardar los datos');
    } finally {
      this.saving.set(false);
    }
  }
}
