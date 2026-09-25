import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Icon } from '../icon/icon';
import { ConfirmService } from './confirm.service';

/** Diálogo de confirmación/prompt global, montado una sola vez en el root de la app. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [Icon, FormsModule],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  protected readonly confirmService = inject(ConfirmService);
}
