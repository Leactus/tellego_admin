import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import {
  AdminNotification,
  NotificationType,
  ScheduledNotification,
  ScheduledNotificationInput,
  SendResult,
} from '../models/notification.model';
import { Paginated, PageParams, toHttpParams } from '../models/pagination.model';

interface SendNotificationInput {
  title: string;
  body: string;
  type: NotificationType;
  companyId?: number | null;
  /** Varios negocios a la vez (el mismo mensaje para todos). No se combina con `companyId`. */
  companyIds?: number[];
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/notifications`;

  send(input: SendNotificationInput): Promise<SendResult> {
    return firstValueFrom(this.http.post<{ data: SendResult }>(this.base, input)).then((r) => r.data);
  }

  listSent(params?: PageParams): Promise<Paginated<AdminNotification>> {
    return firstValueFrom(this.http.get<Paginated<AdminNotification>>(this.base, { params: toHttpParams(params) }));
  }

  // ---- Notificaciones programadas ----

  listScheduled(): Promise<ScheduledNotification[]> {
    return firstValueFrom(
      this.http.get<{ data: ScheduledNotification[] }>(`${this.base}/scheduled`),
    ).then((r) => r.data);
  }

  createScheduled(input: ScheduledNotificationInput): Promise<ScheduledNotification> {
    return firstValueFrom(
      this.http.post<{ data: ScheduledNotification }>(`${this.base}/scheduled`, input),
    ).then((r) => r.data);
  }

  updateScheduled(id: number, input: Partial<ScheduledNotificationInput>): Promise<ScheduledNotification> {
    return firstValueFrom(
      this.http.patch<{ data: ScheduledNotification }>(`${this.base}/scheduled/${id}`, input),
    ).then((r) => r.data);
  }

  setScheduledActive(id: number, isActive: boolean): Promise<ScheduledNotification> {
    return firstValueFrom(
      this.http.patch<{ data: ScheduledNotification }>(`${this.base}/scheduled/${id}`, { isActive }),
    ).then((r) => r.data);
  }

  deleteScheduled(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/scheduled/${id}`)).then(() => undefined);
  }

  /** Dispara ahora las programadas que ya vencieron (botón "ejecutar pendientes"). */
  runDueScheduled(): Promise<{ dispatched: number }> {
    return firstValueFrom(
      this.http.post<{ data: { dispatched: number } }>(`${this.base}/scheduled/run-due`, {}),
    ).then((r) => r.data);
  }
}
