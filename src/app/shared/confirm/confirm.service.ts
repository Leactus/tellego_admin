import { Injectable, signal } from '@angular/core';

import { IconName } from '../icon/icon';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  /** Ícono a mostrar; por defecto 'trash' si es danger, 'info-circle' si no. */
  icon?: IconName;
}

interface ConfirmState extends Required<Omit<ConfirmOptions, 'icon'>>, Pick<ConfirmOptions, 'icon'> {
  resolve: (result: boolean) => void;
}

/** Reemplazo del confirm() nativo del navegador con una vista consistente en toda la app. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<ConfirmState | null>(null);
  readonly current = this.state.asReadonly();

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({
        variant: 'default',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        ...options,
        resolve,
      });
    });
  }

  respond(result: boolean): void {
    this.state()?.resolve(result);
    this.state.set(null);
  }
}
