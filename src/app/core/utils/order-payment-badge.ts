import { Order } from '../models/order.model';

/**
 * Insignia de estado de pago de un pedido. El efectivo pendiente es NORMAL (se
 * paga al entregar) — solo transferencia/tarjeta pendiente o fallida es una
 * alerta real (ej. el cliente creó el pedido pero el cobro con APay nunca se
 * completó).
 */
export interface PaymentBadge {
  label: string;
  colorClass: 'success' | 'warning' | 'error' | 'neutral';
}

export function paymentBadge(order: Order): PaymentBadge {
  if (order.paymentStatus === 'paid') {
    return { label: 'Pagado', colorClass: 'success' };
  }
  if (order.paymentStatus === 'failed') {
    return { label: 'Pago fallido', colorClass: 'error' };
  }
  if (order.paymentMethod === 'cash') {
    return { label: 'Paga en efectivo al entregar', colorClass: 'neutral' };
  }
  return { label: 'Pago pendiente', colorClass: 'warning' };
}
