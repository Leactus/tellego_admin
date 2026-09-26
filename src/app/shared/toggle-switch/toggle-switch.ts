import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/** Switch estilo Bootstrap (.form-switch): pastilla gris cuando está apagado,
 * verde/primario con el círculo deslizado a la derecha cuando está prendido.
 * Reemplaza los botones de ícono usados antes para activar/desactivar. */
@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="toggle-switch"
      role="switch"
      [attr.aria-checked]="checked"
      [class.on]="checked"
      [disabled]="disabled"
      (click)="onToggle()"
    >
      <span class="knob"></span>
    </button>
  `,
  styleUrl: './toggle-switch.scss',
})
export class ToggleSwitch {
  @Input() checked = false;
  @Input() disabled = false;
  @Output() checkedChange = new EventEmitter<boolean>();

  onToggle(): void {
    if (this.disabled) return;
    this.checkedChange.emit(!this.checked);
  }
}
