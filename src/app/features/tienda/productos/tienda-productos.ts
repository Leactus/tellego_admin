import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MarketplaceService } from '../../../core/services/marketplace.service';
import {
  MarketplaceAudience,
  MarketplaceProduct,
  MarketplacePromotion,
  MarketplacePromotionAudience,
  MarketplacePromotionType,
} from '../../../core/models/marketplace.model';
import { formatShortDate } from '../../../core/utils/format-date';
import { Icon } from '../../../shared/icon/icon';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';

const AUDIENCE_OPTIONS: SelectOption<MarketplaceAudience>[] = [
  { value: 'all', label: 'Negocios y repartidores' },
  { value: 'stores', label: 'Solo negocios' },
  { value: 'drivers', label: 'Solo repartidores freelance' },
];

const PROMO_AUDIENCE_OPTIONS: SelectOption<MarketplacePromotionAudience>[] = [
  { value: 'stores', label: 'Solo negocios' },
  { value: 'drivers', label: 'Solo repartidores freelance' },
  { value: 'all', label: 'Negocios y repartidores' },
];

/** Etiquetas sugeridas para destacar la foto — un click las pone en el campo. */
const BADGE_SUGGESTIONS = ['Más vendida', 'Nuevo', 'Oferta', 'Edición limitada', 'Impermeable', 'Térmica'];

interface ProductForm {
  name: string;
  description: string;
  price: number | null;
  compareAtPrice: number | null;
  badge: string;
  audience: MarketplaceAudience;
  /** Vacío = sin control de stock. */
  stock: number | null;
  active: boolean;
  sortOrder: number;
}

interface PromoForm {
  id: number | null;
  type: MarketplacePromotionType;
  title: string;
  buyQty: number | null;
  freeQty: number | null;
  maxPerBuyer: number | null;
  totalLimit: number | null;
  audience: MarketplacePromotionAudience;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

function emptyProductForm(): ProductForm {
  return {
    name: '',
    description: '',
    price: null,
    compareAtPrice: null,
    badge: '',
    audience: 'all',
    stock: null,
    active: true,
    sortOrder: 0,
  };
}

function emptyPromoForm(type: MarketplacePromotionType = 'buy_x_get_y'): PromoForm {
  return {
    id: null,
    type,
    title: '',
    buyQty: type === 'buy_x_get_y' ? 4 : null,
    freeQty: type === 'buy_x_get_y' ? 2 : 1,
    maxPerBuyer: null,
    totalLimit: null,
    audience: 'stores',
    startsAt: '',
    endsAt: '',
    active: true,
  };
}

/** ISO → 'YYYY-MM-DD' en hora local (para <input type="date">). */
function toDateInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' local → ISO. `endOfDay` = la promo vale todo ese día. */
function fromDateInput(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0);
  return date.toISOString();
}

function nullableNumber(value: number | null | string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tienda Tellego > Productos: lo que la plataforma vende a negocios y repartidores freelance
 * (mochilas). Cada producto con galería de fotos (la primera es la portada), precio "antes" tachado,
 * etiqueta destacada y promociones ("Compra 4 y te regalamos 2", "Te regalamos la mochila"). El
 * editor muestra al lado una vista previa de cómo lo ve el comprador.
 */
@Component({
  selector: 'app-tienda-productos',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Select, Skeleton, ToggleSwitch],
  templateUrl: './tienda-productos.html',
  styleUrl: './tienda-productos.scss',
})
export class TiendaProductos implements OnInit {
  readonly audienceOptions = AUDIENCE_OPTIONS;
  readonly promoAudienceOptions = PROMO_AUDIENCE_OPTIONS;
  readonly badgeSuggestions = BADGE_SUGGESTIONS;
  readonly formatShortDate = formatShortDate;

  private readonly api = inject(MarketplaceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly loading = signal(true);
  readonly products = signal<MarketplaceProduct[]>([]);
  readonly activeCount = computed(() => this.products().filter((p) => p.status === 'active').length);
  readonly livePromoCount = computed(() =>
    this.products().reduce((sum, p) => sum + p.promotions.filter((promo) => promo.isLive).length, 0),
  );

  // --- Editor ---
  readonly editorOpen = signal(false);
  /** Producto ya guardado que se está editando (null = creando uno nuevo). */
  readonly editing = signal<MarketplaceProduct | null>(null);
  readonly saving = signal(false);
  readonly uploading = signal(0);
  /** Un casillero con spinner por cada foto que se está subiendo. */
  readonly uploadingSlots = computed(() => Array.from({ length: this.uploading() }));
  readonly previewIndex = signal(0);
  form: ProductForm = emptyProductForm();

  // --- Promo ---
  readonly promoFormOpen = signal(false);
  readonly savingPromo = signal(false);
  promoForm: PromoForm = emptyPromoForm();

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    try {
      this.products.set(await this.api.listProducts());
    } catch {
      this.toast.error('No se pudo cargar el catálogo');
    } finally {
      this.loading.set(false);
    }
  }

  money(value: number | string | null | undefined): string {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }

  audienceLabel(audience: MarketplaceAudience | MarketplacePromotionAudience): string {
    return audience === 'all' ? 'Negocios y repartidores' : audience === 'stores' ? 'Negocios' : 'Repartidores';
  }

  livePromo(product: MarketplaceProduct): MarketplacePromotion | null {
    return product.promotions.find((p) => p.isLive) ?? null;
  }

  discountPercent(price: number | null, compareAt: number | null): number | null {
    if (!price || !compareAt || compareAt <= price) return null;
    return Math.round((1 - price / compareAt) * 100);
  }

  /** Reemplaza el producto en la lista y en el editor con la versión que devolvió el backend. */
  private applyProduct(product: MarketplaceProduct): void {
    this.products.update((list) => {
      const exists = list.some((p) => p.id === product.id);
      return exists ? list.map((p) => (p.id === product.id ? product : p)) : [product, ...list];
    });
    if (this.editing()?.id === product.id || (this.editorOpen() && !this.editing())) {
      this.editing.set(product);
      if (this.previewIndex() >= product.images.length) this.previewIndex.set(0);
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    return (err as { error?: { message?: string } })?.error?.message ?? fallback;
  }

  // --- Lista ---

  async toggleActive(product: MarketplaceProduct, active: boolean): Promise<void> {
    try {
      this.applyProduct(await this.api.updateProduct(product.id, { status: active ? 'active' : 'inactive' }));
      this.toast.success(active ? 'Producto visible en la tienda' : 'Producto oculto de la tienda');
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo cambiar el estado'));
    }
  }

  // --- Editor de producto ---

  openNew(): void {
    this.form = emptyProductForm();
    this.editing.set(null);
    this.promoFormOpen.set(false);
    this.previewIndex.set(0);
    this.editorOpen.set(true);
  }

  openEdit(product: MarketplaceProduct): void {
    this.form = {
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      badge: product.badge ?? '',
      audience: product.audience,
      stock: product.stock,
      active: product.status === 'active',
      sortOrder: product.sortOrder,
    };
    this.editing.set(product);
    this.promoFormOpen.set(false);
    this.previewIndex.set(0);
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (this.saving() || this.uploading() > 0) return;
    this.editorOpen.set(false);
  }

  async saveProduct(): Promise<void> {
    if (this.saving()) return;
    const name = this.form.name.trim();
    const price = nullableNumber(this.form.price);
    if (name.length < 2) {
      this.toast.error('Ponle un nombre al producto');
      return;
    }
    if (price === null || price < 0) {
      this.toast.error('Indica un precio válido');
      return;
    }
    const payload = {
      name,
      description: this.form.description.trim() || null,
      price,
      compareAtPrice: nullableNumber(this.form.compareAtPrice),
      badge: this.form.badge.trim() || null,
      audience: this.form.audience,
      stock: nullableNumber(this.form.stock),
      status: this.form.active ? ('active' as const) : ('inactive' as const),
      sortOrder: Number(this.form.sortOrder) || 0,
    };

    this.saving.set(true);
    try {
      const current = this.editing();
      if (current) {
        this.applyProduct(await this.api.updateProduct(current.id, payload));
        this.toast.success('Producto guardado');
      } else {
        const created = await this.api.createProduct(payload);
        this.applyProduct(created);
        this.editing.set(created);
        this.toast.success('Producto creado — ahora agrégale fotos y promociones');
      }
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo guardar el producto'));
    } finally {
      this.saving.set(false);
    }
  }

  async removeProduct(): Promise<void> {
    const product = this.editing();
    if (!product) return;
    const ok = await this.confirm.confirm({
      title: 'Eliminar producto',
      message: `"${product.name}" deja de aparecer en la tienda. Las compras ya hechas conservan su detalle.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await this.api.removeProduct(product.id);
      this.products.update((list) => list.filter((p) => p.id !== product.id));
      this.editorOpen.set(false);
      this.toast.success('Producto eliminado');
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo eliminar'));
    }
  }

  // --- Fotos ---

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const product = this.editing();
    if (!product || files.length === 0) return;

    const room = 8 - product.images.length;
    if (room <= 0) {
      this.toast.error('Máximo 8 fotos por producto');
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > room) this.toast.info(`Solo se subirán ${room} foto(s): el máximo es 8 por producto`);

    // Una por una (el backend las re-codifica a WebP); se va viendo cada una al terminar.
    for (const file of batch) {
      this.uploading.update((n) => n + 1);
      try {
        this.applyProduct(await this.api.uploadImage(product.id, file));
      } catch (err) {
        this.toast.error(this.errorMessage(err, `No se pudo subir ${file.name}`));
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
  }

  async removeImage(imageId: number): Promise<void> {
    try {
      this.applyProduct(await this.api.removeImage(imageId));
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo quitar la foto'));
    }
  }

  async moveImage(index: number, delta: -1 | 1): Promise<void> {
    const product = this.editing();
    if (!product) return;
    const ids = product.images.map((img) => img.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await this.saveImageOrder(product.id, ids);
  }

  async makeCover(index: number): Promise<void> {
    const product = this.editing();
    if (!product || index === 0) return;
    const ids = product.images.map((img) => img.id);
    const [picked] = ids.splice(index, 1);
    await this.saveImageOrder(product.id, [picked, ...ids]);
    this.previewIndex.set(0);
  }

  private async saveImageOrder(productId: number, ids: number[]): Promise<void> {
    try {
      this.applyProduct(await this.api.reorderImages(productId, ids));
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo reordenar las fotos'));
    }
  }

  previewImages(): string[] {
    return this.editing()?.images.map((img) => img.imageUrl) ?? [];
  }

  stepPreview(delta: number): void {
    const count = this.previewImages().length;
    if (count === 0) return;
    this.previewIndex.set((this.previewIndex() + delta + count) % count);
  }

  /** Promo que se destaca en la vista previa (la primera vigente). */
  previewPromo(): MarketplacePromotion | null {
    return this.editing()?.promotions.find((p) => p.isLive) ?? null;
  }

  // --- Promociones ---

  openNewPromo(type: MarketplacePromotionType = 'buy_x_get_y'): void {
    this.promoForm = emptyPromoForm(type);
    this.promoFormOpen.set(true);
  }

  openEditPromo(promo: MarketplacePromotion): void {
    this.promoForm = {
      id: promo.id,
      type: promo.type,
      title: promo.title ?? '',
      buyQty: promo.buyQty,
      freeQty: promo.freeQty,
      maxPerBuyer: promo.maxPerBuyer,
      totalLimit: promo.totalLimit,
      audience: promo.audience,
      startsAt: toDateInput(promo.startsAt),
      endsAt: toDateInput(promo.endsAt),
      active: promo.status === 'active',
    };
    this.promoFormOpen.set(true);
  }

  setPromoType(type: MarketplacePromotionType): void {
    if (this.promoForm.type === type) return;
    const keep = { id: this.promoForm.id, audience: this.promoForm.audience, title: this.promoForm.title };
    this.promoForm = { ...emptyPromoForm(type), ...keep };
  }

  /** Texto que verá el comprador con lo que hay escrito ahora (igual que el backend). */
  promoPreviewLabel(): string {
    const f = this.promoForm;
    if (f.title.trim()) return f.title.trim();
    if (f.type === 'buy_x_get_y') return `Compra ${f.buyQty || 'X'} y te regalamos ${f.freeQty || 'Y'}`;
    return Number(f.freeQty) === 1 ? '¡Te la regalamos!' : `¡Te regalamos ${f.freeQty || 'X'}!`;
  }

  promoSummary(promo: MarketplacePromotion): string {
    const parts: string[] = [];
    if (promo.type === 'buy_x_get_y') {
      parts.push(`Por cada ${promo.buyQty} pagadas, ${promo.freeQty} gratis`);
      if (promo.maxPerBuyer) parts.push(`máx. ${promo.maxPerBuyer} gratis por comprador`);
    } else {
      parts.push(`${promo.freeQty} gratis por comprador (una vez)`);
    }
    if (promo.totalLimit) parts.push(`${promo.freeGiven}/${promo.totalLimit} entregadas`);
    else parts.push(`${promo.freeGiven} regaladas`);
    return parts.join(' · ');
  }

  promoDates(promo: MarketplacePromotion): string {
    if (!promo.startsAt && !promo.endsAt) return 'Sin fecha de fin';
    if (promo.startsAt && promo.endsAt) return `${formatShortDate(promo.startsAt)} → ${formatShortDate(promo.endsAt)}`;
    if (promo.endsAt) return `Hasta el ${formatShortDate(promo.endsAt)}`;
    return `Desde el ${formatShortDate(promo.startsAt!)}`;
  }

  async savePromo(): Promise<void> {
    const product = this.editing();
    if (!product || this.savingPromo()) return;
    const f = this.promoForm;
    const freeQty = nullableNumber(f.freeQty);
    const buyQty = nullableNumber(f.buyQty);
    if (!freeQty || freeQty < 1) {
      this.toast.error('Indica cuántas unidades se regalan');
      return;
    }
    if (f.type === 'buy_x_get_y' && (!buyQty || buyQty < 1)) {
      this.toast.error('Indica cuántas hay que comprar');
      return;
    }
    if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) {
      this.toast.error('La fecha de fin no puede ser antes del inicio');
      return;
    }
    const payload = {
      type: f.type,
      title: f.title.trim() || null,
      buyQty: f.type === 'buy_x_get_y' ? buyQty : null,
      freeQty,
      maxPerBuyer: f.type === 'buy_x_get_y' ? nullableNumber(f.maxPerBuyer) : null,
      totalLimit: nullableNumber(f.totalLimit),
      audience: f.audience,
      startsAt: fromDateInput(f.startsAt),
      endsAt: fromDateInput(f.endsAt, true),
      status: f.active ? ('active' as const) : ('inactive' as const),
    };

    this.savingPromo.set(true);
    try {
      const updated = f.id
        ? await this.api.updatePromotion(f.id, payload)
        : await this.api.createPromotion(product.id, payload);
      this.applyProduct(updated);
      this.promoFormOpen.set(false);
      this.toast.success(f.id ? 'Promoción actualizada' : '¡Promoción creada!');
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo guardar la promoción'));
    } finally {
      this.savingPromo.set(false);
    }
  }

  async togglePromo(promo: MarketplacePromotion, active: boolean): Promise<void> {
    try {
      this.applyProduct(await this.api.updatePromotion(promo.id, { status: active ? 'active' : 'inactive' }));
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo cambiar la promoción'));
    }
  }

  async removePromo(promo: MarketplacePromotion): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Eliminar promoción',
      message: `"${promo.label}" deja de aplicarse. Las compras que ya la usaron la conservan.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      this.applyProduct(await this.api.removePromotion(promo.id));
      if (this.promoForm.id === promo.id) this.promoFormOpen.set(false);
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo eliminar la promoción'));
    }
  }
}
