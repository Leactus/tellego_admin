import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { ApayCredencial, Company, CompanyBillingType, CompanyOwner, CompanySales, CompanyStatus, Country, Department } from '../models/company.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

interface BillingUpdate {
  billingType?: CompanyBillingType;
  monthlyFee?: number;
  commissionRate?: number;
  nextPaymentDueDate?: string | null;
  billingStartsAt?: string | null;
  /** null = vuelve a usar el general (PlatformSettings.defaultGracePeriodDays). */
  gracePeriodDays?: number | null;
  penaltyEnabled?: boolean;
}

interface CreateCompanyInput {
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  countryId?: number;
  billingType: CompanyBillingType;
  monthlyFee?: number;
  commissionRate?: number;
  /** Solo se envía al crear — el backend lo ignora/rechaza si ya está asignado (fijo tras asignarse). */
  businessTypeId?: number;
  /** Solo aplica si viene businessTypeId. */
  subcategoryIds?: number[];
  /** Días de cortesía antes de que este negocio empiece a poder considerarse moroso (billingStartsAt = hoy + freeTrialDays). Omitido o 0 = sin periodo gratis, mismo comportamiento que antes. */
  freeTrialDays?: number;
}

export type PaymentStatusFilter = 'all' | 'overdue' | 'current';

export interface CompaniesPage extends Paginated<Company> {
  /** Totales de TODAS las empresas activas (no del texto buscado ni de la página) — para las pestañas de /pagos. */
  paymentCounts: { overdue: number; current: number };
}

@Injectable({ providedIn: 'root' })
export class CompaniesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/companies`;

  create(input: CreateCompanyInput): Promise<{ data: Company; tempPassword: string }> {
    return firstValueFrom(this.http.post<{ data: Company; tempPassword: string }>(this.base, input));
  }

  list(params?: PageParams & { paymentStatus?: PaymentStatusFilter }): Promise<CompaniesPage> {
    const httpParams = {
      ...toHttpParams(params),
      ...(params?.paymentStatus ? { paymentStatus: params.paymentStatus } : {}),
    };
    return firstValueFrom(this.http.get<CompaniesPage>(this.base, { params: httpParams }));
  }

  getOne(id: number): Promise<Company> {
    return firstValueFrom(this.http.get<{ data: Company }>(`${this.base}/${id}`)).then((r) => r.data);
  }

  updateStatus(id: number, status: CompanyStatus): Promise<Company> {
    return firstValueFrom(
      this.http.patch<{ data: Company }>(`${this.base}/${id}/status`, { status }),
    ).then((r) => r.data);
  }

  updateBilling(id: number, billing: BillingUpdate): Promise<Company> {
    return firstValueFrom(
      this.http.patch<{ data: Company }>(`${this.base}/${id}/billing`, billing),
    ).then((r) => r.data);
  }

  /** Tipo de negocio (solo se puede asignar una vez) y subcategorías (editables en cualquier momento) — GLOBALES para toda la empresa. */
  updateBusinessType(id: number, payload: { businessTypeId?: number; subcategoryIds?: number[] }): Promise<Company> {
    return firstValueFrom(
      this.http.patch<{ data: Company }>(`${this.base}/${id}/business-type`, payload),
    ).then((r) => r.data);
  }

  /** Ventas reales (todas las sucursales de la empresa) en un periodo — para sugerir el monto a cobrar cuando billingType='commission'. */
  getSales(id: number, periodStart: string, periodEnd: string): Promise<CompanySales> {
    return firstValueFrom(
      this.http.get<{ data: CompanySales }>(`${this.base}/${id}/sales`, { params: { periodStart, periodEnd } }),
    ).then((r) => r.data);
  }

  /** Edita el nombre/correo/teléfono del dueño de la empresa (no el negocio en sí). */
  updateOwner(id: number, payload: { name?: string; email?: string; phone?: string }): Promise<CompanyOwner> {
    return firstValueFrom(
      this.http.patch<{ data: CompanyOwner }>(`${this.base}/${id}/owner`, payload),
    ).then((r) => r.data);
  }

  /** Genera una nueva contraseña temporal para el dueño. */
  resetOwnerPassword(id: number): Promise<string> {
    return firstValueFrom(
      this.http.post<{ tempPassword: string }>(`${this.base}/${id}/owner/reset-password`, {}),
    ).then((r) => r.tempPassword);
  }

  /** Departamentos del país de esta empresa — para el select de "Región / departamento" de sus sucursales. */
  listDepartments(companyId: number): Promise<Department[]> {
    return firstValueFrom(
      this.http.get<{ data: Department[] }>(`${this.base}/${companyId}/departments`),
    ).then((r) => r.data);
  }

  /** Credencial APay activa del negocio (null si no tiene ninguna configurada) — el token real nunca viaja al frontend. */
  getApayCredencial(id: number): Promise<ApayCredencial | null> {
    return firstValueFrom(
      this.http.get<{ data: ApayCredencial | null }>(`${this.base}/${id}/apay-credenciales`),
    ).then((r) => r.data);
  }

  /** Guarda un token nuevo; si ya había uno activo, lo rota (se desactiva el anterior). */
  saveApayCredencial(id: number, payload: { apayToken: string; apayBusinessId?: string }): Promise<ApayCredencial> {
    return firstValueFrom(
      this.http.post<{ data: ApayCredencial }>(`${this.base}/${id}/apay-credenciales`, payload),
    ).then((r) => r.data);
  }

  deleteApayCredencial(id: number, credencialId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}/apay-credenciales/${credencialId}`));
  }

  /** Consulta explícita del token/id_business completos — para el botón "Revelar", nunca se cargan junto al resto. */
  revealApayCredencial(id: number): Promise<{ apayToken: string; apayBusinessId: string | null }> {
    return firstValueFrom(
      this.http.get<{ data: { apayToken: string; apayBusinessId: string | null } }>(
        `${this.base}/${id}/apay-credenciales/revelar`,
      ),
    ).then((r) => r.data);
  }

  /** Países disponibles en la plataforma — para el select de país al crear un negocio. */
  listCountries(): Promise<Country[]> {
    return firstValueFrom(
      this.http.get<{ data: Country[] }>(`${environment.apiUrl}/admin/countries`),
    ).then((r) => r.data);
  }
}
