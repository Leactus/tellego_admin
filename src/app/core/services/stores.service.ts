import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Store, StoreInput } from '../models/store.model';

@Injectable({ providedIn: 'root' })
export class StoresService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  create(companyId: number, input: StoreInput): Promise<Store> {
    return firstValueFrom(
      this.http.post<{ data: Store }>(`${this.base}/admin/companies/${companyId}/stores`, input),
    ).then((r) => r.data);
  }

  update(storeId: number, input: StoreInput): Promise<Store> {
    return firstValueFrom(this.http.patch<{ data: Store }>(`${this.base}/admin/stores/${storeId}`, input)).then(
      (r) => r.data,
    );
  }
}
