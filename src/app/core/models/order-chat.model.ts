/** Un mensaje del chat cliente ↔ repartidor de un pedido (solo lectura para el super-admin). */
export interface OrderChatMessage {
  id: string;
  senderUserId: number | null;
  senderRole: 'cliente' | 'repartidor' | null;
  body: string;
  /** ISO. */
  createdAt: string | null;
  /** ISO, o null si el receptor todavía no lo vio. */
  readAt: string | null;
}

export interface OrderChatMeta {
  orderId: number;
  orderPublicId: string | null;
  /** 'open' mientras el pedido está en curso; 'closed' al entregar/cancelar. */
  status: 'open' | 'closed' | null;
  customerName: string | null;
  driverName: string | null;
  openedAt: string | null;
  closedAt: string | null;
}

/** Respuesta de GET /admin/orders/:id/chat. `chat` null = el pedido nunca tuvo chat. */
export interface OrderChatTranscript {
  chat: OrderChatMeta | null;
  messages: OrderChatMessage[];
}
