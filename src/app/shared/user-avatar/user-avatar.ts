import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * Foto de perfil circular de un usuario (ej. el repartidor que aceptó un pedido). Sin `src`, o si
 * la imagen no carga (URL rota/borrada del storage), muestra el avatar por defecto (ícono de usuario).
 *
 * Al tocarla se abre una tarjeta de perfil (foto grande + nombre + datos) en un <dialog> nativo: va
 * en el "top layer" del navegador, así se ve por encima de todo aunque el avatar esté dentro de
 * otro modal (ej. detalle del pedido). Para abrirla desde otro elemento (ej. el nombre), usar una
 * referencia de plantilla: `<app-user-avatar #av .../> <button (click)="av.openViewer($event)">`.
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
  /** Para el alt/tooltip de la foto y el título de la tarjeta. */
  readonly name = input<string | null | undefined>(null);
  /** Diámetro de la miniatura en px. */
  readonly size = input(32);
  /** false = solo miniatura, sin tarjeta de perfil al tocarla. */
  readonly zoomable = input(true);
  /**
   * false = la miniatura no es clickeable por sí sola: la tarjeta se abre desde un elemento que
   * la envuelve (ej. un chip foto + nombre que es UN solo botón) llamando a openViewer().
   */
  readonly selfTrigger = input(true);
  /** Línea secundaria de la tarjeta (ej. "Repartidor freelance"). */
  readonly subtitle = input<string | null | undefined>(null);
  readonly phone = input<string | null | undefined>(null);

  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  /** URL que falló al cargar — se compara con `src()` para que un cambio de foto vuelva a intentarlo. */
  private readonly failedSrc = signal<string | null>(null);

  protected readonly showImage = computed(() => {
    const src = this.src();
    return !!src && src !== this.failedSrc();
  });

  protected readonly isTrigger = computed(() => this.zoomable() && this.selfTrigger());

  protected readonly altText = computed(() => (this.name() ? `Foto de ${this.name()}` : 'Foto de perfil'));

  protected onError(): void {
    this.failedSrc.set(this.src() ?? null);
  }

  /** Abre la tarjeta de perfil. Público para poder abrirla también desde el nombre del usuario. */
  openViewer(event?: Event): void {
    // La miniatura/el nombre suelen vivir dentro de una tarjeta clickeable (abre el detalle del pedido).
    event?.stopPropagation();
    event?.preventDefault();
    if (!this.zoomable()) return;
    const dialog = this.viewer()?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
  }

  protected close(): void {
    this.viewer()?.nativeElement.close();
  }

  /**
   * Los clicks dentro del <dialog> burbujean por el DOM hasta la tarjeta del pedido — se cortan acá.
   * Click en el fondo (fuera de la tarjeta de perfil) cierra.
   */
  protected onDialogClick(event: MouseEvent): void {
    event.stopPropagation();
    if (event.target === event.currentTarget) this.close();
  }
}
