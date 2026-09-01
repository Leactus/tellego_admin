import { Paginated } from './pagination.model';

/**
 * Pedido visto por el super-admin (solo lectura) — espejo del modelo `Order` de
 * delivery-pedidos-admin, duplicado a propósito (misma política que el resto del
 * kit compartido entre apps). El backend devuelve exactamente la misma forma en
 * /admin/companies/:id/orders y /admin/orders/:id que en /owner/orders.
 */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export type OrderPaymentStatus = 'pending' | 'paid' | 'failed';

export interface OrderItemOption {
  id: number;
  optionName: string;
  extraPrice: string;
}

export interface OrderItem {
  id: number;
  productName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  notes: string | null;
  options: OrderItemOption[];
}

/** provider='apay': providerPaymentId es el id de transacción del cobro con tarjeta. */
export interface OrderPayment {
  id: number;
  method: 'cash' | 'transfer' | 'card';
  provider: 'none' | 'stripe' | 'apay';
  providerPaymentId: string | null;
  amount: string;
  status: OrderPaymentStatus;
  paidAt: string | null;
}

export interface Order {
  id: number;
  /** Id visual, correlativo por sucursal — solo para mostrar, nunca para llamadas a la API. */
  publicId: string;
  customerId: number;
  storeId: number;
  /** null = todavía sin repartidor asignado (pickup, o entrega propia sin usar la flota). */
  driverId: number | null;
  fulfillmentType: 'delivery' | 'pickup';
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  /** Código de retiro de 6 dígitos — se genera cuando un repartidor FREELANCE acepta la oferta. null = repartidor propio o sin repartidor / no se generó. El super-admin lo puede regenerar. */
  pickupCode: string | null;
  paymentMethod: 'cash' | 'transfer' | 'card';
  paymentStatus: OrderPaymentStatus;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  arrivedAtStoreAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
  customer?: { id: number; name: string; phone: string | null };
  deliveryAddress?: { id: number; line: string; reference: string | null; lat: number | null; lng: number | null } | null;
  payment?: OrderPayment | null;
  store?: { id: number; name: string; lat: number | null; lng: number | null };
  /** Repartidor asignado (propio o freelance). */
  driver?: {
    id: number;
    type: 'propio' | 'freelance';
    vehicleType: string | null;
    plateNumber: string | null;
    user: { name: string; phone: string | null } | null;
  } | null;
}

export type OrdersPage = Paginated<Order>;
