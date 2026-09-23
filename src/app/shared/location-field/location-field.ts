import { Component, inject, input, output, signal } from '@angular/core';

import { Icon } from '../icon/icon';
import { LocationMap } from '../location-map/location-map';
import { ToastService } from '../toast/toast.service';

/**
 * Campo reutilizable de "Ubicación del negocio" — mapa interactivo (Google Maps, ver
 * `LocationMap`): busca una dirección, hace click o arrastra el pin para marcar la ubicación
 * exacta. El botón de geolocalización solo sirve como punto de partida rápido. Mismo componente
 * que delivery-pedidos-admin — reemplaza el flujo anterior de "Sacar coordenadas" (inputs
 * lat/lng + iframe de vista previa) / "Ver mapa" por decisión explícita del 2026-09-23.
 */
@Component({
  selector: 'app-location-field',
  standalone: true,
  imports: [Icon, LocationMap],
  templateUrl: './location-field.html',
  styleUrl: './location-field.scss',
})
export class LocationField {
  private readonly toast = inject(ToastService);

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  readonly latChange = output<number | null>();
  readonly lngChange = output<number | null>();

  readonly isLocating = signal(false);
  /** Punto azul "estás aquí" en el mapa — resultado crudo de geolocalización, distinto del pin verde del negocio. */
  readonly myLocation = signal<{ lat: number; lng: number } | null>(null);

  onMapLocationChange({ lat, lng }: { lat: number; lng: number }): void {
    this.latChange.emit(lat);
    this.lngChange.emit(lng);
  }

  /** Punto de partida rápido — igual se puede afinar arrastrando el pin en el mapa después. */
  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.toast.error('Tu navegador no soporta geolocalización');
      return;
    }

    this.isLocating.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(7));
        const lng = Number(position.coords.longitude.toFixed(7));
        this.myLocation.set({ lat, lng });
        this.latChange.emit(lat);
        this.lngChange.emit(lng);
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
