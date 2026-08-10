import { Component, inject } from '@angular/core';

import { Icon, IconName } from '../icon/icon';
import { ToastService, ToastType } from './toast.service';

/** Stack de notificaciones global, montado una sola vez en el root de la app. */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [Icon],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.scss',
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);

  protected iconFor(type: ToastType): IconName {
    if (type === 'success') return 'check-circle';
    if (type === 'error') return 'x-circle';
    return 'info-circle';
  }
}
