import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Company, PlatformPayment } from '../models/company.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

interface CreatePaymentInput {
  amount: number;
  method: 'cash' | 'transfer' | 'card';
  periodStart: string;
  periodEnd: string;
  note?: string;
  nextPaymentDueDate?: string;
}

/** Solo para negocios de cuota fija — ver createAdvance en admin/payments.controller.ts. */
interface CreateAdvancePaymentInput {
  months: number;
  method: 'cash' | 'transfer' | 'card';
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly base = (companyId: number) => `${environment.apiUrl}/admin/companies/${companyId}/payments`;

  listByCompany(companyId: number, params?: PageParams): Promise<Paginated<PlatformPayment>> {
    return firstValueFrom(
      this.http.get<Paginated<PlatformPayment>>(this.base(companyId), { params: toHttpParams(params) }),
    );
  }

  create(companyId: number, input: CreatePaymentInput): Promise<{ data: PlatformPayment; company: Company }> {
    return firstValueFrom(
      this.http.post<{ data: PlatformPayment; company: Company }>(this.base(companyId), input),
    );
  }

  /** Registra varios meses de cuota fija de una sola vez — el monto lo calcula el backend (monthlyFee × months). */
  createAdvance(
    companyId: number,
    input: CreateAdvancePaymentInput,
  ): Promise<{ data: PlatformPayment[]; company: Company; totalAmount: number }> {
    return firstValueFrom(
      this.http.post<{ data: PlatformPayment[]; company: Company; totalAmount: number }>(
        `${this.base(companyId)}/advance`,
        input,
      ),
    );
  }
}
