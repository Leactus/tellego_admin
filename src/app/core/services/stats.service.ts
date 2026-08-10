import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PlatformStats } from '../models/stats.model';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/stats`;

  /** `from`/`to`: 'YYYY-MM-DD' (sin ellas, últimos 30 días). */
  getStats(params?: { from?: string; to?: string }): Promise<PlatformStats> {
    const httpParams = {
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
    };
    return firstValueFrom(this.http.get<{ data: PlatformStats }>(this.base, { params: httpParams })).then(
      (r) => r.data,
    );
  }
}
