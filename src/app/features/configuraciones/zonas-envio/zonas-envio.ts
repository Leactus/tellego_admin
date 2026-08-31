import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CompaniesService } from '../../../core/services/companies.service';
import { Country } from '../../../core/models/company.model';
import { Zone, ZonesService, ZoneFeePreview } from '../../../core/services/zones.service';
import { Icon } from '../../../shared/icon/icon';
import { Select } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

interface ZoneForm {
  fuelPrice: number;
  baseFare: number;
  pricePerKm: number;
  minFee: number;
  driverCommissionPct: number;
}

/**
 * Configuraciones > Zonas de envío. La tarifa de envío la controla 100% la
 * plataforma por ZONA (Occidental / Central / Oriental...). Cada sucursal
 * hereda la tarifa de la zona de su departamento — ya no configura envío.
 *
 * Desde acá el super-admin también administra el territorio: agregar países,
 * zonas y departamentos, y mover un departamento de zona.
 */
@Component({
  selector: 'app-zonas-envio',
  standalone: true,
  imports: [FormsModule, DatePipe, Icon, Select, Skeleton],
  templateUrl: './zonas-envio.html',
  styleUrl: './zonas-envio.scss',
})
export class ZonasEnvio implements OnInit {
  private readonly companies = inject(CompaniesService);
  private readonly zonesService = inject(ZonesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly isLoading = signal(true);
  readonly savingZoneId = signal<number | null>(null);

  readonly countries = signal<Country[]>([]);
  countryId = 0;
  readonly currencySymbol = signal('$');

  readonly zones = signal<Zone[]>([]);
  readonly forms = signal<Record<number, ZoneForm>>({});
  readonly livePreview = signal<Record<number, ZoneFeePreview[]>>({});
  /** Zonas cuyo editor de tarifa está abierto. */
  readonly expanded = signal<Set<number>>(new Set());

  get countryOptions() {
    return this.countries().map((c) => ({ value: c.id, label: c.name }));
  }

  get zoneOptions() {
    return this.zones().map((z) => ({ value: z.id, label: z.name }));
  }

  readonly currentCountry = computed(() => this.countries().find((c) => c.id === this.countryId) ?? null);

  // --- Modales ---
  readonly countryModalOpen = signal(false);
  readonly zoneModalOpen = signal(false);
  readonly deptModalOpen = signal(false);
  readonly isSavingModal = signal(false);

  countryForm = { name: '', currencyCode: '', currencySymbol: '' };
  zoneForm = { id: 0 as number, name: '', sortOrder: 0 };
  deptForm = { id: 0 as number, name: '', zoneId: 0 };

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

  toggleExpanded(zoneId: number): void {
    this.expanded.update((s) => {
      const next = new Set(s);
      next.has(zoneId) ? next.delete(zoneId) : next.add(zoneId);
      return next;
    });
  }

  isExpanded(zoneId: number): boolean {
    return this.expanded().has(zoneId);
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

  // --- País ---
  openCountryModal(): void {
    this.countryForm = { name: '', currencyCode: '', currencySymbol: '' };
    this.countryModalOpen.set(true);
  }

  async saveCountry(): Promise<void> {
    const name = this.countryForm.name.trim();
    const currencyCode = this.countryForm.currencyCode.trim().toUpperCase();
    const currencySymbol = this.countryForm.currencySymbol.trim();
    if (!name || !/^[A-Z]{3}$/.test(currencyCode) || !currencySymbol) {
      this.toast.error('Completa nombre, código de moneda (3 letras) y símbolo');
      return;
    }
    this.isSavingModal.set(true);
    try {
      const created = await this.zonesService.createCountry({ name, currencyCode, currencySymbol });
      this.countries.update((cs) => [...cs, created].sort((a, b) => a.name.localeCompare(b.name)));
      this.countryModalOpen.set(false);
      this.countryId = created.id;
      this.isLoading.set(true);
      await this.loadZones();
      this.toast.success(`País "${name}" creado — ahora agrégale zonas y departamentos`);
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo crear el país');
    } finally {
      this.isSavingModal.set(false);
    }
  }

  // --- Zona ---
  openNewZoneModal(): void {
    this.zoneForm = { id: 0, name: '', sortOrder: this.zones().length + 1 };
    this.zoneModalOpen.set(true);
  }

  openEditZoneModal(zone: Zone): void {
    this.zoneForm = { id: zone.id, name: zone.name, sortOrder: zone.sortOrder };
    this.zoneModalOpen.set(true);
  }

  async saveZone(): Promise<void> {
    const name = this.zoneForm.name.trim();
    if (!name) {
      this.toast.error('El nombre de la zona es obligatorio');
      return;
    }
    this.isSavingModal.set(true);
    try {
      if (this.zoneForm.id) {
        await this.zonesService.updateZone(this.zoneForm.id, { name, sortOrder: Number(this.zoneForm.sortOrder) });
      } else {
        await this.zonesService.createZone(this.countryId, { name, sortOrder: Number(this.zoneForm.sortOrder) });
      }
      this.zoneModalOpen.set(false);
      await this.loadZones();
      this.toast.success(this.zoneForm.id ? 'Zona actualizada' : 'Zona creada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la zona');
    } finally {
      this.isSavingModal.set(false);
    }
  }

  async deleteZone(zone: Zone): Promise<void> {
    if (zone.departments.length > 0) {
      this.toast.error(`Reasigná los ${zone.departments.length} departamentos de "${zone.name}" a otra zona antes de borrarla`);
      return;
    }
    const ok = await this.confirm.confirm({
      title: 'Archivar zona',
      message: `La zona "${zone.name}" dejará de verse. No se borra: su tarifa se conserva y se reactiva si vuelves a crear una zona con el mismo nombre.`,
      confirmLabel: 'Archivar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.zonesService.deleteZone(zone.id);
      await this.loadZones();
      this.toast.success('Zona borrada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo borrar la zona');
    }
  }

  // --- Departamento ---
  openNewDeptModal(zoneId?: number): void {
    this.deptForm = { id: 0, name: '', zoneId: zoneId ?? this.zones()[0]?.id ?? 0 };
    this.deptModalOpen.set(true);
  }

  openEditDeptModal(dept: { id: number; name: string }, zoneId: number): void {
    this.deptForm = { id: dept.id, name: dept.name, zoneId };
    this.deptModalOpen.set(true);
  }

  async saveDept(): Promise<void> {
    const name = this.deptForm.name.trim();
    if (!name || !this.deptForm.zoneId) {
      this.toast.error('Completa el nombre y la zona del departamento');
      return;
    }
    this.isSavingModal.set(true);
    try {
      if (this.deptForm.id) {
        await this.zonesService.updateDepartment(this.deptForm.id, { name, zoneId: Number(this.deptForm.zoneId) });
      } else {
        await this.zonesService.createDepartment(this.countryId, { name, zoneId: Number(this.deptForm.zoneId) });
      }
      this.deptModalOpen.set(false);
      await this.loadZones();
      this.toast.success(this.deptForm.id ? 'Departamento actualizado' : 'Departamento creado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el departamento');
    } finally {
      this.isSavingModal.set(false);
    }
  }

  async deleteDept(dept: { id: number; name: string }): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Archivar departamento',
      message: `"${dept.name}" dejará de verse. No se borra: se reactiva si vuelves a crear un departamento con el mismo nombre. Solo se puede si ninguna sucursal está en él.`,
      confirmLabel: 'Archivar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.zonesService.deleteDepartment(dept.id);
      await this.loadZones();
      this.toast.success('Departamento borrado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo borrar el departamento');
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
