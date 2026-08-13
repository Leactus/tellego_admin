import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { Icon } from '../icon/icon';
import { LocationMap } from '../location-map/location-map';
import { ToastService } from '../toast/toast.service';

type LocationMode = 'coords' | 'map';

/**
 * Campo reutilizable de "Ubicación del negocio" — 2 modos:
 *  - Coordenadas: inputs de lat/lng editables + botón de geolocalización + vista previa
 *    de Google Maps (embed público, solo visual — no se puede marcar ahí, solo cambia
 *    si editas los inputs).
 *  - Mapa: selector interactivo (Google Maps, ver `LocationMap`) — click o
 *    arrastrar el pin marca la ubicación exacta.
 */
@Component({
  selector: 'app-location-field',
  standalone: true,
  imports: [FormsModule, Icon, LocationMap],
  templateUrl: './location-field.html',
  styleUrl: './location-field.scss',
})
export class LocationField {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly latChange = output<number | null>();
  readonly lngChange = output<number | null>();

  readonly locationMode = signal<LocationMode>('coords');
  readonly isLocating = signal(false);

  readonly mapPreviewUrl = computed<SafeResourceUrl | null>(() => {
    const lat = this.lat();
    const lng = this.lng();
    if (lat == null || lng == null) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`);
  });

  setLocationMode(mode: LocationMode): void {
    this.locationMode.set(mode);
  }

  onLatChange(value: number | null): void {
    this.latChange.emit(value);
  }

  onLngChange(value: number | null): void {
    this.lngChange.emit(value);
  }

  onMapLocationChange({ lat, lng }: { lat: number; lng: number }): void {
    this.latChange.emit(lat);
    this.lngChange.emit(lng);
  }

  /** Solo da una posición correcta si el dueño está físicamente en el local (ver aviso en el template). */
  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.toast.error('Tu navegador no soporta geolocalización');
      return;
    }

    this.isLocating.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.latChange.emit(Number(position.coords.latitude.toFixed(7)));
        this.lngChange.emit(Number(position.coords.longitude.toFixed(7)));
        this.isLocating.set(false);
        this.toast.success('Ubicación capturada');
      },
      () => {
        this.isLocating.set(false);
        this.toast.error('No se pudo obtener tu ubicación. Revisa los permisos del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
}
