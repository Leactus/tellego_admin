export type LegalDocumentType = 'terms' | 'privacy';

export interface LegalDocument {
  id: number;
  docType: LegalDocumentType;
  version: number;
  content: string;
  effectiveDate: string;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: { id: number; name: string } | null;
}

export interface LegalAcceptanceSummary {
  docType: LegalDocumentType;
  currentVersion: number;
  acceptedCurrent: number;
  acceptedTotal: number;
}

export const LEGAL_DOC_LABELS: Record<LegalDocumentType, string> = {
  terms: 'Términos y Condiciones',
  privacy: 'Política de Privacidad',
};
