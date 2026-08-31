import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Country } from '../models/company.model';

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

export interface ZoneDepartment {
  id: number;
  name: string;
}

export interface Zone {
  id: number;
  name: string;
  sortOrder: number;
  departments: ZoneDepartment[];
  settings: ZoneDeliverySettings | null;
  preview: ZoneFeePreview[];
}

export interface ZonesResponse {
  data: Zone[];
  currency: { code: string; symbol: string };
}

export type ZoneSettingsPayload = Omit<ZoneDeliverySettings, 'updatedAt'>;

/**
 * Zonas de reparto, sus departamentos y la tarifa de envío. La tarifa la
 * controla 100% la plataforma por zona — la sucursal ya no configura envío.
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

  // --- País ---
  createCountry(payload: { name: string; currencyCode: string; currencySymbol: string }): Promise<Country> {
    return firstValueFrom(this.http.post<{ data: Country }>(`${this.base}/countries`, payload)).then((r) => r.data);
  }

  // --- Zona ---
  createZone(countryId: number, payload: { name: string; sortOrder?: number }): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ data: { id: number } }>(`${this.base}/countries/${countryId}/zones`, payload),
    ).then((r) => r.data);
  }

  updateZone(id: number, payload: { name?: string; sortOrder?: number }): Promise<void> {
    return firstValueFrom(this.http.patch(`${this.base}/zones/${id}`, payload)).then(() => undefined);
  }

  deleteZone(id: number): Promise<void> {
    return firstValueFrom(this.http.delete(`${this.base}/zones/${id}`)).then(() => undefined);
  }

  // --- Departamento ---
  createDepartment(countryId: number, payload: { name: string; zoneId: number }): Promise<{ id: number }> {
    return firstValueFrom(
      this.http.post<{ data: { id: number } }>(`${this.base}/countries/${countryId}/departments`, payload),
    ).then((r) => r.data);
  }

  updateDepartment(id: number, payload: { name?: string; zoneId?: number }): Promise<void> {
    return firstValueFrom(this.http.patch(`${this.base}/departments/${id}`, payload)).then(() => undefined);
  }

  deleteDepartment(id: number): Promise<void> {
    return firstValueFrom(this.http.delete(`${this.base}/departments/${id}`)).then(() => undefined);
  }
}
