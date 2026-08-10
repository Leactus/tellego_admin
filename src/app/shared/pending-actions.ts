import { signal } from '@angular/core';

/**
 * Evita doble-click / envíos duplicados en botones de acción (guardar,
 * borrar, activar/desactivar...): mientras una acción con cierta "key" (el
 * id de la fila, o una key fija tipo 'save' para un modal de un solo
 * formulario) está en curso, un segundo click con la misma key se ignora
 * en vez de disparar otra petición. Se libera al terminar, tanto si la
 * acción tuvo éxito como si falló — así un fallo se puede reintentar de
 * inmediato, y un éxito no se puede volver a mandar por accidente hasta
 * que esta ya terminó (incluyendo el reload que normalmente sigue).
 */
export class PendingActions {
  private readonly pendingKeys = signal<ReadonlySet<string | number>>(new Set());

  isPending(key: string | number): boolean {
    return this.pendingKeys().has(key);
  }

  get anyPending(): boolean {
    return this.pendingKeys().size > 0;
  }

  async run<T>(key: string | number, action: () => Promise<T>): Promise<T | undefined> {
    if (this.isPending(key)) return undefined;

    this.pendingKeys.update((keys) => new Set(keys).add(key));
    try {
      return await action();
    } finally {
      this.pendingKeys.update((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
  }
}
