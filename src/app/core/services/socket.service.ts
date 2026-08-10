import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';

import { environment } from '../config/environment';
import { AdminNotification } from '../models/notification.model';

/** Conexión socket.io del panel: se une a la room 'user:<id>' propia para
 * recibir en vivo confirmaciones o eventos dirigidos al admin. */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  readonly notificationReceived = signal<AdminNotification | null>(null);

  connect(userId: number): void {
    if (this.socket) return;

    this.socket = io(environment.apiUrl, { transports: ['websocket'] });
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
