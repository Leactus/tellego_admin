import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { BusinessTypesService } from '../../../core/services/business-types.service';
import { SubcategoriesService } from '../../../core/services/subcategories.service';
import { CompaniesService } from '../../../core/services/companies.service';
import { BusinessType } from '../../../core/models/businessType.model';
import { SubcategoryAvailability } from '../../../core/models/subcategory.model';
import { Country } from '../../../core/models/company.model';
import { Icon } from '../../../shared/icon/icon';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

/**
 * Catálogo maestro de tipos de negocio (Restaurante, Farmacia, Supermercado,
 * ...) y, para el tipo seleccionado, sus subcategorías (nombre + imagen),
 * habilitables por país. Cada sucursal elige un tipo de negocio al crearse
 * (fijo) y cualquier cantidad de sus subcategorías (editable en cualquier
 * momento, ver negocio-detalle.ts).
 */
@Component({
  selector: 'app-tipos-negocio',
  standalone: true,
  imports: [FormsModule, Icon, Select, ScrollingModule, Skeleton],
  templateUrl: './tipos-negocio.html',
  styleUrl: './tipos-negocio.scss',
})
export class TiposNegocio implements OnInit {
  private readonly businessTypes = inject(BusinessTypesService);
  private readonly subcategories = inject(SubcategoriesService);
  private readonly companiesService = inject(CompaniesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly isLoadingTypes = signal(true);
  readonly types = signal<BusinessType[]>([]);
  readonly selectedType = signal<BusinessType | null>(null);

  readonly typeModalOpen = signal(false);
  readonly isSavingType = signal(false);
  editingType: BusinessType | null = null;
  typeName = '';
  selectedTypeImageFile: File | null = null;
  readonly typeImagePreviewUrl = signal<string | null>(null);
  private typeObjectUrl: string | null = null;

  readonly isLoadingSubcategories = signal(false);
  readonly subcategoryItems = signal<SubcategoryAvailability[]>([]);
  readonly countries = signal<Country[]>([]);
  selectedCountryId: number | null = null;

  readonly subcategoryModalOpen = signal(false);
  readonly isSavingSubcategory = signal(false);
  editingSubcategory: SubcategoryAvailability | null = null;
  subcategoryName = '';
  selectedSubcategoryImageFile: File | null = null;
  readonly subcategoryImagePreviewUrl = signal<string | null>(null);
  private subcategoryObjectUrl: string | null = null;

  get countryOptions(): SelectOption<number>[] {
    return this.countries().map((c) => ({ value: c.id, label: c.name }));
  }

  trackBySubcategoryId(_index: number, subcategory: SubcategoryAvailability): number {
    return subcategory.id;
  }

  async ngOnInit(): Promise<void> {
    this.isLoadingTypes.set(true);
    try {
      const [types, countries] = await Promise.all([this.businessTypes.list(), this.companiesService.listCountries()]);
      this.types.set(types);
      this.countries.set(countries);
      this.selectedCountryId = countries[0]?.id ?? null;
    } catch {
      this.toast.error('No se pudieron cargar los tipos de negocio');
    } finally {
      this.isLoadingTypes.set(false);
    }
  }

  async selectType(type: BusinessType): Promise<void> {
    this.selectedType.set(type);
    await this.reloadSubcategories();
  }

  async onCountryChange(): Promise<void> {
    await this.reloadSubcategories();
  }

  async reloadSubcategories(): Promise<void> {
    const type = this.selectedType();
    if (!type || !this.selectedCountryId) {
      this.subcategoryItems.set([]);
      return;
    }
    this.isLoadingSubcategories.set(true);
    try {
      const data = await this.subcategories.listByCountry(this.selectedCountryId);
      this.subcategoryItems.set(data.filter((s) => s.businessTypeId === type.id));
    } catch {
      this.toast.error('No se pudieron cargar las subcategorías');
    } finally {
      this.isLoadingSubcategories.set(false);
    }
  }

  // --- Tipos de negocio ---

  openNewTypeModal(): void {
    this.editingType = null;
    this.typeName = '';
    this.selectedTypeImageFile = null;
    this.setTypePreview(null);
    this.typeModalOpen.set(true);
  }

  openEditTypeModal(type: BusinessType): void {
    this.editingType = type;
    this.typeName = type.name;
    this.selectedTypeImageFile = null;
    this.setTypePreview(type.imageUrl);
    this.typeModalOpen.set(true);
  }

  closeTypeModal(): void {
    this.typeModalOpen.set(false);
    this.setTypePreview(null);
  }

  onTypeImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedTypeImageFile = file;
    this.setTypePreview(file ? URL.createObjectURL(file) : (this.editingType?.imageUrl ?? null));
  }

  private setTypePreview(url: string | null): void {
    if (this.typeObjectUrl) {
      URL.revokeObjectURL(this.typeObjectUrl);
      this.typeObjectUrl = null;
    }
    if (url?.startsWith('blob:')) {
      this.typeObjectUrl = url;
    }
    this.typeImagePreviewUrl.set(url);
  }

  async saveType(): Promise<void> {
    const name = this.typeName.trim();
    if (!name) return;

    this.isSavingType.set(true);
    try {
      let typeId: number;
      if (this.editingType) {
        typeId = this.editingType.id;
        await this.businessTypes.update(typeId, { name });
      } else {
        const created = await this.businessTypes.create(name);
        typeId = created.id;
      }
      if (this.selectedTypeImageFile) {
        await this.businessTypes.uploadImage(typeId, this.selectedTypeImageFile);
      }
      this.closeTypeModal();

      const types = await this.businessTypes.list();
      this.types.set(types);
      const selected = this.selectedType();
      if (selected) {
        this.selectedType.set(types.find((t) => t.id === selected.id) ?? null);
      }
      this.toast.success(this.editingType ? 'Tipo de negocio actualizado' : 'Tipo de negocio creado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar el tipo de negocio');
    } finally {
      this.isSavingType.set(false);
    }
  }

  async deleteType(type: BusinessType): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Borrar tipo de negocio',
      message: `"${type.name}" y todas sus subcategorías se van a borrar. Las sucursales que lo usan quedan sin tipo de negocio.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await this.businessTypes.remove(type.id);
      this.types.set(await this.businessTypes.list());
      if (this.selectedType()?.id === type.id) {
        this.selectedType.set(null);
        this.subcategoryItems.set([]);
      }
      this.toast.success('Tipo de negocio borrado');
    } catch {
      this.toast.error('No se pudo borrar el tipo de negocio');
    }
  }

  // --- Subcategorías del tipo seleccionado ---

  openNewSubcategoryModal(): void {
    this.editingSubcategory = null;
    this.subcategoryName = '';
    this.selectedSubcategoryImageFile = null;
    this.setSubcategoryPreview(null);
    this.subcategoryModalOpen.set(true);
  }

  openEditSubcategoryModal(subcategory: SubcategoryAvailability): void {
    this.editingSubcategory = subcategory;
    this.subcategoryName = subcategory.name;
    this.selectedSubcategoryImageFile = null;
    this.setSubcategoryPreview(subcategory.imageUrl);
    this.subcategoryModalOpen.set(true);
  }

  closeSubcategoryModal(): void {
    this.subcategoryModalOpen.set(false);
    this.setSubcategoryPreview(null);
  }

  onSubcategoryImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedSubcategoryImageFile = file;
    this.setSubcategoryPreview(file ? URL.createObjectURL(file) : (this.editingSubcategory?.imageUrl ?? null));
  }

  private setSubcategoryPreview(url: string | null): void {
    if (this.subcategoryObjectUrl) {
      URL.revokeObjectURL(this.subcategoryObjectUrl);
      this.subcategoryObjectUrl = null;
    }
    if (url?.startsWith('blob:')) {
      this.subcategoryObjectUrl = url;
    }
    this.subcategoryImagePreviewUrl.set(url);
  }

  async saveSubcategory(): Promise<void> {
    const type = this.selectedType();
    const name = this.subcategoryName.trim();
    if (!type || !name) return;

    this.isSavingSubcategory.set(true);
    try {
      let subcategoryId: number;
      if (this.editingSubcategory) {
        subcategoryId = this.editingSubcategory.id;
        await this.subcategories.update(subcategoryId, { name });
      } else {
        const created = await this.subcategories.create(type.id, name);
        subcategoryId = created.id;
        // Subcategoría nueva: se habilita de una vez para el país que se está viendo.
        if (this.selectedCountryId) {
          await this.subcategories.enableForCountry(this.selectedCountryId, subcategoryId);
        }
      }
      if (this.selectedSubcategoryImageFile) {
        await this.subcategories.uploadImage(subcategoryId, this.selectedSubcategoryImageFile);
      }
      this.closeSubcategoryModal();
      await this.reloadSubcategories();
      this.toast.success(this.editingSubcategory ? 'Subcategoría actualizada' : 'Subcategoría creada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la subcategoría');
    } finally {
      this.isSavingSubcategory.set(false);
    }
  }

  async toggleSubcategoryEnabled(subcategory: SubcategoryAvailability): Promise<void> {
    if (!this.selectedCountryId) return;
    try {
      if (subcategory.enabled) {
        await this.subcategories.disableForCountry(this.selectedCountryId, subcategory.id);
      } else {
        await this.subcategories.enableForCountry(this.selectedCountryId, subcategory.id);
      }
      await this.reloadSubcategories();
    } catch {
      this.toast.error('No se pudo actualizar la disponibilidad');
    }
  }

  async deleteSubcategory(subcategory: SubcategoryAvailability): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Borrar subcategoría',
      message: `"${subcategory.name}" se va a borrar del catálogo completo (todos los países). Las sucursales que la tenían la pierden.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await this.subcategories.remove(subcategory.id);
      await this.reloadSubcategories();
      this.toast.success('Subcategoría borrada');
    } catch {
      this.toast.error('No se pudo borrar la subcategoría');
    }
  }
}
