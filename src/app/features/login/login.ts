import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { getBrowserCredential, storeBrowserCredential } from '../../core/utils/browser-credentials';
import { Icon } from '../../shared/icon/icon';

/** Solo el correo va a localStorage — la contraseña nunca, quedaría en claro y legible desde las
 * devtools o cualquier script de la página. La contraseña la guarda el gestor de contraseñas del
 * navegador (ver core/utils/browser-credentials.ts). */
const REMEMBERED_EMAIL_KEY = 'delivery_admin_remembered_email';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  readonly email = signal('');
  readonly password = signal('');
  rememberMe = false;

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) {
      this.email.set(rememberedEmail);
      this.rememberMe = true;
      void this.fillRememberedPassword(rememberedEmail);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  async handleSubmit(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const email = this.email().trim();
    const password = this.password();
    const error = await this.auth.login(email, password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    if (this.rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      await storeBrowserCredential(email, password, this.auth.user()?.name);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    this.router.navigateByUrl('/negocios');
  }

  /** Rellena la contraseña desde el gestor del navegador, solo si el usuario no empezó a escribir. */
  private async fillRememberedPassword(rememberedEmail: string): Promise<void> {
    const cred = await getBrowserCredential();
    if (!cred || this.password()) return;
    if (this.email() !== rememberedEmail && this.email() !== cred.email) return;
    this.email.set(cred.email);
    this.password.set(cred.password);
  }
}
