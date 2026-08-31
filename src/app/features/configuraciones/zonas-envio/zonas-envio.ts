import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CompaniesService } from '../../../core/services/companies.service';
import { Country } from '../../../core/models/company.model';
import { Zone, ZonesService, ZoneFeePreview } from '../../../core/services/zones.service';
import { Select } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

interface ZoneForm {
  fuelPrice: number;
  baseFare: number;
  pricePerKm: number;
  minFee: number;
  driverCommissionPct: number;
}

/**
 * Configuraciones > Zonas de envío: la tarifa de envío la controla 100% la
 * plataforma por ZONA (Occidental / Central / Oriental...). Cada sucursal
 * hereda la tarifa de la zona de su departamento — ya no configura envío.
 *
 *   Cliente paga  = max(mínimo, base + $/km × distancia)
 *   Plataforma retiene  = % del envío
 *   Repartidor gana  = envío − lo que retiene la plataforma
 *
 * El precio de la gasolina es solo un dato de referencia visible: NO entra
 * en la fórmula, el admin ajusta base y $/km a mano.
 */
@Component({
  selector: 'app-zonas-envio',
  standalone: true,
  imports: [FormsModule, DatePipe, Select, Skeleton],
  templateUrl: './zonas-envio.html',
  styleUrl: './zonas-envio.scss',
})
export class ZonasEnvio implements OnInit {
  private readonly companies = inject(CompaniesService);
  private readonly zonesService = inject(ZonesService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly savingZoneId = signal<number | null>(null);

  readonly countries = signal<Country[]>([]);
  countryId = 0;
  readonly currencySymbol = signal('$');

  readonly zones = signal<Zone[]>([]);
  /** Estado editable del formulario por zona (id → valores). */
  readonly forms = signal<Record<number, ZoneForm>>({});
  /** Preview recalculado en vivo mientras se edita (id → filas). */
  readonly livePreview = signal<Record<number, ZoneFeePreview[]>>({});

  get countryOptions() {
    return this.countries().map((c) => ({ value: c.id, label: c.name }));
  }

  async ngOnInit(): Promise<void> {
    try {
      const countries = await this.companies.listCountries();
      this.countries.set(countries);
      if (countries.length === 0) {
        this.isLoading.set(false);
        return;
      }
      this.countryId = countries[0].id;
      await this.loadZones();
    } catch {
      this.toast.error('No se pudieron cargar los países');
      this.isLoading.set(false);
    }
  }

  async onCountryChange(): Promise<void> {
    this.isLoading.set(true);
    await this.loadZones();
  }

  private async loadZones(): Promise<void> {
    try {
      const res = await this.zonesService.listByCountry(this.countryId);
      this.currencySymbol.set(res.currency.symbol || '$');
      this.zones.set(res.data);

      const forms: Record<number, ZoneForm> = {};
      const preview: Record<number, ZoneFeePreview[]> = {};
      for (const zone of res.data) {
        forms[zone.id] = {
          fuelPrice: Number(zone.settings?.fuelPrice ?? 0),
          baseFare: Number(zone.settings?.baseFare ?? 0),
          pricePerKm: Number(zone.settings?.pricePerKm ?? 0),
          minFee: Number(zone.settings?.minFee ?? 0),
          driverCommissionPct: Number(zone.settings?.driverCommissionPct ?? 0),
        };
        preview[zone.id] = zone.preview;
      }
      this.forms.set(forms);
      this.livePreview.set(preview);
    } catch {
      this.toast.error('No se pudieron cargar las zonas de este país');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Recalcula el preview de una zona en el navegador mientras se edita (misma fórmula que el backend). */
  recalc(zoneId: number): void {
    const f = this.forms()[zoneId];
    if (!f) return;
    const rows: ZoneFeePreview[] = [0, 3, 6].map((km) => {
      const raw = Number(f.baseFare) + Number(f.pricePerKm) * km;
      const customerFee = round2(Math.max(Number(f.minFee), raw));
      const platformCut = round2(customerFee * (Number(f.driverCommissionPct) / 100));
      return { distanceKm: km, customerFee, platformCut, driverEarning: round2(customerFee - platformCut) };
    });
    this.livePreview.update((p) => ({ ...p, [zoneId]: rows }));
  }

  async save(zone: Zone): Promise<void> {
    const f = this.forms()[zone.id];
    if (!f) return;
    if (
      [f.fuelPrice, f.baseFare, f.pricePerKm, f.minFee, f.driverCommissionPct].some(
        (n) => n == null || Number.isNaN(Number(n)) || Number(n) < 0,
      )
    ) {
      this.toast.error('Todos los valores deben ser números mayores o iguales a 0');
      return;
    }
    if (Number(f.driverCommissionPct) > 100) {
      this.toast.error('El porcentaje que retiene la plataforma no puede pasar de 100');
      return;
    }

    this.savingZoneId.set(zone.id);
    try {
      const saved = await this.zonesService.updateSettings(zone.id, {
        fuelPrice: Number(f.fuelPrice),
        baseFare: Number(f.baseFare),
        pricePerKm: Number(f.pricePerKm),
        minFee: Number(f.minFee),
        driverCommissionPct: Number(f.driverCommissionPct),
      });
      this.zones.update((zs) => zs.map((z) => (z.id === zone.id ? { ...z, settings: saved } : z)));
      this.recalc(zone.id);
      this.toast.success(`Tarifa de la zona ${zone.name} actualizada`);
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudieron guardar los cambios');
    } finally {
      this.savingZoneId.set(null);
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
