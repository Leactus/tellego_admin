import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';

/** Desglose de un envío a una distancia dada (preview de la fórmula). */
export interface ZoneFeePreview {
  distanceKm: number;
  customerFee: number;
  driverEarning: number;
  platformCut: number;
}

export interface ZoneDeliverySettings {
  fuelPrice: number;
  baseFare: number;
  pricePerKm: number;
  minFee: number;
  driverCommissionPct: number;
  updatedAt: string | null;
}

export interface Zone {
  id: number;
  name: string;
  sortOrder: number;
  departments: { id: number; name: string }[];
  settings: ZoneDeliverySettings | null;
  preview: ZoneFeePreview[];
}

export interface ZonesResponse {
  data: Zone[];
  currency: { code: string; symbol: string };
}

export type ZoneSettingsPayload = Omit<ZoneDeliverySettings, 'updatedAt'>;

/**
 * Zonas de reparto y su tarifa de envío. La tarifa la controla 100% la
 * plataforma por zona — la sucursal ya no configura envío.
 */
@Injectable({ providedIn: 'root' })
export class ZonesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  listByCountry(countryId: number): Promise<ZonesResponse> {
    return firstValueFrom(this.http.get<ZonesResponse>(`${this.base}/countries/${countryId}/zones`));
  }

  updateSettings(zoneId: number, payload: ZoneSettingsPayload): Promise<ZoneDeliverySettings> {
    return firstValueFrom(
      this.http.put<{ data: ZoneDeliverySettings }>(`${this.base}/zones/${zoneId}/delivery-settings`, payload),
    ).then((r) => r.data);
  }
}
