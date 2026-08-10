import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

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

    this.router.navigateByUrl('/negocios');
  }
}
