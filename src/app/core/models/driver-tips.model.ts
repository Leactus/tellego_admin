import { Paginated } from './pagination.model';

/**
 * Propinas con tarjeta/transferencia que un negocio les debe / pagó a sus repartidores PROPIOS
 * (GET /admin/companies/:companyId/driver-tips). Espejo del modelo de delivery-pedidos-admin —
 * misma respuesta del backend (services/companyDriverTips.service.ts). Las de repartidores
 * freelance las paga la plataforma (Desembolsos) y no salen acá.
 */
export interface DriverTipsBankAccount {
  bankName: string;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  holderDocument: string | null;
}

export interface DriverTipsRow {
  driver: {
    id: number;
    name: string;
    phone: string | null;
    avatarUrl: string | null;
    type: 'propio' | 'freelance';
    status: string;
    storeName: string | null;
  };
  bankAccount: DriverTipsBankAccount | null;
  /** Propinas que el negocio todavía no le pagó. */
  pending: { count: number; tips: number };
  lastPayout: { amount: number; paidAt: string } | null;
  /** Todo lo que el negocio ya le pagó en propinas (cantidad de pagos registrados). */
  paidTotal: { amount: number; count: number };
}

export interface DriverTipsBoard {
  asOf: string;
  totals: {
    pendingTips: number;
    pendingOrders: number;
    driversWithPending: number;
    missingBankAccount: number;
    missingBankWithPending: number;
    paidThisMonth: number;
  };
  data: DriverTipsRow[];
}

export interface DriverTipOrder {
  orderId: number;
  orderPublicId: string;
  storeName: string | null;
  deliveredAt: string;
  paymentMethod: 'card' | 'transfer' | 'cash';
  tip: number;
}

export interface DriverTipPayout {
  id: number;
  driverId: number;
  amount: string;
  tipsAmount: string;
  ordersCount: number;
  paidAt: string;
  reference: string | null;
  note: string | null;
  bankName: string;
  accountNumber: string;
  createdAt: string;
  driver?: { id: number; type: string; user: { id: number; name: string; avatarUrl: string | null } | null } | null;
  registeredBy?: { id: number; name: string } | null;
}

export interface DriverTipPayoutsPage extends Paginated<DriverTipPayout> {
  totalAmount: number;
}
