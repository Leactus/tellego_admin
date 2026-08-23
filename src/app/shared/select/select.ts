import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { Icon } from '../icon/icon';

export interface SelectOption<T = unknown> {
  value: T;
  label: string;
}

/** A partir de cuántas opciones se muestra el buscador dentro del panel. */
const SEARCH_THRESHOLD = 8;
/** A partir de cuántas opciones (ya filtradas) se usa scroll virtual en vez de renderizar todo. */
const VIRTUAL_SCROLL_THRESHOLD = 20;
/**
 * Ventana, en ms, durante la cual se ignora un click en el disparador si acaba de elegirse una
 * opción. Confirmado con logging en vivo: un doble click físico (mouse/trackpad) cuyo primer click
 * elige la opción y cierra el panel puede hacer que el SEGUNDO click de ese mismo gesto — a
 * milisegundos y unos pocos px de distancia — caiga sobre el botón disparador, que queda revelado
 * justo ahí apenas el panel se cierra, y lo reabra de inmediato. Sin este guard, elegir una opción
 * se sentía como si el select "no se cerrara".
 */
const SPURIOUS_REOPEN_GUARD_MS = 300;

export interface PanelPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/**
 * Select estilizado (reemplaza el <select> nativo del navegador) con soporte
 * para [(ngModel)]. Con muchas opciones (ej. una empresa con 50 sucursales)
 * agrega buscador y virtualiza la lista con @angular/cdk/scrolling para no
 * renderizar cientos de filas de una vez.
 */
@Component({
  selector: 'app-select',
  standalone: true,
  imports: [Icon, FormsModule, ScrollingModule],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
})
export class Select implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Selecciona una opción';
  /** Borde/foco en rojo — mismo lenguaje visual que `.invalid` en inputs de texto (ver shared/styles/_modal.scss), para cuando el padre valida un intento de guardado fallido. */
  @Input() invalid = false;
  /** Modo remoto: no filtra localmente — `options` ya viene filtrado por quien lo use, en respuesta a `searchChange` (buscador contra el backend, ej. listas de negocios/sucursales que no caben en una sola página). */
  @Input() remote = false;
  /** Mientras el padre está resolviendo una búsqueda remota, para no mostrar "Sin resultados" de más. */
  @Input() loading = false;
  @Output() searchChange = new EventEmitter<string>();

  protected readonly isOpen = signal(false);
  protected readonly searchQuery = signal('');
  /** Posición fija (viewport) del panel, calculada desde el trigger — así el panel escapa de cualquier ancestro con overflow:hidden/auto (ej. el body con scroll de un modal) en vez de quedar recortado. */
  protected readonly panelPosition = signal<PanelPosition>({ left: 0, width: 0, top: 0 });
  protected value: unknown = null;
  protected disabled = false;

  /** true mientras scrollPanelIntoView() está scrolleando la página a mano — evita que el reposicionamiento por scroll (más abajo) pelee con ese ajuste y lo cancele a mitad de camino. */
  private suppressReposition = false;

  private readonly reposition = (): void => {
    if (this.suppressReposition) return;
    this.updatePanelPosition();
  };

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** En modo remoto, `options` va cambiando con cada búsqueda y puede dejar de incluir la opción ya elegida — se guarda su label aparte para no perderlo. */
  private selectedLabelCache: string | null = null;
  /** Timestamp de la última vez que `selectOption` cerró el panel — ver SPURIOUS_REOPEN_GUARD_MS. */
  private lastSelectionAt = 0;

  protected get selectedLabel(): string | null {
    const fromOptions = this.options.find((o) => o.value === this.value)?.label;
    if (fromOptions !== undefined) return fromOptions;
    return this.remote ? this.selectedLabelCache : null;
  }

  protected get showSearch(): boolean {
    return this.remote || this.options.length > SEARCH_THRESHOLD;
  }

  protected get filteredOptions(): SelectOption[] {
    if (this.remote) return this.options;
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.options;
    return this.options.filter((o) => o.label.toLowerCase().includes(query));
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (!this.remote) return;
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => this.searchChange.emit(value.trim()), 300);
  }

  protected get useVirtualScroll(): boolean {
    return this.filteredOptions.length > VIRTUAL_SCROLL_THRESHOLD;
  }

  protected isSelected(option: SelectOption): boolean {
    return option.value === this.value;
  }

  protected toggle(): void {
    if (this.disabled) return;
    if (this.isOpen()) {
      this.close();
      return;
    }
    if (Date.now() - this.lastSelectionAt < SPURIOUS_REOPEN_GUARD_MS) return;
    this.isOpen.set(true);
    this.onTouched();
    this.updatePanelPosition();
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    // Si el disparador está pegado al borde de la vista (ej. el último campo de un formulario
    // largo), el panel puede abrir parcialmente fuera de pantalla incluso ya elegido el lado
    // (updatePanelPosition asume una altura estimada, no la real) — se espera al siguiente tick
    // para que el panel ya esté en el DOM con su tamaño real, y se ajusta el scroll de la página
    // solo lo necesario para que quede completo a la vista.
    setTimeout(() => this.scrollPanelIntoView());
  }

  private scrollPanelIntoView(): void {
    const rect = this.panelRef?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    let delta = 0;
    if (rect.bottom > window.innerHeight) {
      delta = rect.bottom - window.innerHeight + margin;
    } else if (rect.top < 0) {
      delta = rect.top - margin;
    }
    if (delta === 0) return;

    // Instantáneo (no smooth): con smooth, el scroll dispara varios eventos 'scroll' intermedios
    // mientras el panel todavía se está moviendo, y reposition() (que sigue al trigger mientras el
    // usuario scrollea a mano) recalculaba la posición del panel a mitad de la animación —
    // llegando a pelearse con este mismo ajuste y anularlo. suppressReposition lo evita, y se
    // recalcula una sola vez, ya con la página en su posición final.
    this.suppressReposition = true;
    window.scrollBy({ top: delta, behavior: 'auto' });
    this.updatePanelPosition();
    this.suppressReposition = false;
  }

  private close(): void {
    this.isOpen.set(false);
    this.searchQuery.set('');
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  /** Calcula si el panel abre hacia abajo o hacia arriba según el espacio disponible en el viewport, y fija su posición con coordenadas absolutas de viewport (position: fixed) para que no lo recorte un ancestro con overflow (ej. el body con scroll de un modal). */
  private updatePanelPosition(): void {
    const trigger = this.triggerRef?.nativeElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedPanelHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedPanelHeight && rect.top > spaceBelow;

    this.panelPosition.set(
      openUpward
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 }
        : { left: rect.left, width: rect.width, top: rect.bottom + 6 },
    );
  }

  protected selectOption(option: SelectOption): void {
    this.value = option.value;
    this.selectedLabelCache = option.label;
    this.onChange(this.value);
    this.close();
    this.lastSelectionAt = Date.now();
  }

  protected trackByValue(_index: number, option: SelectOption): unknown {
    return option.value;
  }

  /**
   * mousedown en vez de click: los modales de la app hacen `(click)="$event.stopPropagation()"`
   * en su contenedor, así que un click en cualquier otra parte del modal (que no sea el select)
   * nunca llegaría a document y el panel se quedaría abierto. mousedown dispara antes que click
   * y esos handlers no lo interceptan.
   */
  @HostListener('document:mousedown', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown.escape')
  protected onEscape(): void {
    if (this.isOpen()) this.close();
  }

  writeValue(value: unknown): void {
    this.value = value;
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
