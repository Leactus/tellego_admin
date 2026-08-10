/**
 * Suma `months` meses a una fecha 'YYYY-MM-DD' (DATEONLY) respetando el fin de mes (31 ene + 1 mes =
 * 28/29 feb, no "3 de marzo" que es lo que da `setMonth` al desbordar un mes más corto) — debe
 * coincidir exacto con `addMonths` en admin/payments.controller.ts, esto es solo la vista previa del
 * modal de "adelantar pagos"; el backend recalcula lo mismo como fuente de verdad.
 */
function addMonthsToDateOnly(dateOnly: string, months: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const next = new Date(year, month - 1 + months, 1);
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInTargetMonth));
  return next.toISOString().slice(0, 10);
}

export { addMonthsToDateOnly };
