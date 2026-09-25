import { HttpBackend, HttpClient } from '@angular/common/http';
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

  private readonly httpBackend = inject(HttpBackend);

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

  /**
   * "Olvidé mi contraseña", primer paso: pide un código de verificación al correo (mismo backend
   * que el registro en delivery-pedidos-admin). El backend responde con el MISMO mensaje exista o
   * no una cuenta con ese correo — nunca se le confirma a quien llena el formulario si esa cuenta
   * existe. Devuelve `{ error, retryAfterSeconds }`: error null si salió bien.
   */
  async requestPasswordResetCode(email: string): Promise<{ error: string | null; retryAfterSeconds: number }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ retryAfterSeconds?: number }>(`${environment.apiUrl}/auth/password-reset/request-code`, {
          email,
        }),
      );
      return { error: null, retryAfterSeconds: res?.retryAfterSeconds ?? 15 };
    } catch (err: any) {
      return {
        error: err?.error?.message ?? 'No se pudo enviar el código de verificación',
        retryAfterSeconds: err?.error?.retryAfterSeconds ?? 15,
      };
    }
  }

  /**
   * Segundo paso: confirma el código y cambia la contraseña de una vez. A propósito NO deja la
   * sesión iniciada — la persona entra por Login con su contraseña nueva.
   */
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/password-reset/confirm`, { email, code, newPassword }),
      );
      return null;
    } catch (err: any) {
      return err?.error?.message ?? 'No se pudo restablecer la contraseña';
    }
  }

  /**
   * Cierra la sesión también en el servidor (POST /auth/logout revoca TODOS los tokens de esta
   * cuenta): así un token copiado desde F12 deja de servir apenas se sale. Va por HttpBackend
   * (sin interceptores) para que un 401 acá no vuelva a disparar sessionExpiredInterceptor, y sin
   * esperar la respuesta — la sesión local se limpia igual aunque no haya red.
   */
  logout(): void {
    const token = this.tokenSignal();
    if (token) {
      new HttpClient(this.httpBackend)
        .post(`${environment.apiUrl}/auth/logout`, null, { headers: { Authorization: `Bearer ${token}` } })
        .subscribe({ error: () => undefined });
    }
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
