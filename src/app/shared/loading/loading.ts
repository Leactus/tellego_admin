import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Estado de carga genérico (spinner + texto, centrado) — reemplaza el <p>Cargando...</p> repetido en cada página. */
@Component({
  selector: 'app-loading',
  standalone: true,
  templateUrl: './loading.html',
  styleUrl: './loading.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Loading {
  readonly text = input('Cargando...');
}
