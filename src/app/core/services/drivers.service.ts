import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Driver, DriverRatingsSummary, DriverStatus } from '../models/driver.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

/** Pestañas de repartidores.html — 'all' no manda filtro (útil si algún día se agrega esa pestaña). */
export type DriverStatusFilter = 'all' | 'active' | 'pending' | 'suspended';

export interface DriversPage extends Paginated<Driver> {
  /** Totales de TODA la plataforma (no de la página ni del texto buscado) — para los badges de las pestañas. */
  statusCounts: { active: number; pending: number; suspended: number };
}

interface CreateDriverInput {
  name: string;
  email: string;
  phone?: string;
  vehicleType?: string;
  plateNumber?: string;
  licenseNumber?: string;
  countryId?: number | null;
}

interface UpdateDriverInput {
  name?: string;
  phone?: string;
  vehicleType?: string;
  plateNumber?: string;
  licenseNumber?: string;
  countryId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class DriversService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/drivers`;

  list(params?: PageParams & { status?: DriverStatusFilter }): Promise<DriversPage> {
    const statusMap: Record<Exclude<DriverStatusFilter, 'all'>, string> = {
      active: 'active',
      pending: 'pending_approval',
      suspended: 'suspended',
    };
    const httpParams = {
      ...toHttpParams(params),
      ...(params?.status && params.status !== 'all' ? { status: statusMap[params.status] } : {}),
    };
    return firstValueFrom(this.http.get<DriversPage>(this.base, { params: httpParams }));
  }

  create(input: CreateDriverInput): Promise<{ data: Driver; tempPassword: string }> {
    return firstValueFrom(this.http.post<{ data: Driver; tempPassword: string }>(this.base, input));
  }

  update(id: number, input: UpdateDriverInput): Promise<Driver> {
    return firstValueFrom(this.http.patch<{ data: Driver }>(`${this.base}/${id}`, input)).then((r) => r.data);
  }

  /**
   * `suspensionDays` solo aplica con status='suspended': ausente/0 = suspensión indefinida.
   * `force` (solo al aprobar): saltea la validación de onboarding completo (capital + documentos).
   * Si `force` no está y el onboarding no está listo, el backend responde 422.
   */
  updateStatus(id: number, status: DriverStatus, suspensionDays?: number, force?: boolean): Promise<Driver> {
    return firstValueFrom(
      this.http.patch<{ data: Driver }>(`${this.base}/${id}/status`, { status, suspensionDays, force }),
    ).then((r) => r.data);
  }

  /** Reseñas recibidas por un repartidor. `from`/`to`: 'YYYY-MM-DD', opcionales. */
  getRatings(driverId: number, params?: PageParams & { from?: string; to?: string }): Promise<DriverRatingsSummary> {
    const httpParams = {
      ...toHttpParams(params),
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
    };
    return firstValueFrom(
      this.http.get<DriverRatingsSummary>(`${this.base}/${driverId}/ratings`, { params: httpParams }),
    );
  }

  /**
   * Oculta o restaura una reseña de un repartidor (moderación tras un reporte).
   * La fila no se borra: deja de contar y de verse salvo para el super-admin.
   */
  setRatingVisibility(ratingId: number, hidden: boolean, reason?: string): Promise<void> {
    return firstValueFrom(
      this.http.patch<{ data: unknown }>(`${environment.apiUrl}/admin/driver-ratings/${ratingId}`, {
        hidden,
        ...(reason ? { reason } : {}),
      }),
    ).then(() => undefined);
  }
}
