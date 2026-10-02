import { Paginated } from './pagination.model';

/** Una reseña que un cliente le dejó a una sucursal, vista por el super-admin (con las ocultas). */
export interface StoreRating {
  id: number;
  orderId: number;
  storeId: number;
  customerId: number;
  score: number;
  comment: string | null;
  createdAt: string;
  customer?: { id: number; name: string };
  store?: { id: number; name: string };
  /** Moderación: != null = oculta por el super-admin (no cuenta ni la ve el dueño). */
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenBy?: { id: number; name: string } | null;
  /** Apelación del negocio (ver POST /owner/store/ratings/:id/report). */
  reportedAt?: string | null;
  reportedReason?: string | null;
  /** Resultado de la apelación: pending = en la bandeja, accepted = se ocultó, rejected = quedó visible. */
  reportStatus?: 'pending' | 'accepted' | 'rejected' | null;
  reportResolvedAt?: string | null;
  reportResolutionNote?: string | null;
  /** Qué opinó el cliente de cada producto (reseñas nuevas — las viejas solo traen score/comment). */
  items?: StoreRatingItem[];
}

export interface StoreRatingItem {
  orderItemId: number;
  score: number;
  /** Sugerencias que marcó el cliente ("Buen sabor", "Porción pequeña"...). */
  tags: string[] | null;
  comment: string | null;
  orderItem?: { productName: string; quantity: number };
}

export type StoreRatingsPage = Paginated<StoreRating>;

export type RatingVisibilityFilter = 'all' | 'visible' | 'hidden';
