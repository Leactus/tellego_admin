import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

/** Reemplazo del alert() nativo con notificaciones consistentes en toda la app. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<ToastItem[]>([]);
  readonly toasts = this.items.asReadonly();
  private nextId = 0;

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  private push(type: ToastType, message: string): void {
    const id = ++this.nextId;
    this.items.update((list) => [...list, { id, type, message }]);
    setTimeout(() => this.dismiss(id), 4000);
  }
}
