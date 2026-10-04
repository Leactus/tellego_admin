export type EmailAudience = 'cliente' | 'negocio' | 'repartidor';

export type EmailBlock = 'code' | 'receipt' | 'reason' | 'credentials' | 'payout' | 'none';

export interface EmailTemplateContent {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  closing: string;
  buttonLabel: string;
  buttonUrl: string;
}

export interface EmailTemplate {
  key: string;
  audience: EmailAudience;
  name: string;
  trigger: string;
  block: EmailBlock;
  canDisable: boolean;
  variables: { name: string; description: string }[];
  defaults: EmailTemplateContent;
  content: EmailTemplateContent;
  bannerUrl: string | null;
  isEnabled: boolean;
  isCustomized: boolean;
  updatedAt: string | null;
  updatedBy: { id: number; name: string } | null;
}

export interface EmailSettings {
  logoUrl: string;
  hasCustomLogo: boolean;
  footerText: string | null;
  supportEmail: string | null;
}

export const EMAIL_AUDIENCES: EmailAudience[] = ['cliente', 'negocio', 'repartidor'];

export const EMAIL_AUDIENCE_LABELS: Record<EmailAudience, string> = {
  cliente: 'Clientes',
  negocio: 'Negocios',
  repartidor: 'Repartidores',
};

/** Qué arma el backend en el medio del correo (no editable, solo el texto antes y después). */
export const EMAIL_BLOCK_LABELS: Record<EmailBlock, string> = {
  code: 'el código de verificación',
  receipt: 'el detalle de la compra (productos, totales y forma de pago)',
  reason: 'el motivo que escribiste (si no escribiste ninguno, este recuadro no aparece)',
  credentials: 'el correo y la contraseña temporal de la cuenta',
  payout: 'el monto depositado y el detalle (fecha, pedidos, cuenta, referencia)',
  none: '',
};
