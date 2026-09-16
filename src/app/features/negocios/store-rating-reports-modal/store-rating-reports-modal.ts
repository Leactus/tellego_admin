import { Component, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';

import { CompaniesService } from '../../../core/services/companies.service';
import { StoreRating } from '../../../core/models/store-rating.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { formatShortDate } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Pager } from '../../../shared/pager/pager';
import { ToastService } from '../../../shared/toast/toast.service';

/**
 * Bandeja GLOBAL de reseñas que un negocio reportó como injustas (ver
 * POST /owner/store/ratings/:id/report en delivery-pedidos-admin) — a
 * diferencia de store-ratings-modal.ts (reseñas de UN negocio), esta junta
 * las de TODOS a la vez. Mismo patrón que driver-rating-reports-modal.ts
 * (duplicado a propósito, no hay workspace compartido entre apps).
 */
@Component({
  selector: 'app-store-rating-reports-modal',
  standalone: true,
  imports: [Icon, EmptyState, Skeleton, Pager],
  templateUrl: './store-rating-reports-modal.html',
  styleUrl: './store-rating-reports-modal.scss',
})
export class StoreRatingReportsModal implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() resolved = new EventEmitter<void>();

  readonly formatShortDate = formatShortDate;

  private readonly companies = inject(CompaniesService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly items = signal<StoreRating[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  readonly busyRatingIds = signal<Set<number>>(new Set());

  async ngOnInit(): Promise<void> {
    await this.reload();
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
    this.isRefreshing.set(true);
    try {
      const { data, meta } = await this.companies.listReportedStoreRatings({
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.items.set(data);
      this.totalPages.set(meta.totalPages);
      this.total.set(meta.total);
    } catch {
      this.toast.error('No se pudieron cargar los reportes');
    } finally {
      this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  async hide(rating: StoreRating): Promise<void> {
    const reason = window.prompt(
      'Motivo para ocultar esta reseña (opcional).\n\nLa reseña NO se borra: solo deja de contar en el promedio y de verse para el negocio.',
      rating.reportedReason || '',
    );
    if (reason === null) return; // canceló

    this.busyRatingIds.update((s) => new Set(s).add(rating.id));
    try {
      await this.companies.setStoreRatingVisibility(rating.id, true, reason || undefined);
      this.toast.success('Reseña ocultada');
      this.resolved.emit();
      await this.reload();
    } catch {
      this.toast.error('No se pudo ocultar la reseña');
    } finally {
      this.busyRatingIds.update((s) => {
        const next = new Set(s);
        next.delete(rating.id);
        return next;
      });
    }
  }

  async dismiss(rating: StoreRating): Promise<void> {
    this.busyRatingIds.update((s) => new Set(s).add(rating.id));
    try {
      await this.companies.dismissStoreRatingReport(rating.id);
      this.toast.success('Reporte descartado — la reseña sigue visible');
      this.resolved.emit();
      await this.reload();
    } catch {
      this.toast.error('No se pudo descartar el reporte');
    } finally {
      this.busyRatingIds.update((s) => {
        const next = new Set(s);
        next.delete(rating.id);
        return next;
      });
    }
  }
}
