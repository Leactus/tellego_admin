export type PlatformOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export interface PlatformSnapshot {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  totalStores: number;
  totalDrivers: number;
  activeDrivers: number;
  companiesOverdue: number;
}

export interface PlatformStatsSummary {
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  gmv: number;
  avgTicket: number;
}

export interface RevenueByDay {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrdersByStatus {
  status: PlatformOrderStatus;
  count: number;
}

export interface PlatformRevenue {
  total: number;
  paymentsCount: number;
}

export interface TopCompany {
  companyId: number;
  name: string;
  orders: number;
  revenue: number;
}

export interface TopStore {
  storeId: number;
  storeName: string;
  companyName: string;
  orders: number;
  revenue: number;
}

export interface TopDriver {
  driverId: number;
  name: string;
  deliveries: number;
  revenue: number;
}

export interface PlatformStats {
  range: { from: string; to: string };
  platform: PlatformSnapshot;
  summary: PlatformStatsSummary;
  revenueByDay: RevenueByDay[];
  ordersByStatus: OrdersByStatus[];
  platformRevenue: PlatformRevenue;
  topCompanies: TopCompany[];
  topStores: TopStore[];
  topDrivers: TopDriver[];
}
