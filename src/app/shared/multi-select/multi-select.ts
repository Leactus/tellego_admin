import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { Icon } from '../icon/icon';
import { SelectOption } from '../select/select';

/** A partir de cuántas opciones se muestra el buscador dentro del panel. */
const SEARCH_THRESHOLD = 8;
/** A partir de cuántas opciones (ya filtradas) se usa scroll virtual en vez de renderizar todo. */
const VIRTUAL_SCROLL_THRESHOLD = 20;

/**
 * Selector de múltiples opciones (ej. subcategorías de una sucursal) con
 * soporte para [(ngModel)] sobre number[]. A diferencia de <app-select>, el
 * panel no se cierra al elegir una opción — el usuario puede marcar varias
 * antes de cerrarlo — y cada fila muestra un checkbox en vez de reemplazar
 * el valor.
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
  @Input() invalid = false;
  /** Modo remoto: no filtra localmente — `options` ya viene filtrado por quien lo use, en respuesta a `searchChange` (buscador contra el backend). */
  @Input() remote = false;
  /** Mientras el padre está resolviendo una búsqueda remota, para no mostrar "Sin resultados" de más. */
  @Input() loading = false;
  @Output() searchChange = new EventEmitter<string>();

  protected readonly isOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected value: number[] = [];
  protected disabled = false;

  private onChange: (value: number[]) => void = () => {};
  private onTouched: () => void = () => {};
  private searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.onTouched();
    } else {
      this.searchQuery.set('');
    }
  }

  protected toggleOption(option: SelectOption<number>): void {
    const next = this.isSelected(option) ? this.value.filter((v) => v !== option.value) : [...this.value, option.value];
    this.value = next;
    this.onChange(next);
  }

  protected trackByValue(_index: number, option: SelectOption<number>): number {
    return option.value;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('keydown.escape')
  protected onEscape(): void {
    this.isOpen.set(false);
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
