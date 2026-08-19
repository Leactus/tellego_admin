/**
 * Al fallar la validación de un formulario (ver el patrón `submitted` + `isXInvalid()` usado en
 * los modales del panel), desplaza suavemente hasta el primer campo marcado `.invalid` dentro de
 * `root` — para que el usuario no tenga que buscar a mano cuál campo falta, sobre todo en modales
 * largos donde el error puede quedar fuera de la vista. `setTimeout` porque el binding `.invalid`
 * recién se refleja en el DOM después de este ciclo de change detection.
 */
export function scrollToFirstInvalid(root: HTMLElement): void {
  setTimeout(() => {
    root.querySelector('.invalid')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}
