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
  User?: { id: number; name: string; email: string; phone: string | null; status: string };
}
