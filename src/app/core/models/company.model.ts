import { Store } from './store.model';

export type CompanyStatus = 'active' | 'suspended';
export type CompanyBillingType = 'fee' | 'commission';

export interface Company {
  id: number;
  ownerUserId: number;
  name: string;
  /** Compartidos por todas las sucursales de la empresa. */
  logoUrl: string | null;
  coverUrl: string | null;
  countryId: number;
  /** Tipo de negocio ya resuelto por el backend (nombre + imagen), solo lectura — se elige una vez y no se puede cambiar. GLOBAL para todas sus sucursales. */
  businessType?: { id: number; name: string; imageUrl: string | null } | null;
  /** Subcategorías ya resueltas por el backend — a diferencia del tipo de negocio, se pueden editar en cualquier momento. GLOBAL para todas sus sucursales. */
  subcategories?: { id: number; name: string; imageUrl: string | null }[];
  status: CompanyStatus;
  /** Cómo se le cobra a ESTA empresa; se fija por empresa y queda congelado (no lo afecta cambiar el default de Configuraciones). */
  billingType: CompanyBillingType;
  monthlyFee: string;
  /** % de comisión sobre ventas si billingType='commission'; null si es de cuota fija. */
  commissionRate: string | null;
  nextPaymentDueDate: string | null;
  billingStartsAt: string | null;
  /** Override de días de gracia de ESTA empresa sobre PlatformSettings.defaultGracePeriodDays; null = usa el general. */
  gracePeriodDays: number | null;
  /** Si es false, esta empresa nunca se bloquea automáticamente por mora (excepción manual del admin). */
  penaltyEnabled: boolean;
  /** Calculados por el backend, no se editan directo: días de gracia efectivos, si está bloqueada ahora, y desde cuándo. */
  effectiveGracePeriodDays?: number;
  isBlocked?: boolean;
  blockDate?: string | null;
  createdAt: string;
  branches?: Store[];
  country?: Country;
  owner?: CompanyOwner;
}

/** El usuario dueño de la empresa — solo lo que el super-admin puede ver/editar desde negocio-detalle. */
export interface CompanyOwner {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'suspended';
}

export interface Country {
  id: number;
  name: string;
  currencyCode: string;
  currencySymbol: string;
}

export interface Department {
  id: number;
  countryId: number;
  name: string;
}

/** Valores por defecto sugeridos al crear un negocio nuevo — cambiar esto no afecta negocios ya creados. */
export interface PlatformSettings {
  defaultMonthlyFee: string;
  defaultCommissionRate: string;
  /** Días de gracia después de nextPaymentDueDate antes de bloquear una empresa vencida (ver Company.gracePeriodDays para el override). */
  defaultGracePeriodDays: number;
  /** Hora (0-23, hora del servidor) en que "cierra" un día para el cálculo de ventas por comisión — ver billing.service.ts#computeCommissionSales en el backend. */
  defaultSalesCutoffHour: number;
  /** Solo billing_type='commission': días después de periodEnd de un pago en que queda nextPaymentDueDate. No aplica a 'fee'. */
  defaultCommissionPaymentDueDays: number;
}

export interface CompanySales {
  totalSales: number;
  commissionRate: number;
  suggestedAmount: number;
}

/** Ni el token ni el id_business viajan completos al frontend — solo los últimos 4 caracteres de cada uno, para poder identificarlos. */
export interface ApayCredencial {
  id: number;
  companyId: number;
  apayAmbiente: number;
  activo: boolean;
  tieneToken: true;
  tokenSufijo: string;
  tieneBusinessId: boolean;
  businessIdSufijo: string | null;
}

export interface PlatformPayment {
  id: number;
  companyId: number;
  amount: string;
  method: 'cash' | 'transfer' | 'card';
  periodStart: string;
  periodEnd: string;
  note: string | null;
  paidAt: string;
  registeredBy?: { id: number; name: string };
}

/** Catálogo fijo de bancos de El Salvador — mismo orden que PLATFORM_BANK_NAMES en el backend. */
export const PLATFORM_BANK_NAMES = [
  'Banco Agrícola',
  'BAC Credomatic',
  'Banco Cuscatlán',
  'Banco Davivienda Salvadoreño',
  'Banco Promerica',
  'Banco G&T Continental',
  'Banco Azul',
  'Banco Hipotecario',
  'Banco de Fomento Agropecuario (BFA)',
  'Banco Industrial El Salvador',
] as const;
export type PlatformBankName = (typeof PLATFORM_BANK_NAMES)[number];

/** Cuenta bancaria de la EMPRESA MADRE — se muestra a los negocios en /negocio/pagos como forma de pago por transferencia. */
export interface PlatformBankAccount {
  id: number;
  bankName: PlatformBankName;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  status: 'active' | 'inactive';
}

/** Igual que ApayCredencial, pero de la cuenta APay de la plataforma (sin companyId: una sola para toda la plataforma). */
export interface PlatformApayCredencial {
  id: number;
  apayAmbiente: number;
  activo: boolean;
  tieneToken: true;
  tokenSufijo: string;
  tieneBusinessId: boolean;
  businessIdSufijo: string | null;
}
