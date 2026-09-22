export type RoleType = 'empleado' | 'repartidor';

/** Fila del catálogo FIJO de permisos (definido por código, nunca editable desde esta UI). */
export interface Permission {
  id: number;
  code: string;
  module: string;
  action: string;
  roleType: RoleType;
  label: string;
  sortOrder: number;
}

/**
 * Rol personalizable. companyId null = plantilla del sistema (isSystem=true, solo lectura); con
 * valor = rol a medida de ese negocio, creado/editado únicamente por el super-admin (nunca por el
 * dueño — ver roles.service.ts).
 */
export interface Role {
  id: number;
  companyId: number | null;
  roleType: RoleType;
  name: string;
  isSystem: boolean;
  status: 'active' | 'inactive';
  permissions: Permission[];
}
