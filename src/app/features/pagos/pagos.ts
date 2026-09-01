import { Component, ElementRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CompaniesService, PaymentStatusFilter } from '../../core/services/companies.service';
import { PaymentsService } from '../../core/services/payments.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { Company, CompanySales } from '../../core/models/company.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { debounce } from '../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { formatLongDate } from '../../core/utils/format-date';
import { addMonthsToDateOnly } from '../../core/utils/billing';
import { scrollToFirstInvalid } from '../../shared/scroll-to-invalid';
import { Icon } from '../../shared/icon/icon';
import { Pager } from '../../shared/pager/pager';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';

type PaymentTab = PaymentStatusFilter;

const METHOD_OPTIONS: SelectOption[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [FormsModule, Icon, Pager, Select, Skeleton],
  templateUrl: './pagos.html',
  styleUrl: './pagos.scss',
})
export class Pagos implements OnInit, OnDestroy {
  private readonly companies = inject(CompaniesService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** Solo true antes de la primerísima carga — de ahí en adelante nunca vuelve a taparlo todo (filtros incluidos). */
  readonly isLoading = signal(true);
  /** true durante un refresco por búsqueda/filtro/paginación/pestaña — solo tapa la lista con esqueleto, filtros y pager se quedan montados. */
  readonly isRefreshing = signal(false);
  readonly items = signal<Company[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  /** Totales de TODAS las empresas activas (no de la página actual ni del texto buscado). */
  readonly paymentCounts = signal({ overdue: 0, current: 0 });
  readonly paymentTab = signal<PaymentTab>('all');

  readonly methodOptions = METHOD_OPTIONS;
  readonly paymentModalOpen = signal(false);
  readonly isSavingPayment = signal(false);
  readonly isCalculatingSales = signal(false);
  readonly salesInfo = signal<CompanySales | null>(null);
  readonly paymentModalCompany = signal<Company | null>(null);
  readonly paymentSubmitted = signal(false);
  paymentForm = { amount: 0, method: 'cash' as 'cash' | 'transfer' | 'card', periodStart: '', periodEnd: '', note: '' };
  /** Solo para cuota fija — con comisión no existe "adelantar", el monto depende de ventas que todavía no pasaron. */
  advanceForm = { months: 1, method: 'cash' as 'cash' | 'transfer' | 'card', note: '' };

  isAmountInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.amount;
  }

  isPeriodStartInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.periodStart;
  }

  isPeriodEndInvalid(): boolean {
    return this.paymentSubmitted() && !this.paymentForm.periodEnd;
  }

  isMonthsInvalid(): boolean {
    return this.paymentSubmitted() && (!this.advanceForm.months || this.advanceForm.months < 1);
  }

  readonly reminderModalOpen = signal(false);
  readonly isSendingReminder = signal(false);
  readonly reminderSubmitted = signal(false);
  private reminderCompany: Company | null = null;
  reminderForm = { title: '', body: '' };

  isReminderTitleInvalid(): boolean {
    return this.reminderSubmitted() && !this.reminderForm.title.trim();
  }

  isReminderBodyInvalid(): boolean {
    return this.reminderSubmitted() && !this.reminderForm.body.trim();
  }

  search = '';
  private readonly debouncedSearch = debounce(() => {
    this.page.set(1);
    this.reload();
  }, 300);

  /** Cancela el debounce pendiente al salir de la pantalla — ver el comentario de `debounce()` en
   * core/utils/debounce.ts. */
  ngOnDestroy(): void {
    this.debouncedSearch.cancel();
  }

  async ngOnInit(): Promise<void> {
    // Restaura página/tamaño/búsqueda/pestaña desde la URL — así un refresh (F5) no reinicia la vista a página 1.
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.search = getQueryParam(this.route, 'search') ?? '';
    const tab = getQueryParam(this.route, 'paymentTab');
    if (tab === 'overdue' || tab === 'current') this.paymentTab.set(tab);
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

  /** Cambiar de pestaña es un filtro nuevo: siempre vuelve a la página 1 (una página 60 de "todos" no significa nada en "pendientes"). */
  setPaymentTab(tab: PaymentTab): void {
    if (this.paymentTab() === tab) return;
    this.paymentTab.set(tab);
    this.page.set(1);
    this.reload();
  }

  /** `silent`: true para refrescos que no deben mostrar ningún esqueleto (tras registrar pago); el resto pasa por `isRefreshing`. */
  async reload(silent = false): Promise<void> {
    const tab = this.paymentTab();
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      search: this.search.trim() || null,
      paymentTab: tab !== 'all' ? tab : null,
    });
    if (!silent) this.isRefreshing.set(true);
    try {
      const { data, meta, paymentCounts } = await this.companies.list({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.trim(),
        paymentStatus: tab,
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
      this.paymentCounts.set(paymentCounts);
    } catch {
      this.toast.error('No se pudieron cargar los pagos');
    } finally {
      if (!silent) this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  isOverdue(company: Company): boolean {
    if (!company.nextPaymentDueDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (company.billingStartsAt && company.billingStartsAt > today) return false;
    return company.nextPaymentDueDate < today;
  }

  openPaymentModal(company: Company): void {
    this.paymentModalCompany.set(company);
    this.salesInfo.set(null);
    const today = new Date().toISOString().slice(0, 10);
    if (company.billingType === 'commission') {
      // Mismo periodo por defecto que ya se armaba antes (billingStartsAt/hoy) — lo único que cambia
      // es que ahora, con el periodo ya armado, se sugiere el monto de una vez (ver negocio-detalle.ts,
      // mismo criterio) en vez de obligar a darle a "Calcular desde ventas" antes de poder guardar.
      this.paymentForm = { amount: 0, method: 'cash', periodStart: company.billingStartsAt ?? today, periodEnd: today, note: '' };
      this.calculateFromSales();
    } else {
      this.advanceForm = { months: 1, method: 'cash', note: '' };
    }
    this.paymentSubmitted.set(false);
    this.paymentModalOpen.set(true);
  }

  /** Recalcula automáticamente al tocar cualquiera de las dos fechas del periodo — el admin ya no
   * tiene que darle a "Calcular desde ventas" de nuevo cada vez que ajusta el rango. */
  onPaymentPeriodChange(): void {
    this.calculateFromSales();
  }

  /** Punto de partida de los meses a adelantar: el próximo pago pendiente de la empresa (o hoy si nunca ha pagado). */
  private advanceStartDate(company: Company): string {
    return company.nextPaymentDueDate ?? company.billingStartsAt ?? new Date().toISOString().slice(0, 10);
  }

  /** Total a pagar por los meses elegidos — solo vista previa, el backend calcula el monto real. */
  advanceTotal(): number {
    const company = this.paymentModalCompany();
    if (!company) return 0;
    return Number(company.monthlyFee) * (this.advanceForm.months || 0);
  }

  /** Hasta cuándo queda cubierto el negocio tras este adelanto — solo vista previa. */
  advanceNextDueDate(): string {
    const company = this.paymentModalCompany();
    if (!company) return '';
    return addMonthsToDateOnly(this.advanceStartDate(company), this.advanceForm.months || 0);
  }

  closePaymentModal(): void {
    this.paymentModalOpen.set(false);
    this.paymentModalCompany.set(null);
  }

  /** Suma las ventas reales del periodo (todas las sucursales) y sugiere el monto = ventas × % de comisión. */
  async calculateFromSales(): Promise<void> {
    const company = this.paymentModalCompany();
    const { periodStart, periodEnd } = this.paymentForm;
    if (!company || !periodStart || !periodEnd) return;

    this.isCalculatingSales.set(true);
    try {
      const sales = await this.companies.getSales(company.id, periodStart, periodEnd);
      this.salesInfo.set(sales);
      this.paymentForm.amount = sales.suggestedAmount;
      // Deja constancia del cálculo en el historial, sin pisar una nota que el admin ya haya escrito a mano.
      if (!this.paymentForm.note.trim()) {
        this.paymentForm.note = `Comisión ${sales.commissionRate}% sobre $${sales.totalSales} en ventas`;
      }
    } catch {
      this.toast.error('No se pudieron calcular las ventas del periodo');
    } finally {
      this.isCalculatingSales.set(false);
    }
  }

  async savePayment(): Promise<void> {
    this.paymentSubmitted.set(true);
    const company = this.paymentModalCompany();
    if (!company || !this.paymentForm.amount || !this.paymentForm.periodStart || !this.paymentForm.periodEnd) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isSavingPayment.set(true);
    try {
      await this.paymentsService.create(company.id, this.paymentForm);
      this.closePaymentModal();
      this.toast.success('Pago registrado');
      // El pago recién registrado puede mover a esta empresa entre pestañas
      // (ej. de "pendientes" a "pagados"), así que se recarga la lista completa.
      await this.reload();
    } catch {
      this.toast.error('No se pudo registrar el pago');
    } finally {
      this.isSavingPayment.set(false);
    }
  }

  async saveAdvancePayment(): Promise<void> {
    this.paymentSubmitted.set(true);
    const company = this.paymentModalCompany();
    if (!company || !this.advanceForm.months || this.advanceForm.months < 1) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isSavingPayment.set(true);
    try {
      const { totalAmount } = await this.paymentsService.createAdvance(company.id, this.advanceForm);
      this.closePaymentModal();
      this.toast.success(`${this.advanceForm.months} pago(s) registrado(s) por $${totalAmount.toFixed(2)}`);
      await this.reload();
    } catch {
      this.toast.error('No se pudo registrar el adelanto');
    } finally {
      this.isSavingPayment.set(false);
    }
  }

  /** "2026-05-26" -> "Martes 26 de mayo 2026". */
  formatDate(isoDate: string): string {
    return formatLongDate(isoDate);
  }

  /** Mensaje por defecto para el recordatorio — editable antes de enviar. Cambia según cuota fija o comisión. */
  openReminderModal(company: Company): void {
    this.reminderCompany = company;
    const dueDate = company.nextPaymentDueDate ? this.formatDate(company.nextPaymentDueDate) : '';
    const greeting = `Hola${company.owner?.name ? ' ' + company.owner.name : ''}`;
    const debtDescription =
      company.billingType === 'commission'
        ? `tu comisión del ${company.commissionRate}% sobre tus ventas`
        : `tu cuota mensual de $${company.monthlyFee}`;
    this.reminderForm = {
      title: 'Pago pendiente',
      body: `${greeting}, ${debtDescription} está vencida desde el ${dueDate}. Por favor ponte al día lo antes posible para evitar la suspensión de tu cuenta.`,
    };
    this.reminderSubmitted.set(false);
    this.reminderModalOpen.set(true);
  }

  closeReminderModal(): void {
    this.reminderModalOpen.set(false);
    this.reminderCompany = null;
  }

  async sendReminder(): Promise<void> {
    this.reminderSubmitted.set(true);
    const company = this.reminderCompany;
    const title = this.reminderForm.title.trim();
    const body = this.reminderForm.body.trim();
    if (!company || !title || !body) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    this.isSendingReminder.set(true);
    try {
      const { sentTo, skipped } = await this.notificationsService.send({
        title,
        body,
        type: 'pago',
        companyId: company.id,
      });
      this.closeReminderModal();
      if (sentTo > 0) {
        this.toast.success('Recordatorio enviado');
      } else if (skipped?.sinVentas) {
        // Un aviso de 'pago' nunca le llega a un negocio por comisión sin ventas sin cobrar — no debe nada.
        this.toast.error('No se envió: este negocio es por comisión y no tiene comisión pendiente este período.');
      } else {
        this.toast.error('No se envió: el negocio ya está al día.');
      }
    } catch {
      this.toast.error('No se pudo enviar el recordatorio');
    } finally {
      this.isSendingReminder.set(false);
    }
  }
}
