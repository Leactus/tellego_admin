import { Component, ElementRef, Input, OnInit, computed, inject, signal } from '@angular/core';
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
 * Pestaña "Roles y permisos" del detalle de un negocio — a diferencia de la vista equivalente en
 * delivery-pedidos-admin (hoy de solo lectura para el dueño), acá el super-admin puede:
 *  - Crear un rol propio de ESTE negocio ("+ Nuevo rol") — companyId = esta empresa, editable/borrable
 *    directo (updateRole/deleteRole).
 *  - "Editar" un rol GLOBAL (companyId NULL — plantilla del sistema o global personalizado creado
 *    desde Configuraciones): esto NUNCA lo edita en sitio (afectaría a TODOS los negocios), sino que
 *    lo clona a un rol propio de este negocio con los cambios pedidos (fork, ver saveRole()) — el
 *    original y los demás negocios que lo usan quedan intactos.
 */
@Component({
  selector: 'app-negocio-roles',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Skeleton, MultiSelect],
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
  /** Rol GLOBAL que se está "editando" — en realidad se va a clonar (fork), nunca a tocar en sitio. */
  forkingFrom: Role | null = null;
  roleForm = { name: '', permissionIds: [] as number[] };
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly roleSubmitted = signal(false);

  /** companyId NULL = plantilla del sistema o rol global — nunca editable/borrable en sitio desde
   * acá, solo "editar" vía fork() (ver openEditRole). */
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
    this.activeTab = tab;
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
    this.forkingFrom = null;
    this.roleForm = { name: '', permissionIds: [] };
    this.roleSubmitted.set(false);
    this.roleModalOpen.set(true);
  }

  /** Rol propio de este negocio: edita en sitio. Rol global (isGlobal): "editar" arma un fork —
   * nombre y permisos parten de los del original, pero al guardar se crea una copia nueva. */
  openEditRole(role: Role): void {
    if (this.isGlobal(role)) {
      this.editingRole = null;
      this.forkingFrom = role;
    } else {
      this.editingRole = role;
      this.forkingFrom = null;
    }
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
        if (this.forkingFrom) {
          const { reassigned } = await this.rolesService.forkRole(this.companyId, this.forkingFrom.id, {
            name,
            permissionCodes,
          });
          this.toast.success(
            reassigned > 0
              ? `Rol personalizado creado — ${reassigned} persona(s) de este negocio se movieron automáticamente`
              : 'Rol personalizado creado para este negocio',
          );
        } else if (this.editingRole) {
          await this.rolesService.updateRole(this.editingRole.id, { name, permissionCodes });
          this.toast.success('Rol actualizado');
        } else {
          await this.rolesService.createRole(this.companyId, { name, roleType: this.activeTab, permissionCodes });
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
    if (this.isGlobal(role)) return;
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
