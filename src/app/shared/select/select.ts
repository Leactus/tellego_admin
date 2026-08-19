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

  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Selecciona una opción';
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

  private readonly reposition = (): void => this.updatePanelPosition();

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  /** En modo remoto, `options` va cambiando con cada búsqueda y puede dejar de incluir la opción ya elegida — se guarda su label aparte para no perderlo. */
  private selectedLabelCache: string | null = null;

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
    } else {
      this.isOpen.set(true);
      this.onTouched();
      this.updatePanelPosition();
      window.addEventListener('scroll', this.reposition, true);
      window.addEventListener('resize', this.reposition);
    }
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
  }

  protected trackByValue(_index: number, option: SelectOption): unknown {
    return option.value;
  }

  @HostListener('document:click', ['$event'])
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
