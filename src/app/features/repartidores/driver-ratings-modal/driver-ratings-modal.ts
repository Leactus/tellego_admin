import { Component, Input, OnInit, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DriversService } from '../../../core/services/drivers.service';
import { DriverRatingsSummary } from '../../../core/models/driver.model';
import { DEFAULT_PAGE_SIZE } from '../../../core/models/pagination.model';
import { formatShortDate } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Pager } from '../../../shared/pager/pager';
import { ToastService } from '../../../shared/toast/toast.service';

interface RangePreset {
  key: 'all' | '7' | '30' | '90' | 'custom';
  label: string;
  days: number | null;
}

const PRESETS: RangePreset[] = [
  { key: 'all', label: 'Todos', days: null },
  { key: '7', label: '7 días', days: 7 },
  { key: '30', label: '30 días', days: 30 },
  { key: '90', label: '90 días', days: 90 },
  { key: 'custom', label: 'Personalizado', days: null },
];

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Modal con las reseñas recibidas por un repartidor de la plataforma — mismo mecanismo de filtro
 * de fechas por presets que se usa en delivery-pedidos-admin (no hay workspace compartido entre las
 * apps Angular de este monorepo, así que el componente se duplica en vez de importarse). */
@Component({
  selector: 'app-driver-ratings-modal',
  standalone: true,
  imports: [FormsModule, Icon, Skeleton, Pager],
  templateUrl: './driver-ratings-modal.html',
  styleUrl: './driver-ratings-modal.scss',
})
export class DriverRatingsModal implements OnInit {
  @Input({ required: true }) driverId!: number;
  @Input() driverName = '';
  @Output() close = new EventEmitter<void>();

  readonly formatShortDate = formatShortDate;

  private readonly drivers = inject(DriversService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isRefreshing = signal(false);
  readonly summary = signal<DriverRatingsSummary | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  readonly presets = PRESETS;

  activePreset: RangePreset['key'] = 'all';
  from = '';
  to = '';

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

  applyPreset(key: RangePreset['key']): void {
    this.activePreset = key;
    const preset = PRESETS.find((p) => p.key === key);
    if (preset?.days) {
      this.to = toDateInputValue(new Date());
      this.from = toDateInputValue(new Date(Date.now() - (preset.days - 1) * 86400000));
    } else if (key === 'all') {
      this.from = '';
      this.to = '';
    }
    this.page.set(1);
    this.reload();
  }

  onCustomDateChange(): void {
    this.activePreset = 'custom';
    this.page.set(1);
    this.reload();
  }

  async reload(): Promise<void> {
    this.isRefreshing.set(true);
    try {
      this.summary.set(
        await this.drivers.getRatings(this.driverId, {
          page: this.page(),
          pageSize: this.pageSize(),
          from: this.from || undefined,
          to: this.to || undefined,
        }),
      );
    } catch {
      this.toast.error('No se pudieron cargar las calificaciones del repartidor');
    } finally {
      this.isRefreshing.set(false);
      this.isLoading.set(false);
    }
  }

  /** ids de reseñas cuya visibilidad se está cambiando ahora mismo. */
  readonly busyRatingIds = signal<Set<number>>(new Set());

  async toggleHidden(rating: { id: number; hiddenAt: string | null }): Promise<void> {
    const willHide = rating.hiddenAt === null;
    if (willHide) {
      const reason = window.prompt(
        'Motivo para ocultar esta reseña (opcional).\n\nLa reseña NO se borra: solo deja de contar en el promedio y de verse para el negocio y el repartidor.',
        '',
      );
      // prompt devuelve null si cancelan.
      if (reason === null) return;
      await this.applyVisibility(rating.id, true, reason || undefined);
    } else {
      await this.applyVisibility(rating.id, false);
    }
  }

  private async applyVisibility(ratingId: number, hidden: boolean, reason?: string): Promise<void> {
    this.busyRatingIds.update((s) => new Set(s).add(ratingId));
    try {
      await this.drivers.setRatingVisibility(ratingId, hidden, reason);
      this.toast.success(hidden ? 'Reseña ocultada' : 'Reseña restaurada');
      await this.reload();
    } catch {
      this.toast.error('No se pudo actualizar la reseña');
    } finally {
      this.busyRatingIds.update((s) => {
        const next = new Set(s);
        next.delete(ratingId);
        return next;
      });
    }
  }
}
