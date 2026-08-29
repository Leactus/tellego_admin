import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Order, OrdersPage, OrderStatus } from '../models/order.model';

export interface AdminOrdersParams {
  page?: number;
  pageSize?: number;
  /** 'active' (en curso, default), 'all', o un estado puntual. */
  status?: OrderStatus | 'active' | 'all';
  /** Sucursal puntual — omitir para ver todas las de la empresa. */
  storeId?: number | null;
}

/** Pedidos de cualquier negocio, solo lectura, para el super-admin (soporte/auditoría). */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  listByCompany(companyId: number, params: AdminOrdersParams = {}): Promise<OrdersPage> {
    const query: Record<string, string> = {};
    if (params.page) query['page'] = String(params.page);
    if (params.pageSize) query['pageSize'] = String(params.pageSize);
    if (params.status && params.status !== 'active') query['status'] = params.status;
    if (params.storeId != null) query['storeId'] = String(params.storeId);

    return firstValueFrom(
      this.http.get<OrdersPage>(`${this.base}/companies/${companyId}/orders`, { params: query }),
    );
  }

  getOne(id: number): Promise<Order> {
    return firstValueFrom(this.http.get<{ data: Order }>(`${this.base}/orders/${id}`)).then((r) => r.data);
  }
}
