export type SubcategoryStatus = 'active' | 'inactive';

export interface Subcategory {
  id: number;
  businessTypeId: number;
  name: string;
  imageUrl: string | null;
  status: SubcategoryStatus;
}

/** Subcategory + si está habilitada para el país que se está consultando. */
export interface SubcategoryAvailability extends Subcategory {
  enabled: boolean;
}
