import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * Cualquier 401 de una petición que SÍ llevaba token (sesión existente que el backend ya no
 * acepta: token vencido o inválido) cierra la sesión y manda a Login con un aviso claro — antes
 * cada pantalla mostraba su propio error genérico ("no se pudo cargar X") sin explicar que había
 * que volver a iniciar sesión. Un 401 de /auth/login (credenciales mal escritas) nunca lleva
 * Authorization, así que nunca entra acá — solo reacciona a sesiones que YA estaban autenticadas.
 * Mismo patrón que delivery-pedidos-admin/core/interceptors/session-expired.interceptor.ts.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.headers.has('Authorization')) {
        auth.logout();
        router.navigateByUrl('/login');
        toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
      }
      return throwError(() => err);
    }),
  );
};
