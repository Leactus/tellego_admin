import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { LegalAcceptanceSummary, LegalDocument, LegalDocumentType } from '../models/legal.model';

/**
 * Documentos legales de la plataforma (términos y condiciones / privacidad),
 * versionados. Publicar una versión nueva no edita ni borra la anterior —
 * conserva el historial de qué texto aceptó cada usuario.
 */
@Injectable({ providedIn: 'root' })
export class LegalDocumentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/legal-documents`;

  /** Historial completo de versiones (ambos tipos), la más nueva primero por tipo. */
  list(): Promise<LegalDocument[]> {
    return firstValueFrom(this.http.get<{ data: LegalDocument[] }>(this.base)).then((r) => r.data);
  }

  acceptancesSummary(): Promise<LegalAcceptanceSummary[]> {
    return firstValueFrom(
      this.http.get<{ data: LegalAcceptanceSummary[] }>(`${this.base}/acceptances-summary`),
    ).then((r) => r.data);
  }

  /** Publica una versión nueva del documento (queda como la vigente). */
  publish(payload: { docType: LegalDocumentType; content: string; effectiveDate?: string }): Promise<LegalDocument> {
    return firstValueFrom(this.http.post<{ data: LegalDocument }>(this.base, payload)).then((r) => r.data);
  }
}
