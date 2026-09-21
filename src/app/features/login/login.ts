import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { Icon } from '../../shared/icon/icon';

/** Solo el correo, nunca la contraseña — guardarla en claro en localStorage quedaría legible desde
 * las devtools o cualquier script que corra en la página. La contraseña la recuerda el propio
 * gestor de contraseñas del navegador (ya habilitado con autocomplete="current-password" abajo). */
const REMEMBERED_EMAIL_KEY = 'delivery_admin_remembered_email';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';
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
      this.email = rememberedEmail;
      this.rememberMe = true;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  async handleSubmit(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const error = await this.auth.login(this.email.trim(), this.password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    if (this.rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, this.email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    this.router.navigateByUrl('/negocios');
  }
}
