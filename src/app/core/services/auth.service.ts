import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { AppUser, LoginResponse } from '../models/user.model';

const TOKEN_KEY = 'delivery_admin_token';
const USER_KEY = 'delivery_admin_user';

/** Este panel es exclusivo del dueño de la plataforma (rol 'admin'). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<AppUser | null>(this.readStoredUser());
  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return this.tokenSignal();
  }

  /** Devuelve null si el login fue exitoso, o un mensaje de error. */
  async login(email: string, password: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password }),
      );

      if (response.user.role !== 'admin') {
        return 'Esta cuenta no tiene acceso a este panel.';
      }

      this.tokenSignal.set(response.token);
      this.userSignal.set(response.user);
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      return null;
    } catch (err: any) {
      return err?.error?.message ?? 'No se pudo iniciar sesión';
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  private readStoredUser(): AppUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AppUser;
    } catch {
      return null;
    }
  }
}
