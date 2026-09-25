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

export interface PromptOptions {
  title: string;
  message: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  icon?: IconName;
  /** Si es false, permite confirmar con el campo vacío. Default true. */
  required?: boolean;
}

interface ConfirmDialogState extends Required<Omit<ConfirmOptions, 'icon'>>, Pick<ConfirmOptions, 'icon'> {
  kind: 'confirm';
  resolve: (result: boolean) => void;
}

interface PromptDialogState extends Required<Omit<PromptOptions, 'icon' | 'initialValue'>>, Pick<PromptOptions, 'icon'> {
  kind: 'prompt';
  value: string;
  resolve: (result: string | null) => void;
}

type DialogState = ConfirmDialogState | PromptDialogState;

/** Reemplazo del confirm()/prompt() nativos del navegador con una vista consistente en toda la app. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<DialogState | null>(null);
  readonly current = this.state.asReadonly();

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({
        kind: 'confirm',
        variant: 'default',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        ...options,
        resolve,
      });
    });
  }

  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      this.state.set({
        kind: 'prompt',
        variant: 'default',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        placeholder: '',
        required: true,
        ...options,
        value: options.initialValue ?? '',
        resolve,
      });
    });
  }

  setPromptValue(value: string): void {
    this.state.update((s) => (s && s.kind === 'prompt' ? { ...s, value } : s));
  }

  respond(result: boolean): void {
    const s = this.state();
    if (!s || s.kind !== 'confirm') return;
    s.resolve(result);
    this.state.set(null);
  }

  respondPrompt(confirmed: boolean): void {
    const s = this.state();
    if (!s || s.kind !== 'prompt') return;
    const trimmed = s.value.trim();
    if (confirmed && s.required && !trimmed) return;
    s.resolve(confirmed ? trimmed : null);
    this.state.set(null);
  }
}
