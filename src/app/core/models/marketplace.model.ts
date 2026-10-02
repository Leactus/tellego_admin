import { Paginated } from './pagination.model';

/** Quién ve / puede comprar el producto. */
export type MarketplaceAudience = 'all' | 'stores' | 'drivers';
export type MarketplacePromotionType = 'buy_x_get_y' | 'free';
export type MarketplacePromotionAudience = 'stores' | 'drivers' | 'all';
export type MarketplaceOrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export interface MarketplaceImage {
  id: number;
  imageUrl: string;
  sortOrder: number;
}

export interface MarketplacePromotion {
  id: number;
  productId: number;
  type: MarketplacePromotionType;
  title: string | null;
  /** Texto que ven los compradores (el título propio o uno armado). */
  label: string;
  buyQty: number | null;
  freeQty: number;
  maxPerBuyer: number | null;
  totalLimit: number | null;
  audience: MarketplacePromotionAudience;
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'inactive';
  isLive: boolean;
  timing: 'scheduled' | 'running' | 'ended';
  /** Unidades regaladas hasta ahora (solicitudes no canceladas). */
  freeGiven: number;
  buyers: number;
}

export interface MarketplaceProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  badge: string | null;
  audience: MarketplaceAudience;
  /** null = sin control de stock. */
  stock: number | null;
  status: 'active' | 'inactive';
  sortOrder: number;
  imageUrl: string | null;
  images: MarketplaceImage[];
  promotions: MarketplacePromotion[];
  sales: { paid: number; free: number; revenue: number };
}

export interface MarketplaceProductPayload {
  name?: string;
  description?: string | null;
  price?: number;
  compareAtPrice?: number | null;
  badge?: string | null;
  audience?: MarketplaceAudience;
  stock?: number | null;
  status?: 'active' | 'inactive';
  sortOrder?: number;
}

export interface MarketplacePromotionPayload {
  type: MarketplacePromotionType;
  title?: string | null;
  buyQty?: number | null;
  freeQty: number;
  maxPerBuyer?: number | null;
  totalLimit?: number | null;
  audience: MarketplacePromotionAudience;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: 'active' | 'inactive';
}

export interface MarketplaceOrderItem {
  id: number;
  productId: number;
  productName: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  freeQuantity: number;
  promotionLabel: string | null;
  subtotal: number;
}

export interface MarketplaceOrder {
  id: number;
  buyerType: 'company' | 'driver';
  status: MarketplaceOrderStatus;
  subtotal: number;
  savings: number;
  total: number;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string | null;
  buyerNote: string | null;
  adminNote: string | null;
  paymentMethod: 'cash' | 'transfer' | null;
  paymentReference: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelledBy: 'buyer' | 'admin' | null;
  cancelReason: string | null;
  createdAt: string;
  items: MarketplaceOrderItem[];
  company?: { id: number; name: string; logoUrl: string | null } | null;
  store?: { id: number; name: string; address: string | null; phone: string | null } | null;
  driver?: { id: number; vehicleType: string | null; user?: { id: number; name: string; phone: string | null; email: string } } | null;
  requestedBy?: { id: number; name: string; email: string; phone: string | null } | null;
}

export type MarketplaceOrderCounts = Record<MarketplaceOrderStatus, number> & { unpaid: number };

export interface MarketplaceOrdersPage extends Paginated<MarketplaceOrder> {
  counts: MarketplaceOrderCounts;
}
