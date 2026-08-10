import { ActivatedRoute, Router } from '@angular/router';

/** Lee un query param de texto (null si falta o está vacío). */
export function getQueryParam(route: ActivatedRoute, key: string): string | null {
  const value = route.snapshot.queryParamMap.get(key);
  return value && value.trim() !== '' ? value : null;
}

/** Lee un query param numérico entero positivo, o `fallback` si falta o es inválido. */
export function getQueryParamNumber(route: ActivatedRoute, key: string, fallback: number): number {
  const raw = route.snapshot.queryParamMap.get(key);
  const n = raw !== null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Refleja el estado actual (página, tamaño de página, búsqueda, filtros...) en los
 * query params de la URL, sin agregar entradas al historial (`replaceUrl`). Así un
 * refresh (F5) o volver atrás respeta la página y los filtros en vez de reiniciar a 1.
 * Pasa `null` en un valor que sea el default (ej. page=1, search='') para no ensuciar
 * la URL con params redundantes.
 */
export function syncQueryParams(
  router: Router,
  route: ActivatedRoute,
  params: Record<string, string | number | null>,
): void {
  router.navigate([], {
    relativeTo: route,
    queryParams: params,
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}
