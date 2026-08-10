import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { AdminNotification, NotificationType } from '../models/notification.model';
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

  send(input: SendNotificationInput): Promise<{ sentTo: number }> {
    return firstValueFrom(this.http.post<{ data: { sentTo: number } }>(this.base, input)).then((r) => r.data);
  }

  listSent(params?: PageParams): Promise<Paginated<AdminNotification>> {
    return firstValueFrom(this.http.get<Paginated<AdminNotification>>(this.base, { params: toHttpParams(params) }));
  }
}
