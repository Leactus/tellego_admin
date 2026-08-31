export type LegalDocumentType = 'terms' | 'privacy';

/** Público al que aplica un documento legal — cada flujo de registro acepta solo los de su público. */
export type LegalAudience = 'cliente' | 'repartidor' | 'negocio';

export interface LegalDocument {
  id: number;
  docType: LegalDocumentType;
  audience: LegalAudience;
  version: number;
  content: string;
  effectiveDate: string;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: { id: number; name: string } | null;
}

export interface LegalAcceptanceSummary {
  docType: LegalDocumentType;
  audience: LegalAudience;
  currentVersion: number;
  acceptedCurrent: number;
  acceptedTotal: number;
}

export const LEGAL_DOC_LABELS: Record<LegalDocumentType, string> = {
  terms: 'Términos y Condiciones',
  privacy: 'Política de Privacidad',
};

export const LEGAL_AUDIENCES: LegalAudience[] = ['cliente', 'repartidor', 'negocio'];

export const LEGAL_AUDIENCE_LABELS: Record<LegalAudience, string> = {
  cliente: 'Clientes',
  repartidor: 'Repartidores',
  negocio: 'Negocios',
};

/** Frase corta para textos ("el registro de {…}"). */
export const LEGAL_AUDIENCE_HINT: Record<LegalAudience, string> = {
  cliente: 'la app de clientes',
  repartidor: 'la app de repartidores',
  negocio: 'el registro de negocios',
};
