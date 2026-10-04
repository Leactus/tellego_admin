/**
 * DUI de El Salvador: 8 dígitos + dígito verificador ("01234567-8").
 * Verificador = (10 - Σ dígito·peso % 10) % 10, con pesos 9..2.
 * Mismo algoritmo que el backend (src/utils/dui.ts) y la app del repartidor.
 */
export function isValidDui(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  return (10 - (sum % 10)) % 10 === Number(digits[8]);
}
