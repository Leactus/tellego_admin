import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * Foto de perfil circular de un usuario (ej. el repartidor que aceptó un pedido). Sin `src`, o si
 * la imagen no carga (URL rota/borrada del storage), muestra el avatar por defecto (ícono de usuario).
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [Icon],
  templateUrl: './user-avatar.html',
  styleUrl: './user-avatar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatar {
  readonly src = input<string | null | undefined>(null);
  /** Para el alt/tooltip de la foto. */
  readonly name = input<string | null | undefined>(null);
  /** Diámetro en px. */
  readonly size = input(32);

  /** URL que falló al cargar — se compara con `src()` para que un cambio de foto vuelva a intentarlo. */
  private readonly failedSrc = signal<string | null>(null);

  protected readonly showImage = computed(() => {
    const src = this.src();
    return !!src && src !== this.failedSrc();
  });

  protected onError(): void {
    this.failedSrc.set(this.src() ?? null);
  }
}
