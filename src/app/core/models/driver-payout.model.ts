import { Paginated } from './pagination.model';

/** Cuenta bancaria que el repartidor registró en su app (delivery-repartidor). */
export interface DriverBankAccount {
  bankName: string;
  /** checking = corriente, savings = ahorro. */
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  holderDocument: string | null;
}

export interface PayoutAmount {
  count: number;
  /** Ganancia de envío (driver_earning). */
  earnings: number;
  /** Propinas con tarjeta/transferencia. */
  tips: number;
  amount: number;
}

export interface PayoutSchedule {
  /** Día de pago (0=domingo … 6=sábado). */
  payoutDow: number;
  /** Último día de pago — todo lo entregado ANTES de este día está listo para pagar. */
  readyCutoff: string;
  /** Día en que se paga lo de la semana en curso. */
  nextPayoutDate: string;
  since: string | null;
}

export interface PendingPayoutRow {
  driver: { id: number; name: string; phone: string | null; status: string };
  bankAccount: DriverBankAccount | null;
  ready: PayoutAmount;
  running: PayoutAmount;
}

export interface PendingPayouts {
  schedule: PayoutSchedule;
  totals: { ready: PayoutAmount; running: PayoutAmount };
  data: PendingPayoutRow[];
}

export interface PayoutOrder {
  orderId: number;
  orderPublicId: string;
  storeName: string | null;
  deliveredAt: string;
  paymentMethod: 'card' | 'transfer' | 'cash';
  driverEarning: number;
  tip: number;
  amount: number;
}

export interface DriverPayout {
  id: number;
  driverId: number;
  amount: string;
  earningsAmount: string;
  tipsAmount: string;
  ordersCount: number;
  periodEnd: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  bankName: string;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  createdAt: string;
  driver?: { id: number; user?: { id: number; name: string; phone: string | null } };
  registeredBy?: { id: number; name: string } | null;
  /** Solo en GET /admin/driver-payouts/:id. */
  orders?: PayoutOrder[];
}

export interface DriverPayoutsPage extends Paginated<DriverPayout> {
  totalAmount: number;
}
