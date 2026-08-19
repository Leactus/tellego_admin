/** Desplaza hasta el primer campo `.invalid` dentro de `root` tras un submit fallido. El setTimeout espera a que Angular pinte las clases `.invalid` antes de buscar. */
export function scrollToFirstInvalid(root: HTMLElement): void {
  setTimeout(() => {
    root.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
