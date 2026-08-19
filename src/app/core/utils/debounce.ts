export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/**
 * `.cancel()` existe para limpiar el timer pendiente en `ngOnDestroy` de quien la use — sin eso, si la
 * persona navega a otra pantalla (p.ej. abre el detalle de un resultado) antes de que venzan los 300ms,
 * el callback dispara igual después de la navegación con un `ActivatedRoute` ya obsoleto, y el
 * `syncQueryParams` de esa búsqueda nunca llega a escribirse en el historial — al volver, el filtro
 * aparece perdido aunque se haya escrito en pantalla.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: A) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  }) as Debounced<A>;
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}
