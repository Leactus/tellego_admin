import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../config/environment';
import { Permission, Role, RoleType } from '../models/role.model';

interface DataWrapper<T> {
  data: T;
}

/**
 * Roles y permisos a medida de un negocio puntual — el self-service del dueño se retiró (ver
 * delivery-pedidos-admin/roles-permisos, ahora de solo lectura); crear/editar/borrar un rol propio
 * de una empresa es exclusivo del super-admin, sin afectar a las demás (ver admin/roles.controller.ts).
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  /** Paquete GLOBAL de roles (Configuraciones > Roles y permisos): las plantillas del sistema +
   * cualquier rol global ya creado — disponible automáticamente para TODA empresa, nueva o existente. */
  listGlobalRoles(roleType?: RoleType): Promise<Role[]> {
    return firstValueFrom(
      this.http.get<DataWrapper<Role[]>>(`${this.base}/roles`, {
        params: roleType ? { roleType } : {},
      }),
    ).then((r) => r.data);
  }

  /** Crea un rol GLOBAL — pasa a estar disponible para todas las empresas, como una plantilla del
   * sistema, pero a diferencia de esas sí se puede editar/borrar después con updateRole/deleteRole. */
  createGlobalRole(payload: { name: string; roleType: RoleType; permissionCodes: string[] }): Promise<Role> {
    return firstValueFrom(this.http.post<DataWrapper<Role>>(`${this.base}/roles`, payload)).then((r) => r.data);
  }

  /** Roles disponibles para el negocio indicado: plantillas del sistema + los propios de ese negocio. */
  listRoles(companyId: number, roleType?: RoleType): Promise<Role[]> {
    return firstValueFrom(
      this.http.get<DataWrapper<Role[]>>(`${this.base}/companies/${companyId}/roles`, {
        params: roleType ? { roleType } : {},
      }),
    ).then((r) => r.data);
  }

  createRole(companyId: number, payload: { name: string; roleType: RoleType; permissionCodes: string[] }): Promise<Role> {
    return firstValueFrom(
      this.http.post<DataWrapper<Role>>(`${this.base}/companies/${companyId}/roles`, payload),
    ).then((r) => r.data);
  }

  /** "Edita" un rol GLOBAL (system o global personalizado) SOLO para este negocio: crea una copia
   * propia de la empresa con los cambios y reasigna a su personal/repartidores ya asignados — el
   * original (y los demás negocios que lo usan) queda intacto. NUNCA usar updateRole() para esto. */
  forkRole(
    companyId: number,
    sourceRoleId: number,
    payload: { name?: string; permissionCodes: string[] },
  ): Promise<{ role: Role; reassigned: number }> {
    return firstValueFrom(
      this.http.post<DataWrapper<Role> & { reassigned: number }>(
        `${this.base}/companies/${companyId}/roles/${sourceRoleId}/fork`,
        payload,
      ),
    ).then((r) => ({ role: r.data, reassigned: r.reassigned }));
  }

  updateRole(
    id: number,
    payload: { name?: string; status?: 'active' | 'inactive'; permissionCodes?: string[] },
  ): Promise<Role> {
    return firstValueFrom(this.http.patch<DataWrapper<Role>>(`${this.base}/roles/${id}`, payload)).then(
      (r) => r.data,
    );
  }

  deleteRole(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/roles/${id}`));
  }

  /** Catálogo fijo de permisos, para el picker de la UI de creación/edición de roles. */
  listPermissionsCatalog(roleType?: RoleType): Promise<Permission[]> {
    return firstValueFrom(
      this.http.get<DataWrapper<Permission[]>>(`${this.base}/permissions`, {
        params: roleType ? { roleType } : {},
      }),
    ).then((r) => r.data);
  }
}
