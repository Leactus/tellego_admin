import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import * as L from 'leaflet';

// Los íconos default de Leaflet apuntan a rutas relativas que el bundler no resuelve — se
// reemplazan por las mismas imágenes servidas desde el CDN de unpkg (mismo truco de siempre).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Centro por defecto (San Salvador) cuando todavía no hay coordenadas — único país con cobertura hoy. */
const DEFAULT_CENTER: L.LatLngTuple = [13.6929, -89.2182];

/** Mapa clic-para-marcar reutilizable — un click o arrastrar el pin emite la nueva posición. */
@Component({
  selector: 'app-location-map',
  standalone: true,
  template: `<div #mapEl class="location-map"></div>`,
  styleUrl: './location-map.scss',
})
export class LocationMap implements AfterViewInit, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lng: number | null = null;
  @Output() locationChange = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapEl', { static: true }) private readonly mapEl!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private marker?: L.Marker;

  ngAfterViewInit(): void {
    const hasInitialPoint = this.lat != null && this.lng != null;
    const center: L.LatLngTuple = hasInitialPoint ? [this.lat!, this.lng!] : DEFAULT_CENTER;

    this.map = L.map(this.mapEl.nativeElement).setView(center, hasInitialPoint ? 16 : 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    if (hasInitialPoint) {
      this.placeMarker(this.lat!, this.lng!, false);
    }

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.placeMarker(event.latlng.lat, event.latlng.lng, true);
    });

    // El contenedor puede montarse con ancho/alto 0 (ej. dentro de un tab recién mostrado) — recalcula tamaño ya en pantalla.
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private placeMarker(lat: number, lng: number, emit: boolean): void {
    if (!this.map) return;

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
      this.marker.on('dragend', () => {
        const pos = this.marker!.getLatLng();
        this.locationChange.emit({ lat: pos.lat, lng: pos.lng });
      });
    }

    if (emit) this.locationChange.emit({ lat, lng });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
