import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RolesService } from '../../../core/services/roles.service';
import { Permission, Role, RoleType } from '../../../core/models/role.model';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { MultiSelect } from '../../../shared/multi-select/multi-select';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PendingActions } from '../../../shared/pending-actions';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';

const TABS: { value: RoleType; label: string }[] = [
  { value: 'empleado', label: 'Personal de sucursal' },
  { value: 'repartidor', label: 'Repartidores propios' },
];

/**
 * Paquete GLOBAL de roles: las plantillas del sistema (Encargado, Cajero/a, Cocinero/a, Mesero/a,
 * Repartidor — sembradas, isSystem=true, fijas, nunca editables) + cualquier rol global que se cree
 * acá (isSystem=false, sí editable/borrable). Cualquiera de los dos, companyId NULL los hace
 * disponibles automáticamente para TODO negocio, nuevo o existente — es el mismo paquete que
 * aparece en la pestaña "Roles y permisos" de cada negocio (ver negocio-roles.ts), solo que ahí
 * además se puede armar un rol A MEDIDA de ese negocio puntual (companyId propio, no NULL).
 */
@Component({
  selector: 'app-roles-permisos',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Skeleton, MultiSelect],
  templateUrl: './roles-permisos.html',
  styleUrl: './roles-permisos.scss',
})
export class RolesPermisos implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly tabs = TABS;
  activeTab: RoleType = 'empleado';

  readonly isLoading = signal(true);
  readonly roles = signal<Role[]>([]);
  readonly permissionsCatalog = signal<Permission[]>([]);

  readonly rolesForTab = computed(() => this.roles().filter((r) => r.roleType === this.activeTab));
  readonly catalogForTab = computed(() => this.permissionsCatalog().filter((p) => p.roleType === this.activeTab));
  readonly permissionOptions = computed(() =>
    this.catalogForTab().map((p) => ({ value: p.id, label: p.label })),
  );

  /** Evita doble-click en guardar/borrar/activar — ver shared/pending-actions.ts. */
  readonly busy = new PendingActions();

  readonly roleModalOpen = signal(false);
  editingRole: Role | null = null;
  roleForm = { name: '', permissionIds: [] as number[] };
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly roleSubmitted = signal(false);

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
    this.activeTab = tab;
  }

  /** `silent`: true para refrescos después de guardar/borrar/activar — no tapa la lista con el esqueleto. */
  async reload(silent = false): Promise<void> {
    if (!silent) this.isLoading.set(true);
    try {
      const [roles, catalog] = await Promise.all([
        this.rolesService.listGlobalRoles(),
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

  /** Acá SÍ se puede editar un rol del sistema (nombre/permisos/estado) — el cambio se ve para TODOS
   * los negocios, a propósito: esta es la pantalla del paquete base. Solo borrar sigue bloqueado
   * (ver deleteRole) — para personalizar SOLO un negocio puntual sin tocar el paquete, eso se hace
   * desde el detalle de ese negocio (fork, ver negocio-roles.ts), nunca desde acá. */
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
            this.editingRole.isSystem ? 'Rol actualizado — el cambio se ve en todos los negocios' : 'Rol actualizado',
          );
        } else {
          await this.rolesService.createGlobalRole({ name, roleType: this.activeTab, permissionCodes });
          this.toast.success('Rol creado — ya está disponible para todos los negocios');
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
    if (role.isSystem) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Borrar rol',
      message: `"${role.name}" se va a borrar para TODOS los negocios. Si alguien lo tiene asignado, primero tendrás que reasignarlo.`,
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
