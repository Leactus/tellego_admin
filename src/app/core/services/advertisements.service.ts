import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Advertisement, AdvertisementStatus } from '../models/advertisement.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

interface CreateAdvertisementInput {
  storeId: number;
  productId?: number | null;
  durationDays: number;
  cost: number;
}

@Injectable({ providedIn: 'root' })
export class AdvertisementsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/advertisements`;

  list(
    params?: PageParams & { status?: AdvertisementStatus; type?: 'store' | 'product' },
  ): Promise<Paginated<Advertisement>> {
    const httpParams = {
      ...toHttpParams(params),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.type ? { type: params.type } : {}),
    };
    return firstValueFrom(this.http.get<Paginated<Advertisement>>(this.base, { params: httpParams }));
  }

  /** El admin la crea directamente (sin pasar por una solicitud del dueño) — queda aprobada de inmediato. */
  create(input: CreateAdvertisementInput): Promise<Advertisement> {
    return firstValueFrom(this.http.post<{ data: Advertisement }>(this.base, input)).then((r) => r.data);
  }

  approve(id: number, durationDays: number, cost: number): Promise<Advertisement> {
    return firstValueFrom(
      this.http.patch<{ data: Advertisement }>(`${this.base}/${id}/approve`, { durationDays, cost }),
    ).then((r) => r.data);
  }

  reject(id: number, reason?: string): Promise<Advertisement> {
    return firstValueFrom(this.http.patch<{ data: Advertisement }>(`${this.base}/${id}/reject`, { reason })).then(
      (r) => r.data,
    );
  }
}
