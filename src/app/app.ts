import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfirmDialog } from './shared/confirm/confirm-dialog';
import { ToastContainer } from './shared/toast/toast-container';
import { TempPasswordModal } from './shared/temp-password-modal/temp-password-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialog, ToastContainer, TempPasswordModal],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
