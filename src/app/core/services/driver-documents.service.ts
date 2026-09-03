import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import {
  CountryDriverSettings,
  DriverDocumentAccepts,
  DriverDocumentFieldDef,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnboardingState,
} from '../models/driver-onboarding.model';

interface DocumentTypeInput {
  countryId?: number | null;
  key?: string;
  label?: string;
  description?: string | null;
  twoSided?: boolean;
  accepts?: DriverDocumentAccepts;
  fields?: DriverDocumentFieldDef[] | null;
  isRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Onboarding del repartidor POR PAÍS: revisión de los documentos que sube
 * (aprobar / rechazar), CRUD del catálogo de documentos por país, y el
 * capital mínimo de cada país.
 */
@Injectable({ providedIn: 'root' })
export class DriverDocumentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  /** Checklist de onboarding de un repartidor: capital + documentos con su estado. */
  getOnboarding(driverId: number): Promise<DriverOnboardingState> {
    return firstValueFrom(
      this.http.get<{ data: DriverOnboardingState }>(`${this.base}/drivers/${driverId}/documents`),
    ).then((r) => r.data);
  }

  /** Aprueba o rechaza un archivo subido. `reason` obligatorio al rechazar. */
  reviewDocument(
    documentId: number,
    status: Extract<DriverDocumentStatus, 'approved' | 'rejected'>,
    reviewReason?: string,
  ): Promise<{ onboarding: DriverOnboardingState | null }> {
    return firstValueFrom(
      this.http.patch<{ data: { onboarding: DriverOnboardingState | null } }>(
        `${this.base}/driver-documents/${documentId}`,
        { status, ...(reviewReason ? { reviewReason } : {}) },
      ),
    ).then((r) => r.data);
  }

  // --- Catálogo dinámico por país ---

  /** Con `countryId`: los de ese país + los globales. `null` = solo globales. `undefined` = todos. */
  listTypes(countryId?: number | null): Promise<DriverDocumentType[]> {
    const params: Record<string, string> =
      countryId != null ? { countryId: String(countryId) } : countryId === null ? { countryId: 'null' } : {};
    return firstValueFrom(
      this.http.get<{ data: DriverDocumentType[] }>(`${this.base}/driver-document-types`, { params }),
    ).then((r) => r.data);
  }

  createType(input: DocumentTypeInput): Promise<DriverDocumentType> {
    return firstValueFrom(
      this.http.post<{ data: DriverDocumentType }>(`${this.base}/driver-document-types`, input),
    ).then((r) => r.data);
  }

  updateType(id: number, input: DocumentTypeInput): Promise<DriverDocumentType> {
    return firstValueFrom(
      this.http.patch<{ data: DriverDocumentType }>(`${this.base}/driver-document-types/${id}`, input),
    ).then((r) => r.data);
  }

  removeType(id: number): Promise<void> {
    return firstValueFrom(this.http.delete(`${this.base}/driver-document-types/${id}`)).then(() => undefined);
  }

  // --- Capital mínimo por país ---

  getCountrySettings(countryId: number): Promise<CountryDriverSettings> {
    return firstValueFrom(
      this.http.get<{ data: CountryDriverSettings }>(`${this.base}/countries/${countryId}/driver-settings`),
    ).then((r) => r.data);
  }

  /** `minCapital: null` vuelve a usar el global. */
  setCountrySettings(countryId: number, minCapital: number | null): Promise<CountryDriverSettings> {
    return firstValueFrom(
      this.http.put<{ data: CountryDriverSettings }>(`${this.base}/countries/${countryId}/driver-settings`, {
        minCapital,
      }),
    ).then((r) => r.data);
  }
}
