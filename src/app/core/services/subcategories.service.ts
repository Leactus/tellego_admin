import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Subcategory, SubcategoryAvailability, SubcategoryStatus } from '../models/subcategory.model';

/** Catálogo maestro de subcategorías (Configuraciones > Tipos de negocio) y su habilitación por país. */
@Injectable({ providedIn: 'root' })
export class SubcategoriesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  /** Subcategorías de un tipo de negocio (todos los países). */
  listByBusinessType(businessTypeId: number): Promise<Subcategory[]> {
    return firstValueFrom(
      this.http.get<{ data: Subcategory[] }>(`${this.base}/subcategories`, { params: { businessTypeId } }),
    ).then((r) => r.data);
  }

  create(businessTypeId: number, name: string): Promise<Subcategory> {
    return firstValueFrom(
      this.http.post<{ data: Subcategory }>(`${this.base}/business-types/${businessTypeId}/subcategories`, { name }),
    ).then((r) => r.data);
  }

  update(id: number, input: { name?: string; status?: SubcategoryStatus }): Promise<Subcategory> {
    return firstValueFrom(
      this.http.patch<{ data: Subcategory }>(`${this.base}/subcategories/${id}`, input),
    ).then((r) => r.data);
  }

  remove(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/subcategories/${id}`));
  }

  uploadImage(id: number, file: File): Promise<Subcategory> {
    const form = new FormData();
    form.append('image', file);
    return firstValueFrom(
      this.http.post<{ data: Subcategory }>(`${this.base}/subcategories/${id}/image`, form),
    ).then((r) => r.data);
  }

  /** Catálogo completo (todos los tipos de negocio) con `enabled` según si está habilitada para ese país. */
  listByCountry(countryId: number): Promise<SubcategoryAvailability[]> {
    return firstValueFrom(
      this.http.get<{ data: SubcategoryAvailability[] }>(`${this.base}/countries/${countryId}/subcategories`),
    ).then((r) => r.data);
  }

  enableForCountry(countryId: number, subcategoryId: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/countries/${countryId}/subcategories/${subcategoryId}`, {}),
    );
  }

  disableForCountry(countryId: number, subcategoryId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/countries/${countryId}/subcategories/${subcategoryId}`),
    );
  }
}
