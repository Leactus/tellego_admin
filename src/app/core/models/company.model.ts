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
}

export interface CompanySales {
  totalSales: number;
  commissionRate: number;
  suggestedAmount: number;
}

/** El token real nunca viaja al frontend — solo tokenSufijo (últimos 4 caracteres) para poder identificarlo. */
export interface ApayCredencial {
  id: number;
  companyId: number;
  apayBusinessId: string | null;
  apayAmbiente: number;
  activo: boolean;
  tieneToken: true;
  tokenSufijo: string;
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
