export type NotificationType = 'pago' | 'update' | 'novedad' | 'aviso';

export interface AdminNotification {
  id: number;
  userId: number;
  title: string;
  body: string;
  type: NotificationType;
  data: { companyId: number | null; companyIds?: number[] | null; broadcast: boolean } | null;
  isRead: boolean;
  createdAt: string;
  User?: { id: number; name: string; email: string };
}
