import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Order, OrdersPage, OrderStatus } from '../models/order.model';
import { OrderChatTranscript } from '../models/order-chat.model';

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

  /**
   * Genera (o regenera) el código de retiro de un pedido con repartidor
   * freelance — para cuando no se creó solo al aceptar la oferta. El backend
   * lo empuja en vivo a la sucursal y al repartidor (socket).
   */
  regeneratePickupCode(orderId: number): Promise<string> {
    return firstValueFrom(
      this.http.post<{ data: { orderId: number; pickupCode: string } }>(
        `${this.base}/orders/${orderId}/pickup-code/regenerate`,
        {},
      ),
    ).then((r) => r.data.pickupCode);
  }

  /**
   * Transcripción del chat cliente ↔ repartidor de un pedido, para dar
   * seguimiento a un reporte. Solo lectura y funciona aunque el chat ya esté
   * cerrado (el backend lo lee con el Admin SDK). Puede devolver 503 si el
   * chat no está configurado — el llamador lo maneja.
   */
  getOrderChat(id: number): Promise<OrderChatTranscript> {
    return firstValueFrom(
      this.http.get<{ data: OrderChatTranscript }>(`${this.base}/orders/${id}/chat`),
    ).then((r) => r.data);
  }
}
