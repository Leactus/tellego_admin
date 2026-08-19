import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BillingSettingsService } from '../../../core/services/billing-settings.service';
import { Select } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

/**
 * Configuraciones > Tipo de pago: cuota/comisión por defecto sugeridas al
 * crear un negocio nuevo (ver "Crear negocio" en negocios-lista.ts). Editar
 * esto no toca negocios ya creados — su monto/porcentaje queda congelado por
 * empresa (ver companies.monthly_fee/commission_rate).
 */
@Component({
  selector: 'app-tipo-pago',
  standalone: true,
  imports: [FormsModule, Select, Skeleton],
  templateUrl: './tipo-pago.html',
  styleUrl: './tipo-pago.scss',
})
export class TipoPago implements OnInit {
  private readonly billingSettings = inject(BillingSettingsService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  form = {
    defaultMonthlyFee: 0,
    defaultCommissionRate: 0,
    defaultGracePeriodDays: 0,
    defaultSalesCutoffHour: 0,
    defaultCommissionPaymentDueDays: 1,
  };

  /** 00, 01, ..., 23 — para el select de hora de corte. */
  readonly cutoffHourOptions = Array.from({ length: 24 }, (_, hour) => ({
    value: hour,
    label: `${String(hour).padStart(2, '0')}:00`,
  }));

  async ngOnInit(): Promise<void> {
    try {
      const settings = await this.billingSettings.get();
      this.form = {
        defaultMonthlyFee: Number(settings.defaultMonthlyFee),
        defaultCommissionRate: Number(settings.defaultCommissionRate),
        defaultGracePeriodDays: settings.defaultGracePeriodDays,
        defaultSalesCutoffHour: settings.defaultSalesCutoffHour,
        defaultCommissionPaymentDueDays: settings.defaultCommissionPaymentDueDays,
      };
    } catch {
      this.toast.error('No se pudieron cargar los valores por defecto');
    } finally {
      this.isLoading.set(false);
    }
  }

  async save(): Promise<void> {
    this.isSaving.set(true);
    try {
      const settings = await this.billingSettings.update(this.form);
      this.form = {
        defaultMonthlyFee: Number(settings.defaultMonthlyFee),
        defaultCommissionRate: Number(settings.defaultCommissionRate),
        defaultGracePeriodDays: settings.defaultGracePeriodDays,
        defaultSalesCutoffHour: settings.defaultSalesCutoffHour,
        defaultCommissionPaymentDueDays: settings.defaultCommissionPaymentDueDays,
      };
      this.toast.success('Valores por defecto actualizados');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudieron guardar los cambios');
    } finally {
      this.isSaving.set(false);
    }
  }
}
