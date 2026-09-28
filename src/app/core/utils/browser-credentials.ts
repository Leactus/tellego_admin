/**
 * "Recordarme" completo (correo + contraseña) sin guardar la contraseña en localStorage: se la
 * entrega al gestor de contraseñas del navegador vía Credential Management API, que la guarda
 * cifrada y fuera del alcance de cualquier script de la página. Hoy solo la implementan los
 * navegadores Chromium (Chrome, Edge, Brave, Opera); en Firefox/Safari estas funciones no hacen
 * nada y queda el autocompletado nativo (autocomplete="username"/"current-password" en el form).
 */

/** lib.dom de TypeScript no incluye PasswordCredential — tipado mínimo de lo que se usa. */
interface PasswordCredentialLike extends Credential {
  readonly password: string;
}
type PasswordCredentialCtor = new (data: { id: string; password: string; name?: string }) => Credential;

function passwordCredentialCtor(): PasswordCredentialCtor | null {
  const ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  return ctor && navigator.credentials ? ctor : null;
}

/** Guarda (o actualiza) correo + contraseña en el gestor del navegador tras un login exitoso. */
export async function storeBrowserCredential(email: string, password: string, name?: string): Promise<void> {
  const Ctor = passwordCredentialCtor();
  if (!Ctor) return;
  try {
    await navigator.credentials.store(new Ctor({ id: email, password, name }));
  } catch {
    // El usuario rechazó guardarla o el navegador lo bloqueó — el login ya salió bien igual.
  }
}

/**
 * Pide al navegador la credencial guardada para este sitio. Puede mostrar el selector de cuentas
 * del navegador; devuelve null si no hay ninguna, el usuario lo cierra o no hay soporte.
 */
export async function getBrowserCredential(): Promise<{ email: string; password: string } | null> {
  if (!passwordCredentialCtor()) return null;
  try {
    const cred = await navigator.credentials.get({ password: true, mediation: 'optional' } as CredentialRequestOptions);
    if (cred?.type !== 'password') return null;
    const { id, password } = cred as PasswordCredentialLike;
    return password ? { email: id, password } : null;
  } catch {
    return null;
  }
}
