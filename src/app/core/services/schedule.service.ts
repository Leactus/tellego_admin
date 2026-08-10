import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { StoreScheduleDay } from '../models/schedule.model';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);
  private readonly base = (storeId: number) => `${environment.apiUrl}/admin/stores/${storeId}/schedule`;

  get(storeId: number): Promise<StoreScheduleDay[]> {
    return firstValueFrom(this.http.get<{ data: StoreScheduleDay[] }>(this.base(storeId))).then((r) => r.data);
  }

  update(storeId: number, days: StoreScheduleDay[]): Promise<StoreScheduleDay[]> {
    return firstValueFrom(this.http.put<{ data: StoreScheduleDay[] }>(this.base(storeId), { days })).then(
      (r) => r.data,
    );
  }

  /** Copia el horario ya guardado de `storeId` a otras sucursales de la misma empresa. */
  copyToBranches(storeId: number, targetStoreIds: number[]): Promise<{ copiedTo: number[] }> {
    return firstValueFrom(
      this.http.post<{ data: { copiedTo: number[] } }>(`${this.base(storeId)}/copy`, { targetStoreIds }),
    ).then((r) => r.data);
  }
}
