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

/** Por qué un negocio NO recibió un aviso de tipo 'pago' (se filtra siempre a quien de verdad debe). */
export interface PagoSkipBreakdown {
  total: number;
  /** Ya está al día (pagó, pagó por adelantado, o su fecha de pago aún no llega). */
  alDia: number;
  /** Todavía no empieza a facturar (período de cortesía de cliente nuevo). */
  sinFacturar: number;
  /** Es por comisión y no tiene ventas sin cobrar — no debe nada. */
  sinVentas: number;
  /** Suspendido. */
  suspendido: number;
}

export interface SendResult {
  sentTo: number;
  skipped: PagoSkipBreakdown | null;
}

// ---- Notificaciones programadas ----

export type ScheduleFrequency = 'once' | 'daily' | 'weekly';

export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  type: NotificationType;
  audience: 'all' | 'companies';
  companyIds: number[] | null;
  frequency: ScheduleFrequency;
  /** Solo 'once': 'YYYY-MM-DD' (hora local El Salvador). */
  runDate: string | null;
  /** 'daily' | 'weekly' (y 'once'): 'HH:MM' (hora local El Salvador). */
  timeOfDay: string | null;
  /** Solo 'weekly': 0=domingo … 6=sábado. */
  daysOfWeek: number[] | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  createdBy?: { id: number; name: string } | null;
}

export interface ScheduledNotificationInput {
  title: string;
  body: string;
  type: NotificationType;
  audience: 'all' | 'companies';
  companyIds?: number[];
  frequency: ScheduleFrequency;
  runDate?: string | null;
  timeOfDay?: string | null;
  daysOfWeek?: number[] | null;
}

export const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAY_LABELS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
