import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, signal, ViewChild } from '@angular/core';
import { loadGoogleMaps } from '../google-maps-loader';

/** Centro por defecto (San Salvador) cuando todavía no hay coordenadas — único país con cobertura hoy. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 13.6929, lng: -89.2182 };

/** Mapa clic-para-marcar reutilizable — un click o arrastrar el pin emite la nueva posición. */
@Component({
  selector: 'app-location-map',
  standalone: true,
  template: `
    <div #mapEl class="location-map"></div>
    @if (loadError()) {
      <p class="location-map-error">No se pudo cargar Google Maps. Revisa la consola del navegador (F12).</p>
    }
  `,
  styleUrl: './location-map.scss',
})
export class LocationMap implements AfterViewInit, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;
  @Output() locationChange = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapEl', { static: true }) private readonly mapEl!: ElementRef<HTMLDivElement>;

  private map?: google.maps.Map;
  private marker?: google.maps.Marker;
  private destroyed = false;
  readonly loadError = signal(false);

  async ngAfterViewInit(): Promise<void> {
    try {
      await loadGoogleMaps();
    } catch (err) {
      console.error('No se pudo cargar Google Maps:', err);
      this.loadError.set(true);
      return;
    }
    if (this.destroyed) return;

    const hasInitialPoint = this.lat != null && this.lng != null;
    const center: google.maps.LatLngLiteral = hasInitialPoint ? { lat: this.lat!, lng: this.lng! } : DEFAULT_CENTER;

    this.map = new google.maps.Map(this.mapEl.nativeElement, {
      center,
      zoom: hasInitialPoint ? 16 : 12,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    if (hasInitialPoint) {
      this.placeMarker(this.lat!, this.lng!, false);
    }

    this.map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      this.placeMarker(event.latLng.lat(), event.latLng.lng(), true);
    });

    // El contenedor puede montarse con ancho/alto 0 (ej. dentro de un modal recién mostrado) — recalcula tamaño ya en pantalla.
    setTimeout(() => {
      if (!this.map) return;
      google.maps.event.trigger(this.map, 'resize');
      this.map.setCenter(center);
    }, 0);
  }

  private placeMarker(lat: number, lng: number, emit: boolean): void {
    if (!this.map) return;
    const position: google.maps.LatLngLiteral = { lat, lng };

    if (this.marker) {
      this.marker.setPosition(position);
    } else {
      this.marker = new google.maps.Marker({ position, map: this.map, draggable: true });
      this.marker.addListener('dragend', () => {
        const pos = this.marker!.getPosition();
        if (pos) this.locationChange.emit({ lat: pos.lat(), lng: pos.lng() });
      });
    }

    if (emit) this.locationChange.emit({ lat, lng });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
