import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PageParams, toHttpParams } from '../models/pagination.model';
import {
  MarketplaceOrder,
  MarketplaceOrderStatus,
  MarketplaceOrdersPage,
  MarketplaceProduct,
  MarketplaceProductPayload,
  MarketplacePromotionPayload,
} from '../models/marketplace.model';

/**
 * Tienda Tellego (backend: controllers/admin/marketplace.controller.ts): catálogo de lo que la
 * plataforma vende a negocios y repartidores freelance, con fotos y promociones, y las solicitudes
 * de compra que el admin confirma, cobra y entrega a mano.
 */
@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/marketplace`;

  listProducts(): Promise<MarketplaceProduct[]> {
    return firstValueFrom(this.http.get<{ data: MarketplaceProduct[] }>(`${this.base}/products`)).then((r) => r.data);
  }

  createProduct(payload: MarketplaceProductPayload): Promise<MarketplaceProduct> {
    return firstValueFrom(this.http.post<{ data: MarketplaceProduct }>(`${this.base}/products`, payload)).then((r) => r.data);
  }

  updateProduct(id: number, payload: MarketplaceProductPayload): Promise<MarketplaceProduct> {
    return firstValueFrom(this.http.patch<{ data: MarketplaceProduct }>(`${this.base}/products/${id}`, payload)).then(
      (r) => r.data,
    );
  }

  removeProduct(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/products/${id}`));
  }

  uploadImage(productId: number, file: File): Promise<MarketplaceProduct> {
    const form = new FormData();
    form.append('image', file);
    return firstValueFrom(
      this.http.post<{ data: MarketplaceProduct }>(`${this.base}/products/${productId}/images`, form),
    ).then((r) => r.data);
  }

  removeImage(imageId: number): Promise<MarketplaceProduct> {
    return firstValueFrom(this.http.delete<{ data: MarketplaceProduct }>(`${this.base}/images/${imageId}`)).then(
      (r) => r.data,
    );
  }

  /** La primera de la lista queda como portada. */
  reorderImages(productId: number, imageIds: number[]): Promise<MarketplaceProduct> {
    return firstValueFrom(
      this.http.put<{ data: MarketplaceProduct }>(`${this.base}/products/${productId}/images/order`, { imageIds }),
    ).then((r) => r.data);
  }

  createPromotion(productId: number, payload: MarketplacePromotionPayload): Promise<MarketplaceProduct> {
    return firstValueFrom(
      this.http.post<{ data: MarketplaceProduct }>(`${this.base}/products/${productId}/promotions`, payload),
    ).then((r) => r.data);
  }

  updatePromotion(promotionId: number, payload: Partial<MarketplacePromotionPayload>): Promise<MarketplaceProduct> {
    return firstValueFrom(
      this.http.patch<{ data: MarketplaceProduct }>(`${this.base}/promotions/${promotionId}`, payload),
    ).then((r) => r.data);
  }

  removePromotion(promotionId: number): Promise<MarketplaceProduct> {
    return firstValueFrom(this.http.delete<{ data: MarketplaceProduct }>(`${this.base}/promotions/${promotionId}`)).then(
      (r) => r.data,
    );
  }

  listOrders(
    params?: PageParams & { status?: MarketplaceOrderStatus; buyerType?: 'company' | 'driver' },
  ): Promise<MarketplaceOrdersPage> {
    const httpParams: Record<string, string> = {
      ...toHttpParams(params),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.buyerType ? { buyerType: params.buyerType } : {}),
    };
    return firstValueFrom(this.http.get<MarketplaceOrdersPage>(`${this.base}/orders`, { params: httpParams }));
  }

  updateOrderStatus(
    id: number,
    payload: { status: MarketplaceOrderStatus; cancelReason?: string; adminNote?: string },
  ): Promise<MarketplaceOrder> {
    return firstValueFrom(this.http.patch<{ data: MarketplaceOrder }>(`${this.base}/orders/${id}/status`, payload)).then(
      (r) => r.data,
    );
  }

  updateOrderPayment(
    id: number,
    payload: { paid: boolean; method?: 'cash' | 'transfer'; reference?: string; paidAt?: string },
  ): Promise<MarketplaceOrder> {
    return firstValueFrom(this.http.patch<{ data: MarketplaceOrder }>(`${this.base}/orders/${id}/payment`, payload)).then(
      (r) => r.data,
    );
  }

  updateOrderNote(id: number, adminNote: string): Promise<MarketplaceOrder> {
    return firstValueFrom(this.http.patch<{ data: MarketplaceOrder }>(`${this.base}/orders/${id}/note`, { adminNote })).then(
      (r) => r.data,
    );
  }
}
