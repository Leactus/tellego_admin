import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';

import { CompaniesService } from '../../../core/services/companies.service';
import { RatingVisibilityFilter, StoreRating, StoreRatingsPage } from '../../../core/models/store-rating.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { formatShortDate } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Pager } from '../../../shared/pager/pager';
import { ToastService } from '../../../shared/toast/toast.service';

const FILTERS: { key: RatingVisibilityFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'visible', label: 'Visibles' },
  { key: 'hidden', label: 'Ocultas' },
];

/**
 * Reseñas de un negocio, con moderación. El super-admin puede ocultar una
 * reseña injustificada tras un reporte: NO se borra, deja de contar en el
 * promedio y de verse para el dueño. Mismo patrón que driver-ratings-modal
 * (duplicado a propósito, no hay workspace compartido).
 */
@Component({
  selector: 'app-store-ratings-modal',
  standalone: true,
  imports: [Icon, Skeleton, Pager],
  templateUrl: './store-ratings-modal.html',
  styleUrl: './store-ratings-modal.scss',
})
export class StoreRatingsModal implements OnInit {
  @Input({ required: true }) companyId!: number;
  @Input() companyName = '';
  @Output() close = new EventEmitter<void>();

  readonly formatShortDate = formatShortDate;
  readonly filters = FILTERS;

  private readonly companies = inject(CompaniesService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly result = signal<StoreRatingsPage | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly filter = signal<RatingVisibilityFilter>('all');
  readonly busyRatingIds = signal<Set<number>>(new Set());

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  setFilter(f: RatingVisibilityFilter): void {
    if (this.filter() === f) return;
    this.filter.set(f);
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
    this.isRefreshing.set(true);
    try {
      this.result.set(
        await this.companies.getStoreRatings(this.companyId, {
          page: this.page(),
          pageSize: this.pageSize(),
          status: this.filter(),
        }),
      );
    } catch {
      this.toast.error('No se pudieron cargar las calificaciones del negocio');
    } finally {
      this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  async toggleHidden(rating: StoreRating): Promise<void> {
    const willHide = rating.hiddenAt === null;
    let reason: string | undefined;
    if (willHide) {
      const answer = window.prompt(
        'Motivo para ocultar esta reseña (opcional).\n\nLa reseña NO se borra: solo deja de contar en el promedio y de verse para el negocio.',
        '',
      );
      if (answer === null) return; // canceló
      reason = answer || undefined;
    }

    this.busyRatingIds.update((s) => new Set(s).add(rating.id));
    try {
      await this.companies.setStoreRatingVisibility(rating.id, willHide, reason);
      this.toast.success(willHide ? 'Reseña ocultada' : 'Reseña restaurada');
      await this.reload();
    } catch {
      this.toast.error('No se pudo actualizar la reseña');
    } finally {
      this.busyRatingIds.update((s) => {
        const next = new Set(s);
        next.delete(rating.id);
        return next;
      });
    }
  }
}
