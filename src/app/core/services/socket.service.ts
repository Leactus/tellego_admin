import { Injectable, Injector, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

import { environment } from '../config/environment';
import { AdminNotification } from '../models/notification.model';
import { AuthService } from './auth.service';

/** Conexión socket.io del panel: se une a la room 'user:<id>' propia para
 * recibir en vivo confirmaciones o eventos dirigidos al admin. */
@Injectable({ providedIn: 'root' })
export class SocketService {
  // Perezoso, mismo criterio que delivery-pedidos-admin/core/services/socket.service.ts.
  private readonly injector = inject(Injector);
  private socket: Socket | null = null;
  readonly notificationReceived = signal<AdminNotification | null>(null);

  connect(userId: number): void {
    if (this.socket) return;

    // El backend exige auth.token en el handshake (ver config/socket.ts) — antes este panel se
    // conectaba sin token, el backend lo rechazaba y las notificaciones en vivo nunca llegaban.
    // Como función para que cada reconexión lea el token vigente.
    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: this.injector.get(AuthService).token }),
    });
    this.socket.on('connect', () => this.socket?.emit('join', `user:${userId}`));
    this.socket.on('notification:new', (notification: AdminNotification) => {
      this.notificationReceived.set(notification);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
