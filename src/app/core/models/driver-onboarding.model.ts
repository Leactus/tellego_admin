/** Formatos que acepta un tipo de documento de repartidor. */
export type DriverDocumentAccepts = 'image' | 'pdf' | 'image_or_pdf';

export type DriverDocumentFieldType = 'text' | 'date' | 'select';

/** Campo extra que el repartidor llena al subir un documento (nº de DUI, vencimiento, ...). */
export interface DriverDocumentFieldDef {
  key: string;
  label: string;
  type: DriverDocumentFieldType;
  options?: string[];
  required?: boolean;
}

/** Catálogo dinámico de documentos que se le piden a un repartidor, POR PAÍS. */
export interface DriverDocumentType {
  id: number;
  /** null = se pide en todos los países. */
  countryId: number | null;
  country?: { id: number; name: string } | null;
  key: string;
  label: string;
  description: string | null;
  twoSided: boolean;
  accepts: DriverDocumentAccepts;
  fields: DriverDocumentFieldDef[] | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type DriverDocumentStatus = 'pending' | 'approved' | 'rejected';

export interface DriverDocumentFile {
  id: number;
  side: 'single' | 'front' | 'back';
  url: string | null;
  mimeType: string;
  isPdf: boolean;
  fieldValues: Record<string, unknown> | null;
  status: DriverDocumentStatus;
  reviewReason: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface OnboardingDocSlot {
  side: 'single' | 'front' | 'back';
  document: DriverDocumentFile | null;
}

export interface OnboardingDocType {
  id: number;
  key: string;
  label: string;
  description: string | null;
  twoSided: boolean;
  accepts: DriverDocumentAccepts;
  fields: DriverDocumentFieldDef[];
  isRequired: boolean;
  slots: OnboardingDocSlot[];
  complete: boolean;
}

export interface OnboardingCapital {
  minCapital: number;
  currencyCode: string;
  currencySymbol: string;
  capitalConfirmedAt: string | null;
  capitalConfirmedAmount: number | null;
  capitalOk: boolean;
}

/** Estado de onboarding de un repartidor (GET /admin/drivers/:id/documents). */
export interface DriverOnboardingState {
  status: string;
  countryId: number | null;
  countryName: string | null;
  capital: OnboardingCapital;
  documentTypes: OnboardingDocType[];
  documentsApproved: boolean;
  readyForApproval: boolean;
}

/** Capital mínimo de repartidor de un país (GET /admin/countries/:id/driver-settings). */
export interface CountryDriverSettings {
  countryId: number;
  currencyCode: string;
  currencySymbol: string;
  minCapital: number;
  isOverride: boolean;
  globalMinCapital: number;
}
