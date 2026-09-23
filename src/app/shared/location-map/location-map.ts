import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  signal,
  ViewChild,
} from '@angular/core';
import { loadGoogleMaps } from '../google-maps-loader';

/** Centro por defecto (San Salvador) cuando todavía no hay coordenadas — único país con cobertura hoy. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 13.6929, lng: -89.2182 };

/**
 * `lat`/`lng` vienen tipados como `number | null`, pero en tiempo de ejecución pueden llegar como
 * string (ej. una columna DECIMAL de Sequelize serializada como "13.6929000") o `NaN` — un
 * `!= null` no filtra ninguno de los dos, y `google.maps.Map` explota con "not a LatLng... not a
 * number" al construirse. Se convierte explícitamente en vez de solo validar, para no perder una
 * coordenada real solo porque llegó como texto.
 */
function toFiniteNumber(value: number | null): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Punto azul tipo "estás aquí" — solo referencia visual, no se puede arrastrar. Se arma con una
 * función (no una constante a nivel de módulo) porque referencia `google.maps.SymbolPath`, que
 * recién existe una vez que carga el script de Maps (ver loadGoogleMaps) — esta función solo se
 * llama después de eso.
 */
function myLocationIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: '#0288d1',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  };
}

/**
 * Mapa de selección estilo PedidosYa/Uber (mismo patrón que en delivery-pedidos-admin y
 * delivery-store): el pin verde queda visualmente fijo en el centro del mapa y es el MAPA el que
 * se arrastra debajo — no es un Marker, es un overlay HTML/CSS (ver template), así que arrastrar
 * no paga el costo de sincronizar un Marker en cada frame. Al soltar el arrastre (evento `idle`)
 * se emite el centro actual como la posición elegida. El punto azul de "mi ubicación" (ver
 * `myLocation` @Input) sí es un Marker real, anclado a una coordenada — no se mueve con el mapa.
 */
@Component({
  selector: 'app-location-map',
  standalone: true,
  template: `
    <div class="location-map-wrap">
      <input #searchInput type="text" class="location-map-search" placeholder="Buscar dirección…" autocomplete="off" />
      <div #mapEl class="location-map"></div>
      <svg class="location-map-center-pin" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
          fill="#2e7d32"
          stroke="#1b5e20"
          stroke-width="0.5"
        />
      </svg>
    </div>
    @if (loadError()) {
      <p class="location-map-error">No se pudo cargar Google Maps. Revisa la consola del navegador (F12).</p>
    }
  `,
  styleUrl: './location-map.scss',
})
export class LocationMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;
  /** Punto de referencia "estás aquí" (ej. resultado crudo de geolocalización) — no se guarda ni se arrastra, solo se dibuja. */
  @Input() myLocation: google.maps.LatLngLiteral | null = null;
  @Output() locationChange = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapEl', { static: true }) private readonly mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput', { static: true }) private readonly searchInput!: ElementRef<HTMLInputElement>;

  private map?: google.maps.Map;
  private myLocationMarker?: google.maps.Marker;
  private autocomplete?: google.maps.places.Autocomplete;
  private destroyed = false;
  readonly loadError = signal(false);
  /**
   * Reemplaza el viejo fix de un solo `setTimeout(...,0)`: eso alcanzaba para un tab que aparece
   * de golpe, pero no para un modal con animación de entrada (`animation: modal-pop`, ver
   * _modal.scss) — el timeout disparaba el resize ANTES de que la animación terminara de asentar
   * el tamaño real del contenedor, Google Maps pintaba los tiles con ese tamaño transitorio y se
   * quedaba en blanco para siempre (solo se "arreglaba" de rebote al buscar una dirección o usar
   * geolocalización, porque eso vuelve a mover el centro). ResizeObserver reacciona al tamaño
   * REAL del contenedor sin importar qué lo está animando ni cuánto tarde.
   */
  private resizeObserver?: ResizeObserver;

  /** Evita que un recentrado programático (search, ngOnChanges, resize-fix) dispare su propio `idle` como si fuera un arrastre del usuario. */
  private ignoreNextIdle = true;
  /**
   * Última posición "elegida" de verdad (por arrastre, búsqueda o input externo) — NO se
   * actualiza solo por hacer zoom. Google Maps recentra el mapa al hacer zoom con la rueda
   * (hacia donde está el cursor) o con doble clic, sin que el usuario haya arrastrado nada; sin
   * este resguardo, el `idle` que dispara ese recentrado se tomaba como si el usuario hubiera
   * elegido una ubicación nueva, y el pin (fijo en el centro) "saltaba" a otro punto solo por
   * hacer zoom. Ver `idle` más abajo: si el `idle` no vino de un arrastre real, el mapa vuelve
   * a este centro en vez de aceptarlo como la posición elegida.
   */
  private lastPickedCenter: google.maps.LatLngLiteral | null = null;
  /** true entre `dragstart` y el próximo `idle` — distingue un arrastre real de un zoom (ver lastPickedCenter). */
  private didDrag = false;

  /**
   * Ancestro con scroll propio del input de búsqueda (ej. un panel de contenido que scrollea por
   * su cuenta debajo de un topbar/modal-header fijo que NO scrollea) — se resuelve una sola vez y
   * se cachea, sin asumir un nombre de clase fijo porque `app-location-map` se reusa en pantallas
   * y modales con layouts distintos. `null` una vez resuelto significa "scrollea la ventana", así
   * no se repite la búsqueda en cada scroll.
   */
  private scrollAncestor: HTMLElement | null | undefined;

  private findScrollAncestor(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  /**
   * El panel de resultados de Places Autocomplete (`.pac-container`) se posiciona una sola vez,
   * a partir del rect del input, cuando Google lo abre o lo redibuja (ej. al tipear). Si el
   * usuario scrollea la página (o un contenedor ancestro con su propio scroll, ej. el body de un
   * modal) sin tocar el input de nuevo, el panel se queda "flotando" en su posición vieja en vez
   * de seguir al input. `capture: true` en el listener de scroll es lo que permite detectarlo:
   * scroll no burbujea, pero sí se captura bajando por los ancestros, así que un listener en
   * `window` con capture ve el scroll de CUALQUIER contenedor anidado, no solo el de la ventana.
   * Mismo mecanismo que updatePanelPosition() en shared/select/select.ts.
   */
  private readonly repositionPacContainer = (): void => {
    const pac = document.querySelector('.pac-container') as HTMLElement | null;
    if (!pac || getComputedStyle(pac).display === 'none') return;

    const rect = this.searchInput.nativeElement.getBoundingClientRect();
    // Google posiciona el panel como 'absolute' (relativo al documento) o 'fixed' (relativo al
    // viewport) según versión — se lee el estilo ya calculado en vez de asumir uno, y solo se
    // suman los offsets de scroll cuando hacen falta (absolute).
    const isFixed = getComputedStyle(pac).position === 'fixed';
    const offsetX = isFixed ? 0 : window.scrollX;
    const offsetY = isFixed ? 0 : window.scrollY;

    if (this.scrollAncestor === undefined) {
      this.scrollAncestor = this.findScrollAncestor(this.searchInput.nativeElement);
    }
    // Si el input vive dentro de un contenedor con scroll propio (ej. el body de un modal) que a
    // su vez tiene un header fijo ENCIMA que no scrollea, el input puede quedar tapado por ese
    // scroll sin dejar de reportar su posición cruda (getBoundingClientRect no recorta por
    // overflow del ancestro). El panel NUNCA debe quedar despegado de su input — ver un pin sin
    // la barra encima confunde más que no ver nada — así que si el borde del input queda tapado,
    // se oculta en vez de anclarse a otro lado; reaparece solo (pegado, como siempre) apenas el
    // input vuelve a estar visible. `visibility` (no `display`) para no pisar el `display` que
    // administra el propio Google (el guard de arriba lo respeta).
    const bottom = rect.bottom + offsetY + 4;
    const minTop = this.scrollAncestor ? this.scrollAncestor.getBoundingClientRect().top + offsetY : 0;
    if (bottom < minTop) {
      pac.style.visibility = 'hidden';
      return;
    }

    pac.style.visibility = '';
    pac.style.left = `${rect.left + offsetX}px`;
    pac.style.top = `${bottom}px`;
    pac.style.width = `${rect.width}px`;
  };

  async ngAfterViewInit(): Promise<void> {
    try {
      await loadGoogleMaps();
      if (this.destroyed) return;

      const initialLat = toFiniteNumber(this.lat);
      const initialLng = toFiniteNumber(this.lng);
      const hasInitialPoint = initialLat != null && initialLng != null;
      const center: google.maps.LatLngLiteral = hasInitialPoint ? { lat: initialLat!, lng: initialLng! } : DEFAULT_CENTER;
      this.lastPickedCenter = center;

      this.map = new google.maps.Map(this.mapEl.nativeElement, {
        center,
        zoom: hasInitialPoint ? 16 : 12,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });

      if (this.myLocation) {
        this.placeMyLocationMarker(this.myLocation.lat, this.myLocation.lng);
      }

      // Un arrastre real dispara `dragstart` — lo usamos para distinguirlo de un `idle`
      // causado solo por zoom (rueda o doble clic), que NO debe mover la posición elegida.
      this.map.addListener('dragstart', () => {
        this.didDrag = true;
      });

      // El pin queda fijo (ver overlay en el template); arrastrar el mapa es lo que cambia la
      // posición elegida — se emite recién al soltar (`idle`), no en cada frame de arrastre.
      this.map.addListener('idle', () => {
        if (this.ignoreNextIdle) {
          this.ignoreNextIdle = false;
          return;
        }
        const newCenter = this.map!.getCenter();
        if (!newCenter) return;

        if (!this.didDrag) {
          // Este `idle` vino de un zoom, no de un arrastre — Google Maps recentra solo al
          // hacer zoom (hacia el cursor con la rueda, o hacia el punto con doble clic), así
          // que se vuelve al último centro elegido en vez de aceptar este como nueva posición.
          if (this.lastPickedCenter) {
            this.ignoreNextIdle = true;
            this.map!.setCenter(this.lastPickedCenter);
          }
          return;
        }

        this.didDrag = false;
        this.lastPickedCenter = { lat: newCenter.lat(), lng: newCenter.lng() };
        this.locationChange.emit({ lat: newCenter.lat(), lng: newCenter.lng() });
      });

      // Barra de búsqueda tipo Google Maps, empotrada como control del mapa — busca una dirección
      // y centra el mapa ahí; el pin (fijo en el centro) queda automáticamente sobre ese punto.
      this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(this.searchInput.nativeElement);
      this.autocomplete = new google.maps.places.Autocomplete(this.searchInput.nativeElement, {
        fields: ['geometry'],
        componentRestrictions: { country: 'sv' },
      });
      this.autocomplete.bindTo('bounds', this.map);
      this.autocomplete.addListener('place_changed', () => {
        const location = this.autocomplete!.getPlace().geometry?.location;
        if (!location) return;
        this.ignoreNextIdle = true;
        this.map!.setCenter(location);
        this.map!.setZoom(17);
        this.lastPickedCenter = { lat: location.lat(), lng: location.lng() };
        this.locationChange.emit({ lat: location.lat(), lng: location.lng() });
      });
      window.addEventListener('scroll', this.repositionPacContainer, true);
      window.addEventListener('resize', this.repositionPacContainer);

      // Ver el comentario en la declaración de `resizeObserver` más arriba — dispara en cuanto el
      // contenedor tiene su tamaño final de verdad (mount inicial y cualquier cambio posterior,
      // ej. una animación de entrada que termina de asentar recién unos ms después del mount).
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.map) return;
        google.maps.event.trigger(this.map, 'resize');
        this.ignoreNextIdle = true;
        this.map.setCenter(this.lastPickedCenter ?? center);
      });
      this.resizeObserver.observe(this.mapEl.nativeElement);
    } catch (err) {
      // Cubre tanto la falla de carga del script como la de inicialización del mapa
      // (ej. key restringida a otro dominio) — antes esta última quedaba sin capturar
      // y el usuario solo veía la caja gris vacía, sin ningún aviso.
      console.error('No se pudo cargar Google Maps:', err);
      this.loadError.set(true);
    }
  }

  /** Recentra si lat/lng cambian desde afuera (ej. "Usar mi ubicación actual"), no solo al iniciar. */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;

    const lat = toFiniteNumber(this.lat);
    const lng = toFiniteNumber(this.lng);
    if ((changes['lat'] || changes['lng']) && lat != null && lng != null) {
      this.ignoreNextIdle = true;
      this.lastPickedCenter = { lat, lng };
      this.map.panTo({ lat, lng });
    }

    if (changes['myLocation'] && this.myLocation) {
      this.placeMyLocationMarker(this.myLocation.lat, this.myLocation.lng);
    }
  }

  /** Marcador azul de referencia ("estás aquí") — no arrastrable, no dispara locationChange. */
  private placeMyLocationMarker(lat: number, lng: number): void {
    if (!this.map) return;
    const position: google.maps.LatLngLiteral = { lat, lng };

    if (this.myLocationMarker) {
      this.myLocationMarker.setPosition(position);
    } else {
      this.myLocationMarker = new google.maps.Marker({
        position,
        map: this.map,
        draggable: false,
        zIndex: 1,
        title: 'Tu ubicación actual',
        icon: myLocationIcon(),
      });
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    window.removeEventListener('scroll', this.repositionPacContainer, true);
    window.removeEventListener('resize', this.repositionPacContainer);
    this.resizeObserver?.disconnect();
  }
}
