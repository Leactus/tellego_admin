export interface ProductCategory {
  id: number;
  companyId: number;
  name: string;
  position: number;
}

export interface OptionItem {
  id: number;
  optionGroupId: number;
  name: string;
  extraPrice: string;
  isAvailable: boolean;
}

export interface OptionGroup {
  id: number;
  productId: number;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired: boolean;
  items: OptionItem[];
}

export interface StoreProductInfo {
  id: number;
  storeId: number;
  productId: number;
  isAvailable: boolean;
  priceOverride: string | null;
  salePriceOverride: string | null;
}

export interface Product {
  id: number;
  companyId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  price: string;
  salePrice: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  /** true = solo para mayores de edad (cerveza, licores...). */
  isAgeRestricted: boolean;
  category?: { id: number; name: string };
  optionGroups: OptionGroup[];
  storeProducts: StoreProductInfo[];
}
