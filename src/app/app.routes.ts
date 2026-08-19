import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'estadisticas' },
      {
        path: 'estadisticas',
        loadComponent: () => import('./features/estadisticas/estadisticas').then((m) => m.Estadisticas),
      },
      {
        path: 'negocios',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/negocios/negocios-lista/negocios-lista').then((m) => m.NegociosLista),
      },
      {
        path: 'negocios/:id',
        loadComponent: () =>
          import('./features/negocios/negocio-detalle/negocio-detalle').then((m) => m.NegocioDetalle),
      },
      {
        path: 'negocios/:id/horario',
        loadComponent: () =>
          import('./features/negocios/negocio-horario/negocio-horario').then((m) => m.NegocioHorario),
      },
      {
        path: 'negocios/:id/menu',
        loadComponent: () => import('./features/negocios/negocio-menu/negocio-menu').then((m) => m.NegocioMenu),
      },
      {
        path: 'negocios/:id/personal',
        loadComponent: () =>
          import('./features/negocios/negocio-personal/negocio-personal').then((m) => m.NegocioPersonal),
      },
      {
        path: 'repartidores',
        loadComponent: () => import('./features/repartidores/repartidores').then((m) => m.Repartidores),
      },
      {
        path: 'pagos',
        loadComponent: () => import('./features/pagos/pagos').then((m) => m.Pagos),
      },
      {
        path: 'notificaciones',
        loadComponent: () => import('./features/notificaciones/notificaciones').then((m) => m.Notificaciones),
      },
      {
        path: 'publicidad/negocios',
        loadComponent: () => import('./features/publicidad/publicidad').then((m) => m.Publicidad),
        data: { mode: 'store' },
      },
      {
        path: 'publicidad/productos',
        loadComponent: () => import('./features/publicidad/publicidad').then((m) => m.Publicidad),
        data: { mode: 'product' },
      },
      {
        path: 'configuraciones/tipos-negocio',
        loadComponent: () =>
          import('./features/configuraciones/tipos-negocio/tipos-negocio').then((m) => m.TiposNegocio),
      },
      {
        path: 'configuraciones/tipo-pago',
        loadComponent: () => import('./features/configuraciones/tipo-pago/tipo-pago').then((m) => m.TipoPago),
      },
      {
        path: 'configuraciones/cuentas-pago',
        loadComponent: () =>
          import('./features/configuraciones/cuentas-pago/cuentas-pago').then((m) => m.CuentasPago),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
