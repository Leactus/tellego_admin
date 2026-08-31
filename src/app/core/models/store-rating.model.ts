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
}

export type StoreRatingsPage = Paginated<StoreRating>;

export type RatingVisibilityFilter = 'all' | 'visible' | 'hidden';
