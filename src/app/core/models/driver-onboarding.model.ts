/** Formatos que acepta un tipo de documento de repartidor. */
export type DriverDocumentAccepts = 'image' | 'pdf' | 'image_or_pdf';

/** De dónde puede salir la foto en la app del repartidor. */
export type DriverDocumentPhotoSource = 'camera' | 'gallery' | 'camera_or_gallery';

export type DriverDocumentFieldType = 'text' | 'date' | 'select';

/** 'dui' = 8 dígitos + verificador; el backend lo valida y lo guarda como "01234567-8". */
export type DriverDocumentFieldFormat = 'dui';

/** Autollenado con OCR (la app lee la foto del frente). Sin pattern ni afterLabel solo vale con format='dui'. */
export interface DriverDocumentFieldOcr {
  pattern?: string;
  afterLabel?: string;
}

/** Columna del perfil del repartidor donde se copia el valor del campo al subir el documento. */
export type DriverProfileField = 'duiNumber' | 'licenseNumber' | 'drivingPermitNumber';

/** Campo extra que el repartidor llena al subir un documento (nº de DUI, vencimiento, ...). */
export interface DriverDocumentFieldDef {
  key: string;
  label: string;
  type: DriverDocumentFieldType;
  options?: string[];
  required?: boolean;
  /** Solo type='text'. */
  format?: DriverDocumentFieldFormat;
  /** Solo type='text'. Presente = se autollena con OCR. */
  ocr?: DriverDocumentFieldOcr;
  /** Solo type='text'. Se copia a este dato del perfil del repartidor. */
  profileField?: DriverProfileField;
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
  /** Con autoValidate el backend la fuerza a 'camera'. */
  photoSource: DriverDocumentPhotoSource;
  fields: DriverDocumentFieldDef[] | null;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  autoValidate: boolean;
  validationKeywords: string | null;
  validationRegex: string | null;
  /** Reglas OCR del reverso (solo twoSided). Las de arriba son del frente / foto única. */
  validationKeywordsBack: string | null;
  validationRegexBack: string | null;
  useCameraFrame: boolean;
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
  /** Lo que leyó el OCR de la app por campo (null = no lo encontró). null = sin autollenado. */
  ocrValues: Record<string, string | null> | null;
  /** Cuándo el repartidor autorizó el uso del archivo. null = lo subió un admin. */
  consentAcceptedAt: string | null;
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
  photoSource: DriverDocumentPhotoSource;
  useCameraFrame: boolean;
  fields: DriverDocumentFieldDef[];
  isRequired: boolean;
  slots: OnboardingDocSlot[];
  /** Campos obligatorios llenos (el repartidor los valida después de subir las fotos). */
  dataComplete: boolean;
  /** Fotos aprobadas + datos completos. */
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
