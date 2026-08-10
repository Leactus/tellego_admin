import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AdvertisementsService } from '../../core/services/advertisements.service';
import { CompaniesService } from '../../core/services/companies.service';
import { CatalogService } from '../../core/services/catalog.service';
import { Advertisement, AdvertisementStatus } from '../../core/models/advertisement.model';
import { Company } from '../../core/models/company.model';
import { Product } from '../../core/models/catalog.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { formatShortDate } from '../../core/utils/format-date';
import { Icon } from '../../shared/icon/icon';
import { Pager } from '../../shared/pager/pager';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';

type Tab = AdvertisementStatus | 'all';
type Mode = 'store' | 'product';

/**
 * Cola de solicitudes de publicidad de un tipo (negocios o productos, nunca
 * mezclados — dos rutas separadas usan este mismo componente con `mode`
 * distinto vía route data). El dueño las pide desde delivery-pedidos-admin
 * (solo de negocio, hoy), pero aquí también el admin puede crearlas
 * directamente — ya quedan aprobadas, porque el admin define duración y
 * costo en el momento.
 */
@Component({
  selector: 'app-publicidad',
  standalone: true,
  imports: [FormsModule, Icon, Pager, Select, Skeleton],
  templateUrl: './publicidad.html',
  styleUrl: './publicidad.scss',
})
export class Publicidad implements OnInit {
  readonly formatShortDate = formatShortDate;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly advertisements = inject(AdvertisementsService);
  private readonly companies = inject(CompaniesService);
  private readonly catalog = inject(CatalogService);
  private readonly toast = inject(ToastService);

  readonly mode: Mode = (this.route.snapshot.data['mode'] as Mode) ?? 'store';
  readonly isProductMode = this.mode === 'product';
  readonly title = this.isProductMode ? 'Publicidad de productos' : 'Publicidad de negocios';
  readonly subtitle = this.isProductMode
    ? 'Productos puntuales destacados en la app, pedidos por negocios o creados directamente por ti.'
    : 'Negocios que quieren aparecer en la sección de destacados de la app, pedidos por ellos o creados directamente por ti.';

  readonly isLoading = signal(true);
  readonly items = signal<Advertisement[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly tab = signal<Tab>('pending');
  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'pending', label: 'Pendientes' },
    { value: 'approved', label: 'Aprobadas' },
    { value: 'rejected', label: 'Rechazadas' },
    { value: 'all', label: 'Todas' },
  ];

  // --- Modal: crear publicidad directamente ---
  readonly createModalOpen = signal(false);
  readonly isCreating = signal(false);
  readonly companyOptions = signal<SelectOption<number>[]>([]);
  readonly isSearchingCompanies = signal(false);
  readonly storeOptions = signal<SelectOption<number>[]>([]);
  readonly productOptions = signal<SelectOption<number>[]>([]);
  private companiesById = new Map<number, Company>();
  private productsByStoreId = new Map<number, Product[]>();

  createForm: { companyId: number | null; storeId: number | null; productId: number | null; durationDays: number; cost: number } = {
    companyId: null,
    storeId: null,
    productId: null,
    durationDays: 30,
    cost: 0,
  };

  readonly canSubmitCreate = computed(() => {
    if (!this.createForm.storeId || this.createForm.durationDays <= 0 || this.createForm.cost < 0) return false;
    if (this.isProductMode && !this.createForm.productId) return false;
    return true;
  });

  // --- Modal: aprobar solicitud pendiente ---
  readonly approveModalTarget = signal<Advertisement | null>(null);
  readonly isApproving = signal(false);
  approveForm: { durationDays: number; cost: number } = { durationDays: 30, cost: 0 };

  // --- Modal: rechazar solicitud pendiente ---
  readonly rejectModalTarget = signal<Advertisement | null>(null);
  readonly isRejecting = signal(false);
  rejectReason = '';

  async ngOnInit(): Promise<void> {
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    this.pageSize.set(getQueryParamNumber(this.route, 'pageSize', DEFAULT_PAGE_SIZE));
    const tab = getQueryParam(this.route, 'tab') as Tab | null;
    if (tab && this.tabs.some((t) => t.value === tab)) this.tab.set(tab);
    await this.reload();
  }

  setTab(tab: Tab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
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

  async reload(): Promise<void> {
    syncQueryParams(this.router, this.route, {
      page: this.page() > 1 ? this.page() : null,
      pageSize: this.pageSize() !== DEFAULT_PAGE_SIZE ? this.pageSize() : null,
      tab: this.tab() !== 'pending' ? this.tab() : null,
    });
    this.isLoading.set(true);
    try {
      const tab = this.tab();
      const { data, meta } = await this.advertisements.list({
        page: this.page(),
        pageSize: this.pageSize(),
        status: tab === 'all' ? undefined : tab,
        type: this.mode,
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
    } catch {
      this.toast.error('No se pudieron cargar las solicitudes de publicidad');
    } finally {
      this.isLoading.set(false);
    }
  }

  isActive(ad: Advertisement): boolean {
    if (ad.status !== 'approved' || !ad.startsAt || !ad.endsAt) return false;
    const now = new Date().toISOString();
    return ad.startsAt <= now && ad.endsAt >= now;
  }

  // --- Crear ---
  async openCreateModal(): Promise<void> {
    this.createForm = { companyId: null, storeId: null, productId: null, durationDays: 30, cost: 0 };
    this.storeOptions.set([]);
    this.productOptions.set([]);
    this.companiesById.clear();
    this.createModalOpen.set(true);
    await this.searchCompanies('');
  }

  /** Buscador en vivo del select de negocios (en vez de cargar hasta 100 de una vez): pide de a `DEFAULT_PAGE_SIZE` por búsqueda. */
  async searchCompanies(query: string): Promise<void> {
    this.isSearchingCompanies.set(true);
    try {
      const { data } = await this.companies.list({ pageSize: DEFAULT_PAGE_SIZE, search: query || undefined });
      // Se acumula (no se reemplaza): así, si el negocio ya elegido queda fuera de una búsqueda
      // posterior, sigue resolviéndose en onCompanyChange sin volver a pedirlo.
      for (const c of data) this.companiesById.set(c.id, c);
      this.companyOptions.set(data.map((c) => ({ value: c.id, label: c.name })));
    } catch {
      this.toast.error('No se pudieron cargar los negocios');
    } finally {
      this.isSearchingCompanies.set(false);
    }
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
  }

  async onCompanyChange(companyId: number | null): Promise<void> {
    this.createForm.storeId = null;
    this.createForm.productId = null;
    this.productOptions.set([]);
    if (!companyId) {
      this.storeOptions.set([]);
      return;
    }

    const company = this.companiesById.get(companyId);
    this.storeOptions.set((company?.branches ?? []).map((b) => ({ value: b.id, label: b.name })));

    if (this.isProductMode) {
      try {
        const products = await this.catalog.listProducts(companyId);
        this.productsByStoreId.clear();
        for (const product of products) {
          for (const sp of product.storeProducts) {
            if (!sp.isAvailable) continue;
            const list = this.productsByStoreId.get(sp.storeId) ?? [];
            list.push(product);
            this.productsByStoreId.set(sp.storeId, list);
          }
        }
      } catch {
        this.toast.error('No se pudieron cargar los productos de este negocio');
      }
    }
  }

  onStoreChange(storeId: number | null): void {
    this.createForm.productId = null;
    if (!this.isProductMode || !storeId) {
      this.productOptions.set([]);
      return;
    }
    const products = this.productsByStoreId.get(storeId) ?? [];
    this.productOptions.set(products.map((p) => ({ value: p.id, label: p.name })));
  }

  async confirmCreate(): Promise<void> {
    if (!this.canSubmitCreate()) return;

    this.isCreating.set(true);
    try {
      await this.advertisements.create({
        storeId: this.createForm.storeId!,
        productId: this.isProductMode ? this.createForm.productId : null,
        durationDays: this.createForm.durationDays,
        cost: this.createForm.cost,
      });
      this.toast.success('Publicidad creada y activa');
      this.closeCreateModal();
      this.tab.set('approved');
      this.page.set(1);
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo crear la publicidad');
    } finally {
      this.isCreating.set(false);
    }
  }

  // --- Aprobar ---
  openApproveModal(ad: Advertisement): void {
    this.approveForm = { durationDays: 30, cost: 0 };
    this.approveModalTarget.set(ad);
  }

  closeApproveModal(): void {
    this.approveModalTarget.set(null);
  }

  async confirmApprove(): Promise<void> {
    const target = this.approveModalTarget();
    if (!target || this.approveForm.durationDays <= 0 || this.approveForm.cost < 0) return;

    this.isApproving.set(true);
    try {
      await this.advertisements.approve(target.id, this.approveForm.durationDays, this.approveForm.cost);
      this.toast.success('Publicidad aprobada');
      this.closeApproveModal();
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo aprobar la solicitud');
    } finally {
      this.isApproving.set(false);
    }
  }

  // --- Rechazar ---
  openRejectModal(ad: Advertisement): void {
    this.rejectReason = '';
    this.rejectModalTarget.set(ad);
  }

  closeRejectModal(): void {
    this.rejectModalTarget.set(null);
  }

  async confirmReject(): Promise<void> {
    const target = this.rejectModalTarget();
    if (!target) return;

    this.isRejecting.set(true);
    try {
      await this.advertisements.reject(target.id, this.rejectReason.trim() || undefined);
      this.toast.success('Solicitud rechazada');
      this.closeRejectModal();
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo rechazar la solicitud');
    } finally {
      this.isRejecting.set(false);
    }
  }
}
