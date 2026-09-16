import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

/**
 * Estado vacío reutilizable (ícono + título + texto opcional) para listas/tablas sin
 * datos o sin resultados de búsqueda. Reemplaza al viejo `<p class="empty">texto</p>`.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [Icon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  /** 'no-results' = búsqueda/filtro sin coincidencias (ícono lupa); 'no-data' = todavía no hay registros (ícono caja). */
  readonly variant = input<'no-data' | 'no-results'>('no-data');
  readonly title = input.required<string>();
  readonly hint = input<string | null>(null);
  /** Ícono a mano — si no se pasa, se elige según `variant`. */
  readonly icon = input<IconName | null>(null);
  /** Para espacios chicos (dropdowns, modales angostos): ícono y textos más pequeños, menos padding. */
  readonly compact = input(false);

  protected readonly resolvedIcon = computed<IconName>(
    () => this.icon() ?? (this.variant() === 'no-results' ? 'search' : 'package'),
  );
}
