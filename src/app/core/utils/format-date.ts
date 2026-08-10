const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Convierte a Date en hora LOCAL: "YYYY-MM-DD" (DATEONLY del backend, ej. billingStartsAt) se parsea
 * como año/mes/día locales para no correr un día si `new Date(str)` lo interpretara como UTC medianoche
 * en una zona horaria negativa. Un timestamp completo (con hora/Z) sí se parsea directo, ya es un instante real.
 */
function toLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (dateOnly) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

/** "Lunes 15 de mayo 2026" — para fechas puntuales y destacadas (no listas/tablas con muchas filas). */
function formatLongDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = toLocalDate(value);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "15 may 2026" — corto pero con el mes en letras y en español, para tablas/listas con muchas filas. */
function formatShortDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = toLocalDate(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/** "15 may 2026, 3:45 p. m." — igual que formatShortDate pero con hora, para timestamps de pedidos/pagos. */
function formatShortDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = toLocalDate(value);
  const time = date.toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${formatShortDate(date)}, ${time}`;
}

export { formatLongDate, formatShortDate, formatShortDateTime };
