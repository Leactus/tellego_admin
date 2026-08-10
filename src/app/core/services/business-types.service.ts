import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { BusinessType, BusinessTypeStatus } from '../models/businessType.model';

/** Catálogo maestro de tipos de negocio (Configuraciones > Tipos de negocio). */
@Injectable({ providedIn: 'root' })
export class BusinessTypesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  list(): Promise<BusinessType[]> {
    return firstValueFrom(this.http.get<{ data: BusinessType[] }>(`${this.base}/business-types`)).then((r) => r.data);
  }

  create(name: string): Promise<BusinessType> {
    return firstValueFrom(
      this.http.post<{ data: BusinessType }>(`${this.base}/business-types`, { name }),
    ).then((r) => r.data);
  }

  update(id: number, input: { name?: string; status?: BusinessTypeStatus }): Promise<BusinessType> {
    return firstValueFrom(
      this.http.patch<{ data: BusinessType }>(`${this.base}/business-types/${id}`, input),
    ).then((r) => r.data);
  }

  remove(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/business-types/${id}`));
  }

  uploadImage(id: number, file: File): Promise<BusinessType> {
    const form = new FormData();
    form.append('image', file);
    return firstValueFrom(
      this.http.post<{ data: BusinessType }>(`${this.base}/business-types/${id}/image`, form),
    ).then((r) => r.data);
  }
}
