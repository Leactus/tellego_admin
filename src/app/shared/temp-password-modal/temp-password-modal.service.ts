import { Injectable, signal } from '@angular/core';

export interface TempPasswordInfo {
  title: string;
  email: string;
  password: string;
  /** Nota extra opcional, ej. "queda pendiente hasta que..." — se muestra bajo la contraseña. */
  message?: string;
}

/** Muestra una sola vez la contraseña autogenerada de una cuenta recién creada (dueño, repartidor, etc). */
@Injectable({ providedIn: 'root' })
export class TempPasswordModalService {
  private readonly state = signal<TempPasswordInfo | null>(null);
  readonly current = this.state.asReadonly();

  show(info: TempPasswordInfo): void {
    this.state.set(info);
  }

  close(): void {
    this.state.set(null);
  }
}
