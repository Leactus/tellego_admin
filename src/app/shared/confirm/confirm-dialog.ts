import { Component, inject } from '@angular/core';

import { Icon } from '../icon/icon';
import { ConfirmService } from './confirm.service';

/** Diálogo de confirmación global, montado una sola vez en el root de la app. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [Icon],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  protected readonly confirmService = inject(ConfirmService);
}
