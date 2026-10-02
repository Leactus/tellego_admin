import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PageParams, toHttpParams } from '../models/pagination.model';
import {
  DriverPayout,
  DriverPayoutsPage,
  PayoutOrder,
  PayoutSchedule,
  PendingPayouts,
} from '../models/driver-payout.model';

/**
 * Desembolsos semanales a repartidores freelance (backend: services/driverPayout.service.ts). Solo
 * pedidos con tarjeta/transferencia — lo cobrado en efectivo ya lo tiene el repartidor.
 */
@Injectable({ providedIn: 'root' })
export class DriverPayoutsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/driver-payouts`;

  listPending(): Promise<PendingPayouts> {
    return firstValueFrom(this.http.get<PendingPayouts>(`${this.base}/pending`));
  }

  listPendingOrders(driverId: number, scope: 'ready' | 'running'): Promise<{ schedule: PayoutSchedule; data: PayoutOrder[] }> {
    return firstValueFrom(
      this.http.get<{ schedule: PayoutSchedule; data: PayoutOrder[] }>(`${this.base}/pending/${driverId}/orders`, {
        params: { scope },
      }),
    );
  }

  /**
   * Registra el desembolso de lo LISTO para pagar. `expectedAmount` + `cutoff` son lo que vio el admin:
   * si cambió en el medio (o ya se registró en otra pestaña), el backend responde 409 y no paga nada.
   */
  create(payload: {
    driverId: number;
    cutoff: string;
    expectedAmount: number;
    paidAt: string;
    reference?: string;
    note?: string;
  }): Promise<DriverPayout> {
    return firstValueFrom(this.http.post<{ data: DriverPayout }>(this.base, payload)).then((r) => r.data);
  }

  list(params?: PageParams & { driverId?: number; from?: string; to?: string }): Promise<DriverPayoutsPage> {
    const httpParams: Record<string, string> = {
      ...toHttpParams(params),
      ...(params?.driverId ? { driverId: String(params.driverId) } : {}),
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
    };
    return firstValueFrom(this.http.get<DriverPayoutsPage>(this.base, { params: httpParams }));
  }

  get(id: number): Promise<DriverPayout> {
    return firstValueFrom(this.http.get<{ data: DriverPayout }>(`${this.base}/${id}`)).then((r) => r.data);
  }
}
