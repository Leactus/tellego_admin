export type BusinessTypeStatus = 'active' | 'inactive';

export interface BusinessType {
  id: number;
  name: string;
  imageUrl: string | null;
  status: BusinessTypeStatus;
}
