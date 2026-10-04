/**
 * Reglas de contraseña nueva (registro, restablecer, cambiar) — las mismas que exige el backend
 * (tellego_app_backend/src/utils/password.ts#passwordPolicyError), así el formulario avisa antes
 * de que el servidor la rechace.
 */
export const PASSWORD_MAX_LENGTH = 64;

/** Primer requisito que no cumple la contraseña, o null si los cumple todos. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña no puede pasar de ${PASSWORD_MAX_LENGTH} caracteres`;
  if (!/[A-Z]/.test(password)) return 'La contraseña debe tener al menos una letra mayúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe tener al menos un número';
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'La contraseña debe tener al menos un símbolo (ej. $, !, %, #)';
  return null;
}
