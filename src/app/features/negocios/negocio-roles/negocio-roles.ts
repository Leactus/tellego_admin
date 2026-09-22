import { Component, ElementRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RolesService } from '../../../core/services/roles.service';
import { Permission, Role, RoleType } from '../../../core/models/role.model';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { PermissionPicker } from '../../../shared/permission-picker/permission-picker';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PendingActions } from '../../../shared/pending-actions';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';

const TABS: { value: RoleType; label: string }[] = [
  { value: 'empleado', label: 'Personal de sucursal' },
  { value: 'repartidor', label: 'Repartidores propios' },
];

/**
 * Pestaña "Roles y permisos" del detalle de un negocio — a diferencia de la vista equivalente en
 * delivery-pedidos-admin (hoy de solo lectura para el dueño), acá el super-admin puede:
 *  - Crear un rol propio de ESTE negocio ("+ Nuevo rol") — companyId = esta empresa, editable/borrable
 *    directo (updateRole/deleteRole), nunca visible para otros negocios.
 *  - Editar CUALQUIER rol (incluidos los globales — plantillas del sistema o creados desde
 *    Configuraciones) SIEMPRE en sitio: el cambio se ve en TODOS los negocios que lo usan, a
 *    propósito (mismo criterio que la pantalla global, ver configuraciones/roles-permisos.ts). Para
 *    no tocar sin querer un rol compartido, borrar sigue restringido a los roles propios de este
 *    negocio (ver deleteRole) — borrar uno global se hace desde Configuraciones, con ese contexto.
 */
@Component({
  selector: 'app-negocio-roles',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Skeleton, PermissionPicker],
  templateUrl: './negocio-roles.html',
  styleUrl: './negocio-roles.scss',
})
export class NegocioRoles implements OnInit {
  @Input({ required: true }) companyId!: number;

  private readonly rolesService = inject(RolesService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly tabs = TABS;
  /** Signal (no propiedad plana): rolesForTab/catalogForTab son computed() y solo se re-evalúan
   * cuando cambia una signal de la que dependen — con una propiedad plana, cambiar de pestaña no
   * refrescaba la lista (quedaba pegada en el resultado cacheado de la primera pestaña). */
  readonly activeTab = signal<RoleType>('empleado');

  readonly isLoading = signal(true);
  readonly roles = signal<Role[]>([]);
  readonly permissionsCatalog = signal<Permission[]>([]);

  readonly rolesForTab = computed(() => this.roles().filter((r) => r.roleType === this.activeTab()));
  readonly catalogForTab = computed(() => this.permissionsCatalog().filter((p) => p.roleType === this.activeTab()));

  /** Evita doble-click en guardar/borrar/activar — ver shared/pending-actions.ts. */
  readonly busy = new PendingActions();

  readonly roleModalOpen = signal(false);
  editingRole: Role | null = null;
  roleForm = { name: '', permissionIds: [] as number[] };
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly roleSubmitted = signal(false);

  /** companyId NULL = plantilla del sistema o rol global — se puede editar en sitio (afecta a
   * todos), pero no borrar desde acá (ver deleteRole). */
  isGlobal(role: Role): boolean {
    return role.companyId === null;
  }

  isRoleNameInvalid(): boolean {
    return this.roleSubmitted() && !this.roleForm.name.trim();
  }

  isPermissionsInvalid(): boolean {
    return this.roleSubmitted() && this.roleForm.permissionIds.length === 0;
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  setTab(tab: RoleType): void {
    this.activeTab.set(tab);
  }

  /** `silent`: true para refrescos después de guardar/borrar/activar — no tapa la lista con el esqueleto. */
  async reload(silent = false): Promise<void> {
    if (!silent) this.isLoading.set(true);
    try {
      const [roles, catalog] = await Promise.all([
        this.rolesService.listRoles(this.companyId),
        this.rolesService.listPermissionsCatalog(),
      ]);
      this.roles.set(roles);
      this.permissionsCatalog.set(catalog);
    } catch {
      this.toast.error('No se pudieron cargar los roles');
    } finally {
      if (!silent) this.isLoading.set(false);
    }
  }

  permissionCount(role: Role): number {
    return role.permissions.length;
  }

  openNewRole(): void {
    this.editingRole = null;
    this.roleForm = { name: '', permissionIds: [] };
    this.roleSubmitted.set(false);
    this.roleModalOpen.set(true);
  }

  openEditRole(role: Role): void {
    this.editingRole = role;
    this.roleForm = { name: role.name, permissionIds: role.permissions.map((p) => p.id) };
    this.roleSubmitted.set(false);
    this.roleModalOpen.set(true);
  }

  closeRoleModal(): void {
    this.roleModalOpen.set(false);
  }

  private codesFor(ids: number[]): string[] {
    const idSet = new Set(ids);
    return this.permissionsCatalog()
      .filter((p) => idSet.has(p.id))
      .map((p) => p.code);
  }

  async saveRole(): Promise<void> {
    this.roleSubmitted.set(true);
    const name = this.roleForm.name.trim();
    if (!name || this.roleForm.permissionIds.length === 0) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    await this.busy.run('save-role', async () => {
      try {
        const permissionCodes = this.codesFor(this.roleForm.permissionIds);
        if (this.editingRole) {
          await this.rolesService.updateRole(this.editingRole.id, { name, permissionCodes });
          this.toast.success(
            this.isGlobal(this.editingRole) ? 'Rol actualizado — el cambio se ve en todos los negocios' : 'Rol actualizado',
          );
        } else {
          await this.rolesService.createRole(this.companyId, { name, roleType: this.activeTab(), permissionCodes });
          this.toast.success('Rol creado');
        }
        this.closeRoleModal();
        await this.reload(true);
      } catch (err) {
        const message = (err as { error?: { message?: string } })?.error?.message;
        this.toast.error(message ?? 'No se pudo guardar el rol');
      }
    });
  }

  async toggleRoleStatus(role: Role): Promise<void> {
    const nextStatus = role.status === 'active' ? 'inactive' : 'active';
    await this.busy.run(`toggle-role-${role.id}`, async () => {
      try {
        await this.rolesService.updateRole(role.id, { status: nextStatus });
        await this.reload(true);
        this.toast.success(nextStatus === 'active' ? 'Rol activado' : 'Rol desactivado');
      } catch {
        this.toast.error('No se pudo actualizar el rol');
      }
    });
  }

  async deleteRole(role: Role): Promise<void> {
    if (this.isGlobal(role)) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Borrar rol',
      message: `"${role.name}" se va a borrar. Si alguien lo tiene asignado, primero tendrás que reasignarlo.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!confirmed) return;

    await this.busy.run(`delete-role-${role.id}`, async () => {
      try {
        await this.rolesService.deleteRole(role.id);
        await this.reload(true);
        this.toast.success('Rol borrado');
      } catch (err) {
        const message = (err as { error?: { message?: string } })?.error?.message;
        this.toast.error(message ?? 'No se pudo borrar el rol');
      }
    });
  }
}
