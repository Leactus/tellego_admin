import { OrderStatus } from './order.model';
import { Paginated } from './pagination.model';

export type DriverStatus = 'pending_approval' | 'active' | 'suspended';

/** 'freelance' = de la plataforma (le paga Tellego). 'propio' = contratado por un negocio (le paga su negocio). */
export type DriverType = 'freelance' | 'propio';

export interface Driver {
  id: number;
  userId: number;
  type: DriverType;
  /** Solo propio: su sucursal (y negocio). */
  storeId: number | null;
  store?: { id: number; name: string; company?: { id: number; name: string } | null } | null;
  /** Cuándo un negocio lo contrató desde la bolsa de empleo (dejó de ser freelance). null = nunca. */
  freelanceUntil: string | null;
  createdAt?: string;
  vehicleType: string | null;
  plateNumber: string | null;
  licenseNumber: string | null;
  /** Nº de DUI ("01234567-8"). Lo llena el repartidor al subir su DUI; único por repartidor. */
  duiNumber: string | null;
  /** Nº de permiso de conducir (distinto de la licencia). */
  drivingPermitNumber: string | null;
  isOnline: boolean;
  isAvailable: boolean;
  ratingAvg: string;
  ratingCount: number;
  status: DriverStatus;
  /** Fin de la suspensión temporal (status='suspended'). null con status='suspended' = indefinida. */
  suspendedUntil: string | null;
  /** Motivo que el admin escribió al suspender — se le avisa también al repartidor por push. */
  suspensionReason: string | null;
  /** País del repartidor (lo elige al registrarse) — define su onboarding (documentos + capital). */
  countryId: number | null;
  country?: { id: number; name: string } | null;
  User?: { id: number; name: string; email: string; phone: string | null; status: string };
}

export interface DriverRating {
  id: number;
  orderId: number;
  driverId: number;
  customerId: number;
  score: number;
  comment: string | null;
  createdAt: string;
  customer?: { id: number; name: string };
  /** Moderación: != null = oculta por el super-admin (no cuenta ni la ve el dueño/repartidor). */
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenBy?: { id: number; name: string } | null;
  /** Apelación del repartidor (ver POST /driver/ratings/:id/report). */
  reportedAt?: string | null;
  reportedReason?: string | null;
  /** Resultado de la apelación: pending = en la bandeja, accepted = se ocultó, rejected = quedó visible. */
  reportStatus?: 'pending' | 'accepted' | 'rejected' | null;
  reportResolvedAt?: string | null;
  reportResolutionNote?: string | null;
  /** Pulgar de la entrega (reseñas nuevas): true/false. null = reseña vieja con estrellas. score = 5/1. */
  liked?: boolean | null;
  /** Sugerencias que marcó el cliente ("Puntualidad", "Llegó dañado"...). */
  tags?: string[] | null;
  /** Solo viene en GET /admin/driver-ratings/reported — la bandeja global no sabe de antemano de qué repartidor es cada fila. */
  driver?: { id: number; userId: number; user?: { id: number; name: string } };
}

export interface DriverRatingsSummary extends Paginated<DriverRating> {
  ratingAvg: string;
  ratingCount: number;
}

// --- Ficha del repartidor (GET /admin/drivers/:id/summary) ---

export interface DriverMoneyBucket {
  orders: number;
  /** Suma de lo que ganó por envío (driver_earning). */
  earnings: number;
  tips: number;
}

export interface DriverPendingPayout {
  count: number;
  earnings: number;
  tips: number;
  amount: number;
}

export interface DriverPaidSummary {
  count: number;
  amount: number;
  earnings: number;
  tips: number;
  lastPaidAt: string | null;
}

export interface DriverBankAccountInfo {
  id: number;
  bankName: string;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  isPrimary: boolean;
}

export interface DriverDetailPayout {
  id: number;
  /** platform = Tellego (desembolso semanal) · company = su negocio (propinas). */
  payer: 'platform' | 'company';
  amount: string;
  earningsAmount: string;
  tipsAmount: string;
  ordersCount: number;
  paidAt: string;
  reference: string | null;
  bankName: string;
  accountNumber: string;
  company?: { id: number; name: string } | null;
}

export interface DriverDetail {
  driver: Driver & {
    User?: { id: number; name: string; email: string; phone: string | null; status: string; avatarUrl: string | null; createdAt: string };
    bankAccounts?: DriverBankAccountInfo[];
  };
  counts: { delivered: number; deliveredThisMonth: number; cancelled: number; inProgress: number };
  /** Pedidos entregados, partidos por cómo los entregó (freelance / propio) y cómo se pagó. */
  money: {
    freelance: { cash: DriverMoneyBucket; electronic: DriverMoneyBucket };
    own: { cash: DriverMoneyBucket; electronic: DriverMoneyBucket };
    total: DriverMoneyBucket;
  };
  /** Lo que le debe / le pagó Tellego (tarjeta/transferencia entregado como freelance). */
  platform: {
    ready: DriverPendingPayout;
    running: DriverPendingPayout;
    nextPayoutDate: string;
    readyCutoff: string;
    paid: DriverPaidSummary;
  };
  /** Propinas con tarjeta/transferencia que le debe / le pagó su negocio (entregado como propio). */
  company: {
    pending: { count: number; tips: number };
    paid: DriverPaidSummary;
  };
  recentPayouts: DriverDetailPayout[];
}

export type DriverOrderFilter = 'all' | 'delivered' | 'active' | 'cancelled';

export interface DriverOrderRow {
  id: number;
  publicId: string;
  status: OrderStatus;
  storeName: string | null;
  companyId: number | null;
  companyName: string | null;
  paymentMethod: 'cash' | 'card' | 'transfer';
  paymentStatus: string;
  total: number;
  deliveryFee: number;
  driverEarning: number | null;
  tip: number;
  deliveredAs: 'freelance' | 'own' | null;
  /** cash = lo cobró en mano · platform = le paga Tellego · company = le paga su negocio. null = no entregado. */
  payer: 'cash' | 'platform' | 'company' | null;
  /** true pagado · false pendiente · null nada que pagar. */
  paid: boolean | null;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}
