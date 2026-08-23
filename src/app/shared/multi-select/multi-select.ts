import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { Icon } from '../icon/icon';
import { PanelPosition, SelectOption } from '../select/select';

/** A partir de cuántas opciones se muestra el buscador dentro del panel. */
const SEARCH_THRESHOLD = 8;
/** A partir de cuántas opciones (ya filtradas) se usa scroll virtual en vez de renderizar todo. */
const VIRTUAL_SCROLL_THRESHOLD = 20;
/**
 * Ventana, en ms, durante la cual se ignora un click en el disparador si se acaba de marcar/desmarcar
 * una opción. Confirmado con logging en vivo (mismo mecanismo que en select.ts): un doble click
 * físico (mouse/trackpad) cuyo primer click marca la opción puede hacer que el SEGUNDO click de ese
 * mismo gesto —a milisegundos de distancia— caiga sobre el botón disparador y le invierta el estado
 * (cerrándolo justo cuando se quería seguir marcando más opciones).
 */
const SPURIOUS_TOGGLE_GUARD_MS = 300;

/**
 * Selector de múltiples opciones (ej. subcategorías de una sucursal) con
 * soporte para [(ngModel)] sobre number[]. A diferencia de <app-select>, el
 * panel no se cierra al elegir una opción — el usuario puede marcar varias
 * antes de cerrarlo — y cada fila muestra un checkbox en vez de reemplazar
 * el valor. El posicionamiento del panel (fixed, calculado desde el trigger,
 * con auto-scroll si queda parcialmente fuera de la vista) es el mismo
 * mecanismo que select.ts — ver los comentarios ahí para el porqué de cada
 * pieza; no se duplica la explicación acá.
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [Icon, FormsModule, ScrollingModule],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelect),
      multi: true,
    },
  ],
})
export class MultiSelect implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panelRef?: ElementRef<HTMLElement>;

  private _options: SelectOption<number>[] = [];
  /** Se acumulan TODAS las opciones ya vistas (por value), no solo las de la última búsqueda — en modo remoto `options` cambia con cada búsqueda y, si no se guardara aparte, una opción ya elegida perdería su label al quedar fuera de una búsqueda posterior. */
  private readonly knownOptions = new Map<number, SelectOption<number>>();

  @Input()
  set options(value: SelectOption<number>[]) {
    this._options = value;
    for (const o of value) this.knownOptions.set(o.value, o);
  }
  get options(): SelectOption<number>[] {
    return this._options;
  }

  @Input() placeholder = 'Selecciona opciones';
  /** Borde/foco en rojo — mismo lenguaje visual que `.invalid` en inputs de texto (ver shared/styles/_modal.scss), para cuando el padre valida un intento de guardado fallido. */
  @Input() invalid = false;
  /** Modo remoto: no filtra localmente — `options` ya viene filtrado por quien lo use, en respuesta a `searchChange` (buscador contra el backend). */
  @Input() remote = false;
  /** Mientras el padre está resolviendo una búsqueda remota, para no mostrar "Sin resultados" de más. */
  @Input() loading = false;
  @Output() searchChange = new EventEmitter<string>();

  protected readonly isOpen = signal(false);
  protected readonly searchQuery = signal('');
  /** Posición fija (viewport) del panel, calculada desde el trigger — así el panel escapa de cualquier ancestro con overflow:hidden/auto (ej. el body con scroll de un modal) en vez de quedar recortado. */
  protected readonly panelPosition = signal<PanelPosition>({ left: 0, width: 0, top: 0 });
  protected value: number[] = [];
  protected disabled = false;

  /** true mientras scrollPanelIntoView() está scrolleando la página a mano — evita que el reposicionamiento por scroll (más abajo) pelee con ese ajuste y lo cancele a mitad de camino. */
  private suppressReposition = false;

  private readonly reposition = (): void => {
    if (this.suppressReposition) return;
    this.updatePanelPosition();
  };

  private onChange: (value: number[]) => void = () => {};
  private onTouched: () => void = () => {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** Timestamp de la última vez que `toggleOption` marcó/desmarcó algo — ver SPURIOUS_TOGGLE_GUARD_MS. */
  private lastToggleOptionAt = 0;

  protected get selectedLabels(): string[] {
    return this.value
      .map((v) => this.knownOptions.get(v)?.label)
      .filter((label): label is string => label !== undefined);
  }

  protected get triggerLabel(): string {
    const labels = this.selectedLabels;
    if (labels.length === 0) return this.placeholder;
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.length} seleccionadas`;
  }

  protected get showSearch(): boolean {
    return this.remote || this.options.length > SEARCH_THRESHOLD;
  }

  protected get filteredOptions(): SelectOption<number>[] {
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

  protected isSelected(option: SelectOption<number>): boolean {
    return this.value.includes(option.value);
  }

  protected toggle(): void {
    if (this.disabled) return;
    if (this.isOpen()) {
      this.close();
      return;
    }
    if (Date.now() - this.lastToggleOptionAt < SPURIOUS_TOGGLE_GUARD_MS) return;
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

    // Instantáneo (no smooth) + suppressReposition: ver el comentario equivalente en select.ts.
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

  protected toggleOption(option: SelectOption<number>): void {
    const next = this.isSelected(option) ? this.value.filter((v) => v !== option.value) : [...this.value, option.value];
    this.value = next;
    this.onChange(next);
    this.lastToggleOptionAt = Date.now();
  }

  protected trackByValue(_index: number, option: SelectOption<number>): number {
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

  writeValue(value: number[] | null): void {
    this.value = value ?? [];
  }

  registerOnChange(fn: (value: number[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
