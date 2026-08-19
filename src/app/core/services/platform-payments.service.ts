import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { PlatformApayCredencial, PlatformBankAccount, PlatformBankName } from '../models/company.model';

export interface PlatformBankAccountInput {
  bankName: PlatformBankName;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
}

/** Cuentas bancarias y credencial APay de la EMPRESA MADRE — lo que los negocios ven en /negocio/pagos
 * como formas de pago hacia la plataforma. No confundir con CompaniesService#*ApayCredencial (esa es
 * la cuenta APay de CADA negocio, para cobrar a SUS clientes). */
@Injectable({ providedIn: 'root' })
export class PlatformPaymentsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listBankAccounts(): Promise<PlatformBankAccount[]> {
    return firstValueFrom(
      this.http.get<{ data: PlatformBankAccount[] }>(`${this.base}/admin/platform-bank-accounts`),
    ).then((r) => r.data);
  }

  createBankAccount(input: PlatformBankAccountInput): Promise<PlatformBankAccount> {
    return firstValueFrom(
      this.http.post<{ data: PlatformBankAccount }>(`${this.base}/admin/platform-bank-accounts`, input),
    ).then((r) => r.data);
  }

  updateBankAccount(
    id: number,
    input: Partial<PlatformBankAccountInput> & { status?: 'active' | 'inactive' },
  ): Promise<PlatformBankAccount> {
    return firstValueFrom(
      this.http.patch<{ data: PlatformBankAccount }>(`${this.base}/admin/platform-bank-accounts/${id}`, input),
    ).then((r) => r.data);
  }

  /** Credencial APay activa de la plataforma (null si no tiene ninguna configurada) — el token real nunca viaja al frontend. */
  getApayCredencial(): Promise<PlatformApayCredencial | null> {
    return firstValueFrom(
      this.http.get<{ data: PlatformApayCredencial | null }>(`${this.base}/admin/platform-apay-credencial`),
    ).then((r) => r.data);
  }

  /** Guarda un token nuevo; si ya había uno activo, lo rota (se desactiva el anterior). */
  saveApayCredencial(payload: { apayToken: string; apayBusinessId?: string }): Promise<PlatformApayCredencial> {
    return firstValueFrom(
      this.http.post<{ data: PlatformApayCredencial }>(`${this.base}/admin/platform-apay-credencial`, payload),
    ).then((r) => r.data);
  }

  deleteApayCredencial(credencialId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/admin/platform-apay-credencial/${credencialId}`));
  }

  /** Consulta explícita del token/id_business completos — para el botón "Revelar", nunca se cargan junto al resto. */
  revealApayCredencial(): Promise<{ apayToken: string; apayBusinessId: string | null }> {
    return firstValueFrom(
      this.http.get<{ data: { apayToken: string; apayBusinessId: string | null } }>(
        `${this.base}/admin/platform-apay-credencial/revelar`,
      ),
    ).then((r) => r.data);
  }
}
