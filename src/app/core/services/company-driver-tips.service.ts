import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { DriverTipOrder, DriverTipPayoutsPage, DriverTipsBoard } from '../models/driver-tips.model';

/**
 * Propinas de los repartidores PROPIOS de un negocio — solo lectura, para revisar reclamos
 * ("el negocio no me paga las propinas"). El pago lo registra el negocio desde su panel.
 */
@Injectable({ providedIn: 'root' })
export class CompanyDriverTipsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/companies`;

  private storeParam(storeId: number | null): Record<string, string> {
    return storeId != null ? { storeId: String(storeId) } : {};
  }

  getBoard(companyId: number, storeId: number | null): Promise<DriverTipsBoard> {
    return firstValueFrom(
      this.http.get<DriverTipsBoard>(`${this.base}/${companyId}/driver-tips`, { params: this.storeParam(storeId) }),
    );
  }

  listPendingOrders(companyId: number, driverId: number, storeId: number | null, asOf?: string): Promise<DriverTipOrder[]> {
    const params = { ...this.storeParam(storeId), ...(asOf ? { asOf } : {}) };
    return firstValueFrom(
      this.http.get<{ data: DriverTipOrder[] }>(`${this.base}/${companyId}/driver-tips/${driverId}/orders`, { params }),
    ).then((r) => r.data);
  }

  listPayouts(companyId: number, storeId: number | null, page: number, pageSize: number): Promise<DriverTipPayoutsPage> {
    const params = { ...this.storeParam(storeId), page: String(page), pageSize: String(pageSize) };
    return firstValueFrom(
      this.http.get<DriverTipPayoutsPage>(`${this.base}/${companyId}/driver-tips/payouts`, { params }),
    );
  }

  listPayoutOrders(companyId: number, payoutId: number, storeId: number | null): Promise<DriverTipOrder[]> {
    return firstValueFrom(
      this.http.get<{ data: DriverTipOrder[] }>(`${this.base}/${companyId}/driver-tips/payouts/${payoutId}/orders`, {
        params: this.storeParam(storeId),
      }),
    ).then((r) => r.data);
  }
}
