import { Component, inject } from '@angular/core';

import { TempPasswordModalService } from './temp-password-modal.service';
import { Icon } from '../icon/icon';
import { ToastService } from '../toast/toast.service';

@Component({
  selector: 'app-temp-password-modal',
  standalone: true,
  imports: [Icon],
  templateUrl: './temp-password-modal.html',
  styleUrl: './temp-password-modal.scss',
})
export class TempPasswordModal {
  private readonly modal = inject(TempPasswordModalService);
  private readonly toast = inject(ToastService);

  readonly info = this.modal.current;

  close(): void {
    this.modal.close();
  }

  async copyPassword(): Promise<void> {
    const info = this.info();
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.password);
      this.toast.success('Contraseña copiada');
    } catch {
      this.toast.error('No se pudo copiar');
    }
  }
}
