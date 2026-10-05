import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PageParams, toHttpParams } from '../models/pagination.model';
import { Referral, ReferralProgram, ReferralProgramPayload, ReferralsPage, ReferralStatus } from '../models/referral.model';

/**
 * Referidos de repartidores — "Invita y gana" (backend: services/driverReferral.service.ts). El admin
 * define las reglas (entregas, premio, plazo, para quién) y paga a mano cada premio completado.
 */
@Injectable({ providedIn: 'root' })
export class ReferralsService {
  private readonly http = inject(HttpClient);
  private readonly programsUrl = `${environment.apiUrl}/admin/referral-programs`;
  private readonly referralsUrl = `${environment.apiUrl}/admin/referrals`;

  listPrograms(): Promise<ReferralProgram[]> {
    return firstValueFrom(this.http.get<{ data: ReferralProgram[] }>(this.programsUrl)).then((r) => r.data);
  }

  createProgram(payload: ReferralProgramPayload): Promise<ReferralProgram> {
    return firstValueFrom(this.http.post<{ data: ReferralProgram }>(this.programsUrl, payload)).then((r) => r.data);
  }

  updateProgram(id: number, payload: Partial<ReferralProgramPayload>): Promise<ReferralProgram> {
    return firstValueFrom(this.http.patch<{ data: ReferralProgram }>(`${this.programsUrl}/${id}`, payload)).then(
      (r) => r.data,
    );
  }

  list(params: PageParams & { status?: ReferralStatus | null; q?: string }): Promise<ReferralsPage> {
    const httpParams: Record<string, string> = {
      ...toHttpParams(params),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q ? { q: params.q } : {}),
    };
    return firstValueFrom(this.http.get<ReferralsPage>(this.referralsUrl, { params: httpParams }));
  }

  get(id: number): Promise<Referral> {
    return firstValueFrom(this.http.get<{ data: Referral }>(`${this.referralsUrl}/${id}`)).then((r) => r.data);
  }

  pay(id: number, payload: { reference?: string; note?: string }): Promise<Referral> {
    return firstValueFrom(this.http.post<{ data: Referral }>(`${this.referralsUrl}/${id}/pay`, payload)).then(
      (r) => r.data,
    );
  }

  cancel(id: number, reason: string): Promise<Referral> {
    return firstValueFrom(this.http.post<{ data: Referral }>(`${this.referralsUrl}/${id}/cancel`, { reason })).then(
      (r) => r.data,
    );
  }
}
