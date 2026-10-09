import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { Icon, IconName } from '../../shared/icon/icon';
import { ConfirmService } from '../../shared/confirm/confirm.service';

interface MenuItem {
  path: string;
  label: string;
  icon: IconName;
}

interface MenuEntry {
  key: string;
  label: string;
  icon: IconName;
  /** Link directo (entradas sin `children`). */
  path?: string;
  /** Si existe, la entrada se pinta como acordeón. */
  children?: MenuItem[];
}

/** Shell del panel super-admin: sidebar + topbar + <router-outlet>, mismo
 * patrón visual que business-shell.ts en delivery-pedidos-admin. */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);

  readonly user = this.auth.user;
  readonly userInitial = computed(() => (this.user()?.name?.trim()?.charAt(0) ?? '?').toUpperCase());

  /** Entradas del sidebar: un link directo o un acordeón con sub-links (`children`). */
  readonly menu: MenuEntry[] = [
    { key: 'estadisticas', path: 'estadisticas', label: 'Estadísticas', icon: 'dashboard' },
    { key: 'negocios', path: 'negocios', label: 'Negocios', icon: 'store' },
    { key: 'repartidores', path: 'repartidores', label: 'Repartidores', icon: 'truck' },
    {
      key: 'pagos-repartidores',
      label: 'Recompensas y pagos',
      icon: 'users',
      children: [
        { path: 'desembolsos', label: 'Desembolsos', icon: 'send' },
        { path: 'referidos', label: 'Referidos', icon: 'gift' },
      ],
    },
    { key: 'centro-de-pagos', path: 'centro-de-pagos', label: 'Centro de pagos', icon: 'credit-card' },
    {
      key: 'tienda',
      label: 'Tienda',
      icon: 'shopping-bag',
      children: [
        { path: 'tienda/productos', label: 'Productos', icon: 'shopping-bag' },
        { path: 'tienda/solicitudes', label: 'Solicitudes', icon: 'gift' },
      ],
    },
    {
      key: 'publicidad',
      label: 'Publicidad',
      icon: 'megaphone',
      children: [
        { path: 'publicidad/negocios', label: 'De negocios', icon: 'store' },
        { path: 'publicidad/productos', label: 'De productos', icon: 'package' },
      ],
    },
    { key: 'notificaciones', path: 'notificaciones', label: 'Notificaciones', icon: 'bell' },
    {
      key: 'configuraciones',
      label: 'Configuraciones',
      icon: 'settings',
      children: [
        { path: 'configuraciones/tipos-negocio', label: 'Tipos de negocio', icon: 'store' },
        { path: 'configuraciones/tipo-pago', label: 'Tipo de pago', icon: 'credit-card' },
        { path: 'configuraciones/roles-permisos', label: 'Roles y permisos', icon: 'puzzle' },
        { path: 'configuraciones/documentos-repartidor', label: 'Documentos de repartidor', icon: 'truck' },
        { path: 'configuraciones/zonas-envio', label: 'Zonas de envío', icon: 'map-pin' },
        { path: 'configuraciones/cuentas-pago', label: 'Cuentas de pago', icon: 'credit-card' },
        { path: 'configuraciones/terminos-privacidad', label: 'Términos y privacidad', icon: 'receipt' },
        { path: 'configuraciones/correos', label: 'Correos', icon: 'mail' },
      ],
    },
  ];

  /** Acordeones abiertos; arranca abierto el grupo de la ruta actual. */
  private readonly openGroups = signal<ReadonlySet<string>>(
    new Set(
      this.menu
        .filter((entry) => entry.children?.some((child) => this.router.url.includes(`/${child.path}`)))
        .map((entry) => entry.key),
    ),
  );

  /** Sidebar como panel deslizable en pantallas angostas (ver breakpoint en shell.scss). */
  readonly sidebarOpen = signal(false);

  /** En escritorio el sidebar se puede ocultar/mostrar con el mismo botón hamburguesa. */
  readonly sidebarCollapsed = signal(false);

  isGroupOpen(key: string): boolean {
    return this.openGroups().has(key);
  }

  toggleGroup(key: string): void {
    this.openGroups.update((open) => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  async logout(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cerrar sesión',
      message: '¿Seguro que quieres cerrar sesión?',
      confirmLabel: 'Cerrar sesión',
      variant: 'danger',
      icon: 'logout',
    });
    if (!confirmed) return;

    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
