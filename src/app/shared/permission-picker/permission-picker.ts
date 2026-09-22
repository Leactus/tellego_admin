import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { Permission } from '../../core/models/role.model';

/** Nombre amigable por módulo del catálogo de permisos (ver seed.sql#permissions) — cae al nombre
 * crudo del módulo si algún día se agrega uno nuevo y todavía no está mapeado acá. */
const MODULE_LABELS: Record<string, string> = {
  resumen: 'Resumen',
  pedidos: 'Pedidos',
  cocina: 'Cocina',
  menu_categorias: 'Categorías del menú',
  menu_productos: 'Productos del menú',
  sucursales_personal: 'Personal',
  repartidores: 'Repartidores freelance',
  ingresos: 'Ingresos',
  pagos: 'Pagos a la plataforma',
  calificaciones: 'Calificaciones',
  estadisticas: 'Estadísticas',
  impulsa: 'Impulsa tus ventas',
  ajustes: 'Ajustes del negocio',
  pedidos_asignados: 'Pedidos asignados',
  entrega: 'Entrega',
  ganancias: 'Ganancias',
  perfil: 'Perfil',
};

interface PermissionGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

/**
 * Checklist de permisos agrupada por módulo, siempre visible (nada de abrir un dropdown para ver
 * qué está marcado) — reemplaza al <app-multi-select> genérico en los modales de rol: con solo ~25
 * permisos como máximo, mostrarlos todos de una es más claro que un selector colapsado a "N
 * seleccionadas". [(ngModel)] sobre number[] (ids de permisos), igual que el multi-select viejo.
 */
@Component({
  selector: 'app-permission-picker',
  standalone: true,
  templateUrl: './permission-picker.html',
  styleUrl: './permission-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PermissionPicker),
      multi: true,
    },
  ],
})
export class PermissionPicker implements ControlValueAccessor {
  private _permissions: Permission[] = [];
  protected groups: PermissionGroup[] = [];

  @Input()
  set permissions(value: Permission[]) {
    this._permissions = value ?? [];
    this.rebuildGroups();
  }
  get permissions(): Permission[] {
    return this._permissions;
  }

  /** Borde en rojo — mismo lenguaje visual que `.invalid` en inputs de texto, para cuando el padre
   * valida un intento de guardado fallido (ver isPermissionsInvalid() en los componentes que lo usan). */
  @Input() invalid = false;

  protected value: number[] = [];
  protected disabled = false;

  private onChange: (value: number[]) => void = () => {};
  private onTouched: () => void = () => {};

  private rebuildGroups(): void {
    const byModule = new Map<string, Permission[]>();
    for (const permission of this._permissions) {
      if (!byModule.has(permission.module)) byModule.set(permission.module, []);
      byModule.get(permission.module)!.push(permission);
    }
    this.groups = Array.from(byModule.entries()).map(([module, permissions]) => ({
      module,
      label: MODULE_LABELS[module] ?? module,
      permissions,
    }));
  }

  protected isChecked(permission: Permission): boolean {
    return this.value.includes(permission.id);
  }

  protected toggle(permission: Permission, checked: boolean): void {
    if (this.disabled) return;
    const next = checked ? [...this.value, permission.id] : this.value.filter((id) => id !== permission.id);
    this.value = next;
    this.onChange(next);
    this.onTouched();
  }

  writeValue(value: number[] | null): void {
    this.value = value ?? [];
  }

  registerOnChange(fn: (value: number[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
