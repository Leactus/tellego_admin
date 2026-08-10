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

  readonly menuItems: MenuItem[] = [
    { path: 'estadisticas', label: 'Estadísticas', icon: 'dashboard' },
    { path: 'negocios', label: 'Negocios', icon: 'store' },
    { path: 'repartidores', label: 'Repartidores', icon: 'truck' },
    { path: 'pagos', label: 'Pagos', icon: 'credit-card' },
    { path: 'publicidad/negocios', label: 'Publicidad de negocios', icon: 'megaphone' },
    { path: 'publicidad/productos', label: 'Publicidad de productos', icon: 'package' },
    { path: 'notificaciones', label: 'Notificaciones', icon: 'bell' },
  ];

  /** Acordeón de ajustes de plataforma. */
  readonly settingsItems: MenuItem[] = [
    { path: 'configuraciones/tipos-negocio', label: 'Tipos de negocio', icon: 'store' },
    { path: 'configuraciones/tipo-pago', label: 'Tipo de pago', icon: 'credit-card' },
  ];
  readonly settingsOpen = signal(this.router.url.includes('/configuraciones'));

  /** Sidebar como panel deslizable en pantallas angostas (ver breakpoint en shell.scss). */
  readonly sidebarOpen = signal(false);

  /** En escritorio el sidebar se puede ocultar/mostrar con el mismo botón hamburguesa. */
  readonly sidebarCollapsed = signal(false);

  toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
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
