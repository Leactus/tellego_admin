import { OrderStatus } from '../models/order.model';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready_for_pickup: 'Listo para recoger',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
};

/** Clase de color del pill — ver .status-pill.warning/.info/.success/.error en negocio-pedidos.scss. */
export const ORDER_STATUS_COLOR_CLASS: Record<OrderStatus, 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'warning',
  confirmed: 'info',
  preparing: 'info',
  ready_for_pickup: 'success',
  on_the_way: 'success',
  delivered: 'success',
  cancelled: 'error',
  rejected: 'error',
};
