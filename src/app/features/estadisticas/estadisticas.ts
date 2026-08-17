import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { StatsService } from '../../core/services/stats.service';
import { PlatformStats } from '../../core/models/stats.model';
import { getQueryParam, syncQueryParams } from '../../core/utils/query-param-state';
import { Icon } from '../../shared/icon/icon';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToastService } from '../../shared/toast/toast.service';

interface RangePreset {
  key: '7' | '30' | '90' | 'custom';
  label: string;
  days: number | null;
}

const PRESETS: RangePreset[] = [
  { key: '7', label: '7 días', days: 7 },
  // No es una ventana móvil de 30 días — es el mes calendario actual (día 1 al último día). Ver applyPreset.
  { key: '30', label: 'Mes', days: null },
  { key: '90', label: '90 días', days: 90 },
  { key: 'custom', label: 'Personalizado', days: null },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready_for_pickup: 'Listo para recoger',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
};

const STATUS_COLOR_CLASS: Record<string, string> = {
  pending: 'warning',
  confirmed: 'info',
  preparing: 'info',
  ready_for_pickup: 'success',
  on_the_way: 'success',
  delivered: 'success',
  cancelled: 'error',
  rejected: 'error',
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Del día 1 al último día del mes calendario en curso (no una ventana móvil de 30 días). */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

/** Dashboard de estadísticas de TODA la plataforma (todos los negocios/sucursales/repartidores) — landing del panel super-admin. */
@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [FormsModule, DecimalPipe, Icon, Skeleton],
  templateUrl: './estadisticas.html',
  styleUrl: './estadisticas.scss',
})
export class Estadisticas implements OnInit {
  private readonly stats = inject(StatsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly presets = PRESETS;
  readonly statusLabels = STATUS_LABELS;
  readonly statusColorClass = STATUS_COLOR_CLASS;

  readonly isLoading = signal(true);
  readonly data = signal<PlatformStats | null>(null);
  activePreset: RangePreset['key'] = '30';
  from = currentMonthRange().from;
  to = currentMonthRange().to;

  readonly maxDayRevenue = computed(() => {
    const days = this.data()?.revenueByDay ?? [];
    return days.reduce((max, d) => Math.max(max, d.revenue), 0);
  });

  readonly chartWidth = 600;
  readonly chartHeight = 200;
  private readonly chartPadding = 16;

  /** Puntos del gráfico en coordenadas del viewBox, listos para dibujar la curva y los círculos de hover. */
  readonly chartPoints = computed(() => {
    const days = this.data()?.revenueByDay ?? [];
    const max = this.maxDayRevenue();
    const n = days.length;
    if (n === 0) return [];
    const w = this.chartWidth - this.chartPadding * 2;
    const h = this.chartHeight - this.chartPadding * 2;
    return days.map((day, i) => {
      const x = this.chartPadding + (n === 1 ? w / 2 : (i / (n - 1)) * w);
      const ratio = max > 0 ? day.revenue / max : 0;
      const y = this.chartPadding + h - ratio * h;
      return { x, y, day };
    });
  });

  /** Con un solo día de datos no hay tendencia que trazar — la curva degenera en un punto suelto sin contexto, así que ese caso se muestra como una tarjeta de resumen en vez de un gráfico vacío. */
  readonly hasTrendData = computed(() => this.chartPoints().length >= 2);

  readonly chartLinePath = computed(() => this.smoothPath(this.chartPoints()));

  readonly chartAreaPath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) return '';
    const bottom = this.chartHeight - this.chartPadding;
    const first = points[0];
    const last = points[points.length - 1];
    return `${this.smoothPath(points)} L ${last.x},${bottom} L ${first.x},${bottom} Z`;
  });

  /** Curva suave entre puntos usando bezier cúbica con control points a mitad de camino en X — evita depender de una librería de gráficos. */
  private smoothPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      d += ` C ${midX},${prev.y} ${midX},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
  }

  async ngOnInit(): Promise<void> {
    const qpFrom = getQueryParam(this.route, 'from');
    const qpTo = getQueryParam(this.route, 'to');
    const qpPreset = getQueryParam(this.route, 'range') as RangePreset['key'] | null;

    if (qpFrom && qpTo) {
      this.from = qpFrom;
      this.to = qpTo;
      this.activePreset = qpPreset && PRESETS.some((p) => p.key === qpPreset) ? qpPreset : 'custom';
    } else if (qpPreset && PRESETS.some((p) => p.key === qpPreset)) {
      this.applyPreset(qpPreset, false);
    }

    await this.reload();
  }

  applyPreset(key: RangePreset['key'], reload = true): void {
    this.activePreset = key;
    if (key === '30') {
      const range = currentMonthRange();
      this.from = range.from;
      this.to = range.to;
    } else {
      const preset = PRESETS.find((p) => p.key === key);
      if (preset?.days) {
        this.to = toDateInputValue(new Date());
        this.from = toDateInputValue(new Date(Date.now() - (preset.days - 1) * 86400000));
      }
    }
    if (reload) this.reload();
  }

  onCustomDateChange(): void {
    this.activePreset = 'custom';
    this.reload();
  }

  async reload(): Promise<void> {
    syncQueryParams(this.router, this.route, {
      from: this.from,
      to: this.to,
      range: this.activePreset !== '30' ? this.activePreset : null,
    });
    this.isLoading.set(true);
    try {
      const result = await this.stats.getStats({ from: this.from, to: this.to });
      this.data.set(result);
    } catch {
      this.toast.error('No se pudieron cargar las estadísticas');
    } finally {
      this.isLoading.set(false);
    }
  }

  dayLabel(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
  }

  exportCsv(): void {
    const stats = this.data();
    if (!stats) return;

    const lines: string[] = [];
    lines.push('Estadísticas de la plataforma');
    lines.push(`Rango,${stats.range.from},${stats.range.to}`);
    lines.push('');
    lines.push('Resumen');
    lines.push('Pedidos,Entregados,Cancelados,GMV,Ticket promedio,Ingresos de la plataforma');
    lines.push(
      [
        stats.summary.ordersCount,
        stats.summary.deliveredCount,
        stats.summary.cancelledCount,
        stats.summary.gmv,
        stats.summary.avgTicket,
        stats.platformRevenue.total,
      ].join(','),
    );
    lines.push('');
    lines.push('Negocios con más ventas');
    lines.push('Negocio,Pedidos,Ingresos');
    for (const c of stats.topCompanies) lines.push(`"${c.name.replace(/"/g, '""')}",${c.orders},${c.revenue}`);
    lines.push('');
    lines.push('Sucursales con más ventas');
    lines.push('Sucursal,Negocio,Pedidos,Ingresos');
    for (const s of stats.topStores) {
      lines.push(`"${s.storeName.replace(/"/g, '""')}","${s.companyName.replace(/"/g, '""')}",${s.orders},${s.revenue}`);
    }
    lines.push('');
    lines.push('Ingresos por día');
    lines.push('Fecha,Pedidos,Ingresos');
    for (const d of stats.revenueByDay) lines.push(`${d.date},${d.orders},${d.revenue}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estadisticas_plataforma_${stats.range.from}_${stats.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
