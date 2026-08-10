export type AdvertisementStatus = 'pending' | 'approved' | 'rejected';

/**
 * Solicitud de publicidad de una sucursal, pedida por su dueño desde
 * delivery-pedidos-admin. Este panel decide: aprobar (con duración y costo,
 * 0 = cortesía) o rechazar (con motivo opcional).
 */
export interface Advertisement {
  id: number;
  storeId: number;
  /** NULL = publicidad del negocio completo; con valor = de un producto puntual de ese negocio. */
  productId: number | null;
  requestedByUserId: number;
  status: AdvertisementStatus;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  startsAt: string | null;
  endsAt: string | null;
  cost: string | null;
  createdAt: string;
  store?: { id: number; name: string; company?: { id: number; name: string; logoUrl: string | null } };
  product?: { id: number; name: string; imageUrl: string | null; price: string; salePrice: string | null } | null;
  requestedBy?: { id: number; name: string; email: string };
  reviewedBy?: { id: number; name: string } | null;
}
