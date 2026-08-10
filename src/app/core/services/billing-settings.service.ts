import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PlatformSettings } from '../models/company.model';

/** Valores por defecto sugeridos al crear un negocio nuevo (cuota mensual / % de comisión). Editarlos NO afecta negocios ya creados. */
@Injectable({ providedIn: 'root' })
export class BillingSettingsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/billing-settings`;

  get(): Promise<PlatformSettings> {
    return firstValueFrom(this.http.get<{ data: PlatformSettings }>(this.base)).then((r) => r.data);
  }

  update(payload: {
    defaultMonthlyFee?: number;
    defaultCommissionRate?: number;
    defaultGracePeriodDays?: number;
  }): Promise<PlatformSettings> {
    return firstValueFrom(this.http.patch<{ data: PlatformSettings }>(this.base, payload)).then((r) => r.data);
  }
}
