import { Paginated } from './pagination.model';

export type DriverStatus = 'pending_approval' | 'active' | 'suspended';

export interface Driver {
  id: number;
  userId: number;
  vehicleType: string | null;
  plateNumber: string | null;
  licenseNumber: string | null;
  isOnline: boolean;
  isAvailable: boolean;
  ratingAvg: string;
  ratingCount: number;
  status: DriverStatus;
  /** Fin de la suspensión temporal (status='suspended'). null con status='suspended' = indefinida. */
  suspendedUntil: string | null;
  /** País del repartidor (lo elige al registrarse) — define su onboarding (documentos + capital). */
  countryId: number | null;
  country?: { id: number; name: string } | null;
  User?: { id: number; name: string; email: string; phone: string | null; status: string };
}

export interface DriverRating {
  id: number;
  orderId: number;
  driverId: number;
  customerId: number;
  score: number;
  comment: string | null;
  createdAt: string;
  customer?: { id: number; name: string };
  /** Moderación: != null = oculta por el super-admin (no cuenta ni la ve el dueño/repartidor). */
  hiddenAt: string | null;
  hiddenReason: string | null;
  hiddenBy?: { id: number; name: string } | null;
}

export interface DriverRatingsSummary extends Paginated<DriverRating> {
  ratingAvg: string;
  ratingCount: number;
}
