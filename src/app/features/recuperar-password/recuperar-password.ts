import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Icon } from '../../shared/icon/icon';

type Step = 'email' | 'reset';

/**
 * "Olvidé mi contraseña" — pide un código al correo y lo confirma junto con
 * la contraseña nueva (ver AuthService.requestPasswordResetCode/
 * confirmPasswordReset, mismos endpoints que ya usan las apps móviles). A
 * propósito no deja la sesión iniciada al terminar — se vuelve a Login para
 * entrar con la contraseña nueva.
 */
@Component({
  selector: 'app-recuperar-password',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './recuperar-password.html',
  styleUrl: './recuperar-password.scss',
})
export class RecuperarPassword {
  readonly step = signal<Step>('email');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);

  email = '';
  code = '';
  newPassword = '';
  confirmPassword = '';

  readonly resendIn = signal(0);
  private resendTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly router: Router,
  ) {}

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  get canSubmitReset(): boolean {
    return this.code.trim().length >= 4 && this.newPassword.length >= 6 && this.newPassword === this.confirmPassword;
  }

  async submitEmail(): Promise<void> {
    const email = this.email.trim();
    if (!email || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    const { error, retryAfterSeconds } = await this.auth.requestPasswordResetCode(email);
    this.isSubmitting.set(false);

    if (error) {
      this.toast.error(error);
      return;
    }
    this.step.set('reset');
    this.startResendCooldown(retryAfterSeconds);
  }

  async submitReset(): Promise<void> {
    if (!this.canSubmitReset || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    const error = await this.auth.confirmPasswordReset(this.email.trim(), this.code.trim(), this.newPassword);
    this.isSubmitting.set(false);

    if (error) {
      this.toast.error(error);
      return;
    }
    this.toast.success('Contraseña actualizada. Inicia sesión con tu contraseña nueva.');
    this.router.navigate(['/login']);
  }

  async resendCode(): Promise<void> {
    if (this.resendIn() > 0 || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const { error, retryAfterSeconds } = await this.auth.requestPasswordResetCode(this.email.trim());
    this.isSubmitting.set(false);

    if (error) {
      this.toast.error(error);
      return;
    }
    this.toast.info('Te reenviamos el código.');
    this.startResendCooldown(retryAfterSeconds);
  }

  backToEmail(): void {
    this.step.set('email');
    this.code = '';
    this.newPassword = '';
    this.confirmPassword = '';
    clearInterval(this.resendTimer);
    this.resendIn.set(0);
  }

  private startResendCooldown(seconds: number): void {
    clearInterval(this.resendTimer);
    this.resendIn.set(seconds);
    this.resendTimer = setInterval(() => {
      this.resendIn.update((v) => {
        if (v <= 1) {
          clearInterval(this.resendTimer);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }
}
