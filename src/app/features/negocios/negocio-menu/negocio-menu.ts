import { Location } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { CompaniesService } from '../../../core/services/companies.service';
import { CatalogService } from '../../../core/services/catalog.service';
import { Company } from '../../../core/models/company.model';
import { Store } from '../../../core/models/store.model';
import { OptionGroup, Product, ProductCategory } from '../../../core/models/catalog.model';
import { Icon } from '../../../shared/icon/icon';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { scrollToFirstInvalid } from '../../../shared/scroll-to-invalid';

type Tab = 'categorias' | 'productos';

@Component({
  selector: 'app-negocio-menu',
  standalone: true,
  imports: [FormsModule, Icon, Select, Skeleton],
  templateUrl: './negocio-menu.html',
  styleUrl: './negocio-menu.scss',
})
export class NegocioMenu implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly companiesService = inject(CompaniesService);
  private readonly catalog = inject(CatalogService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly location = inject(Location);

  private companyId!: number;

  /** Vuelve a la página/pestaña exacta de la que se vino (respeta filtros/paginación) en vez de una
   * ruta fija — ver el mismo criterio en query-param-state.ts. */
  goBack(): void {
    this.location.back();
  }

  readonly isLoading = signal(true);
  readonly activeTab = signal<Tab>('categorias');
  readonly company = signal<Company | null>(null);
  readonly branches = computed<Store[]>(() => this.company()?.branches ?? []);
  readonly categories = signal<ProductCategory[]>([]);
  readonly products = signal<Product[]>([]);

  readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: null, label: 'Sin categoría' },
    ...this.categories().map((c) => ({ value: c.id, label: c.name })),
  ]);
  readonly storeOptions = computed<SelectOption[]>(() =>
    this.branches().map((b) => ({ value: b.id, label: b.department ? `${b.name} (${b.department})` : b.name })),
  );

  // --- Modal: categoría ---
  readonly categoryModalOpen = signal(false);
  editingCategory: ProductCategory | null = null;
  categoryName = '';
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly categorySubmitted = signal(false);

  isCategoryNameInvalid(): boolean {
    return this.categorySubmitted() && !this.categoryName.trim();
  }

  // --- Modal: producto ---
  readonly productModalOpen = signal(false);
  readonly isSavingProduct = signal(false);
  editingProduct: Product | null = null;
  productForm = {
    name: '',
    description: '',
    price: 0,
    hasSale: false,
    salePrice: 0,
    categoryId: null as number | null,
    storeId: null as number | null,
  };
  selectedImageFile: File | null = null;
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly productSubmitted = signal(false);

  isProductNameInvalid(): boolean {
    return this.productSubmitted() && !this.productForm.name.trim();
  }

  isProductPriceInvalid(): boolean {
    return this.productSubmitted() && this.productForm.price <= 0;
  }

  isProductStoreInvalid(): boolean {
    return this.productSubmitted() && !this.editingProduct && !this.productForm.storeId;
  }

  // --- Modal: opciones ---
  readonly optionsModalOpen = signal(false);
  optionsProduct: Product | null = null;
  newGroupName = '';
  newGroupRequireOne = false;
  newItemNameByGroup: Record<number, string> = {};
  newItemPriceByGroup: Record<number, number> = {};
  /** true recién después de un intento fallido de "+ Nuevo grupo" — antes de eso no se marca nada en rojo. */
  readonly newGroupSubmitted = signal(false);
  /** Grupos donde ya se intentó "+ Agregar" sin llenar el nombre de la opción — llave = group.id. */
  private readonly itemAddAttemptedGroups = new Set<number>();

  isNewGroupNameInvalid(): boolean {
    return this.newGroupSubmitted() && !this.newGroupName.trim();
  }

  isNewItemNameInvalid(groupId: number): boolean {
    return this.itemAddAttemptedGroups.has(groupId) && !(this.newItemNameByGroup[groupId] ?? '').trim();
  }

  async ngOnInit(): Promise<void> {
    this.companyId = Number(this.route.snapshot.paramMap.get('id'));
    await this.reload();
  }

  async reload(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [company, categories, products] = await Promise.all([
        this.companiesService.getOne(this.companyId),
        this.catalog.listCategories(this.companyId),
        this.catalog.listProducts(this.companyId),
      ]);
      this.company.set(company);
      this.categories.set(categories);
      this.products.set(products);

      if (this.optionsProduct) {
        this.optionsProduct = products.find((p) => p.id === this.optionsProduct!.id) ?? null;
      }
    } catch {
      this.toast.error('No se pudo cargar el menú');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  // --- Categorías ---
  openNewCategory(): void {
    this.editingCategory = null;
    this.categoryName = '';
    this.categorySubmitted.set(false);
    this.categoryModalOpen.set(true);
  }

  openEditCategory(category: ProductCategory): void {
    this.editingCategory = category;
    this.categoryName = category.name;
    this.categorySubmitted.set(false);
    this.categoryModalOpen.set(true);
  }

  closeCategoryModal(): void {
    this.categoryModalOpen.set(false);
  }

  async saveCategory(): Promise<void> {
    this.categorySubmitted.set(true);
    const name = this.categoryName.trim();
    if (!name) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    try {
      if (this.editingCategory) {
        await this.catalog.updateCategory(this.editingCategory.id, name);
        this.toast.success('Categoría actualizada');
      } else {
        await this.catalog.createCategory(this.companyId, name);
        this.toast.success('Categoría creada');
      }
      this.closeCategoryModal();
      await this.reload();
    } catch {
      this.toast.error('No se pudo guardar la categoría');
    }
  }

  async deleteCategory(category: ProductCategory): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Borrar categoría',
      message: `"${category.name}" se va a borrar. Los productos que la usan quedan sin categoría.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.catalog.deleteCategory(category.id);
      await this.reload();
      this.toast.success('Categoría borrada');
    } catch {
      this.toast.error('No se pudo borrar la categoría');
    }
  }

  // --- Productos ---
  openNewProduct(): void {
    this.editingProduct = null;
    this.productForm = {
      name: '',
      description: '',
      price: 0,
      hasSale: false,
      salePrice: 0,
      categoryId: null,
      storeId: this.branches()[0]?.id ?? null,
    };
    this.selectedImageFile = null;
    this.productSubmitted.set(false);
    this.productModalOpen.set(true);
  }

  openEditProduct(product: Product): void {
    this.editingProduct = product;
    this.productForm = {
      name: product.name,
      description: product.description ?? '',
      price: Number(product.price),
      hasSale: product.salePrice != null,
      salePrice: product.salePrice != null ? Number(product.salePrice) : 0,
      categoryId: product.categoryId,
      storeId: null,
    };
    this.selectedImageFile = null;
    this.productSubmitted.set(false);
    this.productModalOpen.set(true);
  }

  closeProductModal(): void {
    this.productModalOpen.set(false);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedImageFile = input.files?.[0] ?? null;
  }

  async saveProduct(): Promise<void> {
    this.productSubmitted.set(true);
    const name = this.productForm.name.trim();
    if (!name || this.productForm.price <= 0 || (!this.editingProduct && !this.productForm.storeId)) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }
    if (this.productForm.hasSale && this.productForm.salePrice >= this.productForm.price) {
      this.toast.error('El precio de oferta debe ser menor al precio normal');
      return;
    }

    this.isSavingProduct.set(true);
    try {
      let productId: number;
      if (this.editingProduct) {
        const updated = await this.catalog.updateProduct(this.editingProduct.id, {
          name,
          description: this.productForm.description.trim(),
          price: this.productForm.price,
          salePrice: this.productForm.hasSale ? this.productForm.salePrice : null,
          categoryId: this.productForm.categoryId,
        });
        productId = updated.id;
      } else {
        const created = await this.catalog.createProduct(this.companyId, {
          name,
          description: this.productForm.description.trim(),
          price: this.productForm.price,
          salePrice: this.productForm.hasSale ? this.productForm.salePrice : null,
          categoryId: this.productForm.categoryId,
          storeId: this.productForm.storeId!,
        });
        productId = created.id;
      }

      if (this.selectedImageFile) {
        await this.catalog.uploadProductImage(productId, this.selectedImageFile);
      }

      this.closeProductModal();
      await this.reload();
      this.toast.success(this.editingProduct ? 'Producto actualizado' : 'Producto creado');
    } catch {
      this.toast.error('No se pudo guardar el producto');
    } finally {
      this.isSavingProduct.set(false);
    }
  }

  async deleteProduct(product: Product): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Borrar producto',
      message: `"${product.name}" se va a borrar de todas las sucursales, junto con su foto. No se puede deshacer.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.catalog.deleteProduct(product.id);
      await this.reload();
      this.toast.success('Producto borrado');
    } catch {
      this.toast.error('No se pudo borrar el producto');
    }
  }

  // --- Disponibilidad por sucursal ---
  isAvailableInStore(product: Product, storeId: number): boolean {
    return product.storeProducts.find((sp) => sp.storeId === storeId)?.isAvailable ?? false;
  }

  async toggleStoreAvailability(product: Product, storeId: number, event: Event): Promise<void> {
    const isAvailable = (event.target as HTMLInputElement).checked;
    try {
      await this.catalog.updateAvailability(product.id, { storeId, isAvailable });
      await this.reload();
    } catch {
      this.toast.error('No se pudo actualizar la disponibilidad');
    }
  }

  // --- Opciones (ingredientes/extras) ---
  openOptions(product: Product): void {
    this.optionsProduct = product;
    this.newGroupName = '';
    this.newGroupRequireOne = false;
    this.newGroupSubmitted.set(false);
    this.itemAddAttemptedGroups.clear();
    this.optionsModalOpen.set(true);
  }

  closeOptionsModal(): void {
    this.optionsModalOpen.set(false);
    this.optionsProduct = null;
  }

  async addGroup(): Promise<void> {
    this.newGroupSubmitted.set(true);
    const name = this.newGroupName.trim();
    if (!name || !this.optionsProduct) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }

    try {
      await this.catalog.createOptionGroup(this.optionsProduct.id, {
        name,
        minSelection: this.newGroupRequireOne ? 1 : 0,
        maxSelection: this.newGroupRequireOne ? 1 : 5,
        isRequired: this.newGroupRequireOne,
      });
      this.newGroupName = '';
      this.newGroupRequireOne = false;
      this.newGroupSubmitted.set(false);
      await this.reload();
      this.toast.success('Grupo creado');
    } catch {
      this.toast.error('No se pudo crear el grupo');
    }
  }

  async deleteGroup(group: OptionGroup): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Borrar grupo',
      message: `"${group.name}" y todas sus opciones se van a borrar.`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.catalog.deleteOptionGroup(group.id);
      await this.reload();
      this.toast.success('Grupo borrado');
    } catch {
      this.toast.error('No se pudo borrar el grupo');
    }
  }

  async addItem(group: OptionGroup): Promise<void> {
    this.itemAddAttemptedGroups.add(group.id);
    const name = (this.newItemNameByGroup[group.id] ?? '').trim();
    if (!name) {
      scrollToFirstInvalid(this.elementRef.nativeElement);
      return;
    }
    const extraPrice = this.newItemPriceByGroup[group.id] ?? 0;

    try {
      await this.catalog.createOptionItem(group.id, { name, extraPrice });
      this.newItemNameByGroup[group.id] = '';
      this.newItemPriceByGroup[group.id] = 0;
      this.itemAddAttemptedGroups.delete(group.id);
      await this.reload();
    } catch {
      this.toast.error('No se pudo agregar la opción');
    }
  }

  async deleteItem(itemId: number): Promise<void> {
    try {
      await this.catalog.deleteOptionItem(itemId);
      await this.reload();
    } catch {
      this.toast.error('No se pudo borrar la opción');
    }
  }

  itemPriceLabel(extraPrice: string): string {
    return Number(extraPrice) > 0 ? `+$${extraPrice}` : 'Sin costo extra';
  }
}
