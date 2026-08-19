import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { CompaniesService } from '../../core/services/companies.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { Company } from '../../core/models/company.model';
import { AdminNotification, NotificationType } from '../../core/models/notification.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { debounce } from '../../core/utils/debounce';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { Icon } from '../../shared/icon/icon';
import { MultiSelect } from '../../shared/multi-select/multi-select';
import { Pager } from '../../shared/pager/pager';
import { scrollToFirstInvalid } from '../../shared/scroll-to-invalid';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';

const TYPE_OPTIONS: SelectOption[] = [
  { value: 'pago', label: 'Pago' },
  { value: 'update', label: 'Actualización' },
  { value: 'novedad', label: 'Novedad' },
  { value: 'aviso', label: 'Aviso' },
];

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [FormsModule, Icon, Select, MultiSelect, Pager, Skeleton],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.scss',
})
export class Notificaciones implements OnInit {
  private readonly companiesService = inject(CompaniesService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly typeOptions = TYPE_OPTIONS;
  readonly isSending = signal(false);
  /** Solo true antes de la primerísima carga del historial — de ahí en adelante nunca vuelve a taparlo todo (filtros incluidos). */
  readonly isLoadingHistory = signal(true);
  /** true durante un refresco por búsqueda/paginación — solo tapa la lista con esqueleto, filtros y pager se quedan montados. */
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

  readonly companyOptions = computed<SelectOption<number>[]>(() =>
    this.companies().map((c) => ({ value: c.id, label: c.name })),
  );

  form: { title: string; body: string; type: NotificationType; sendToAll: boolean; companyIds: number[] } = {
    title: '',
    body: '',
    type: 'aviso',
    sendToAll: true,
    companyIds: [],
  };

  historySearch = '';
  private readonly debouncedHistorySearch = debounce(() => {
    this.page.set(1);
    this.loadHistory();
  }, 300);

  async ngOnInit(): Promise<void> {
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    this.historySearch = getQueryParam(this.route, 'search') ?? '';
    await Promise.all([this.loadCompanies(), this.loadHistory()]);
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

  /** 'Pago' + envío masivo (sin negocios puntuales elegidos) se filtra solo a quien tiene pago vencido — ver aviso en el modal. */
  get isBroadcastPagoFiltered(): boolean {
    return this.form.type === 'pago' && this.form.sendToAll;
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

  openComposeModal(): void {
    this.composeSubmitted.set(false);
    this.composeModalOpen.set(true);
  }

  closeComposeModal(): void {
    this.composeModalOpen.set(false);
  }

  /** Buscador en vivo del select de destino (en vez de cargar hasta 100 de una vez): pide de a `DEFAULT_PAGE_SIZE` por búsqueda. */
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

  /** `silent`: true para refrescos que no deben mostrar ningún esqueleto (tras enviar); el resto pasa por `isRefreshingHistory`. */
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

    this.isSending.set(true);
    try {
      const wasFiltered = this.isBroadcastPagoFiltered;
      const result = await this.notificationsService.send({
        title,
        body,
        type: this.form.type,
        companyIds: this.form.sendToAll ? undefined : this.form.companyIds,
      });
      this.toast.success(
        wasFiltered
          ? `Notificación enviada a ${result.sentTo} negocio(s) con pago pendiente`
          : `Notificación enviada a ${result.sentTo} negocio(s)`,
      );
      this.form = { title: '', body: '', type: 'aviso', sendToAll: true, companyIds: [] };
      this.closeComposeModal();
      this.page.set(1);
      await this.loadHistory();
    } catch {
      this.toast.error('No se pudo enviar la notificación');
    } finally {
      this.isSending.set(false);
    }
  }
}
