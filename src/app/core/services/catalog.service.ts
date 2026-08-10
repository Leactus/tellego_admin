import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { OptionGroup, OptionItem, Product, ProductCategory, StoreProductInfo } from '../models/catalog.model';

interface ProductInput {
  name?: string;
  description?: string;
  price?: number;
  salePrice?: number | null;
  categoryId?: number | null;
  isAvailable?: boolean;
  storeId?: number;
}

interface AvailabilityInput {
  storeId: number;
  isAvailable?: boolean;
  priceOverride?: number | null;
  salePriceOverride?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // --- Categorías ---
  listCategories(companyId: number): Promise<ProductCategory[]> {
    return firstValueFrom(
      this.http.get<{ data: ProductCategory[] }>(`${this.base}/admin/companies/${companyId}/categories`),
    ).then((r) => r.data);
  }

  createCategory(companyId: number, name: string, position?: number): Promise<ProductCategory> {
    return firstValueFrom(
      this.http.post<{ data: ProductCategory }>(`${this.base}/admin/companies/${companyId}/categories`, {
        name,
        position,
      }),
    ).then((r) => r.data);
  }

  updateCategory(id: number, name: string, position?: number): Promise<ProductCategory> {
    return firstValueFrom(
      this.http.patch<{ data: ProductCategory }>(`${this.base}/admin/categories/${id}`, { name, position }),
    ).then((r) => r.data);
  }

  deleteCategory(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/admin/categories/${id}`));
  }

  // --- Productos ---
  listProducts(companyId: number): Promise<Product[]> {
    return firstValueFrom(
      this.http.get<{ data: Product[] }>(`${this.base}/admin/companies/${companyId}/products`),
    ).then((r) => r.data);
  }

  createProduct(companyId: number, input: ProductInput): Promise<Product> {
    return firstValueFrom(
      this.http.post<{ data: Product }>(`${this.base}/admin/companies/${companyId}/products`, input),
    ).then((r) => r.data);
  }

  updateProduct(id: number, input: ProductInput): Promise<Product> {
    return firstValueFrom(this.http.patch<{ data: Product }>(`${this.base}/admin/products/${id}`, input)).then(
      (r) => r.data,
    );
  }

  deleteProduct(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/admin/products/${id}`));
  }

  uploadProductImage(id: number, file: File): Promise<Product> {
    const form = new FormData();
    form.append('image', file);
    return firstValueFrom(
      this.http.post<{ data: Product }>(`${this.base}/admin/products/${id}/image`, form),
    ).then((r) => r.data);
  }

  updateAvailability(productId: number, input: AvailabilityInput): Promise<StoreProductInfo> {
    return firstValueFrom(
      this.http.patch<{ data: StoreProductInfo }>(`${this.base}/admin/products/${productId}/availability`, input),
    ).then((r) => r.data);
  }

  // --- Grupos y opciones ---
  createOptionGroup(
    productId: number,
    input: { name: string; minSelection?: number; maxSelection?: number; isRequired?: boolean },
  ): Promise<OptionGroup> {
    return firstValueFrom(
      this.http.post<{ data: OptionGroup }>(`${this.base}/admin/products/${productId}/option-groups`, input),
    ).then((r) => r.data);
  }

  deleteOptionGroup(groupId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/admin/option-groups/${groupId}`));
  }

  createOptionItem(groupId: number, input: { name: string; extraPrice?: number }): Promise<OptionItem> {
    return firstValueFrom(
      this.http.post<{ data: OptionItem }>(`${this.base}/admin/option-groups/${groupId}/items`, input),
    ).then((r) => r.data);
  }

  deleteOptionItem(itemId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/admin/option-items/${itemId}`));
  }
}
