import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { StaffMember } from '../models/store.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

/** Personal de cualquier negocio, administrado por el super-admin — espejo de owner.service.ts pero por companyId explícito. */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  list(companyId: number, params?: PageParams): Promise<Paginated<StaffMember>> {
    return firstValueFrom(
      this.http.get<Paginated<StaffMember>>(`${this.base}/companies/${companyId}/staff`, {
        params: toHttpParams(params),
      }),
    );
  }

  create(
    companyId: number,
    payload: { name: string; email: string; password: string; phone?: string; storeId: number; position?: string },
  ): Promise<StaffMember> {
    return firstValueFrom(
      this.http.post<{ data: StaffMember }>(`${this.base}/companies/${companyId}/staff`, payload),
    ).then((r) => r.data);
  }

  update(
    id: number,
    payload: {
      position?: string;
      storeId?: number;
      status?: 'active' | 'suspended';
      name?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<StaffMember> {
    return firstValueFrom(this.http.patch<{ data: StaffMember }>(`${this.base}/staff/${id}`, payload)).then(
      (r) => r.data,
    );
  }

  delete(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/staff/${id}`));
  }
}
