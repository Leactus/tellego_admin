export type StoreStatus = 'pending_approval' | 'active' | 'suspended';

export interface Store {
  id: number;
  companyId: number;
  ownerUserId: number;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  departmentId: number | null;
  /** Nombre del departamento, ya resuelto por el backend. */
  department: string | null;
  websiteUrl: string | null;
  /** Ubicación exacta de la sucursal. Hoy solo se asigna por coordenadas; el selector de mapa (Google Maps) queda pendiente. */
  lat: number | null;
  lng: number | null;
  status: StoreStatus;
  ratingAvg: string;
  ratingCount: number;
  deliveryFee: string;
  estimatedMinutes: number | null;
}

/** Personal (role='empleado') asignado a una sucursal de la empresa. */
export interface StaffMember {
  id: number;
  userId: number;
  storeId: number;
  position: string | null;
  status: 'active' | 'suspended';
  user?: { id: number; name: string; email: string; phone: string | null; status: string };
  store?: { id: number; name: string; department: string | null };
}

export interface StoreInput {
  name?: string;
  description?: string;
  phone?: string;
  address?: string;
  departmentId?: number | null;
  websiteUrl?: string;
  lat?: number | null;
  lng?: number | null;
}
