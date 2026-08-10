import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Placeholder genérico tipo "shimmer" para listas, tarjetas, modales o texto — reemplaza a <app-loading /> cuando se quiere insinuar la forma del contenido mientras carga. */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  /** Forma del placeholder: filas de lista, tarjetas, bloques de modal/formulario o líneas de texto sueltas. */
  readonly variant = input<'list' | 'card' | 'modal' | 'text'>('list');
  /** Cantidad de filas/tarjetas/bloques repetidos. */
  readonly rows = input(4);
  /** Muestra un avatar/ícono circular al inicio de cada fila (solo variant="list"). */
  readonly avatar = input(true);

  protected readonly rowsArray = computed(() => Array.from({ length: this.rows() }));
}
