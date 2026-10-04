import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { EmailTemplatesService } from '../../../core/services/email-templates.service';
import {
  EMAIL_AUDIENCES,
  EMAIL_AUDIENCE_LABELS,
  EMAIL_BLOCK_LABELS,
  EmailAudience,
  EmailBlock,
  EmailSettings,
  EmailTemplate,
  EmailTemplateContent,
} from '../../../core/models/email-template.model';
import { debounce } from '../../../core/utils/debounce';
import { getQueryParam, syncQueryParams } from '../../../core/utils/query-param-state';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { Icon, IconName } from '../../../shared/icon/icon';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';

type TextField = keyof EmailTemplateContent;

/**
 * Configuraciones > Correos: el súper-admin personaliza los correos que manda
 * la plataforma (códigos de registro y de contraseña, documento rechazado,
 * comprobante de compra) — texto, botón y arte de cada uno, por público — y la
 * marca común (logo de la cabecera, pie, correo de soporte). La vista previa
 * la arma el backend con el MISMO HTML que se envía, en claro u oscuro y en
 * ancho de PC o de celular, antes de guardar.
 */
@Component({
  selector: 'app-correos',
  standalone: true,
  imports: [FormsModule, Icon, Skeleton, ToggleSwitch],
  templateUrl: './correos.html',
  styleUrl: './correos.scss',
})
export class Correos implements OnInit, OnDestroy {
  private readonly service = inject(EmailTemplatesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly audiences = EMAIL_AUDIENCES;
  readonly audienceLabels = EMAIL_AUDIENCE_LABELS;
  readonly blockLabels = EMAIL_BLOCK_LABELS;

  readonly isLoading = signal(true);
  readonly sendingEnabled = signal(true);
  readonly templates = signal<EmailTemplate[]>([]);
  readonly settings = signal<EmailSettings | null>(null);
  readonly activeAudience = signal<EmailAudience>('cliente');

  readonly visibleTemplates = computed(() => this.templates().filter((t) => t.audience === this.activeAudience()));

  // ---- Marca ----
  readonly brandFooter = signal('');
  readonly brandSupport = signal('');
  readonly brandSaving = signal(false);
  readonly logoUploading = signal(false);

  // ---- Editor ----
  readonly editingKey = signal<string | null>(null);
  readonly draft = signal<EmailTemplateContent | null>(null);
  readonly saving = signal(false);
  readonly sendingTest = signal(false);
  readonly bannerUploading = signal(false);
  readonly previewDark = signal(false);
  readonly previewMobile = signal(false);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly previewSubject = signal('');
  readonly previewLoading = signal(false);
  readonly previewError = signal<string | null>(null);

  readonly editing = computed(() => this.templates().find((t) => t.key === this.editingKey()) ?? null);

  /** Hay cambios sin guardar respecto de lo que está vigente. */
  readonly isDirty = computed(() => {
    const t = this.editing();
    const d = this.draft();
    if (!t || !d) return false;
    return (Object.keys(d) as TextField[]).some((f) => d[f] !== t.content[f]);
  });

  private previewSeq = 0;
  private readonly refreshPreviewDebounced = debounce(() => void this.refreshPreview(), 450);

  async ngOnInit(): Promise<void> {
    const fromUrl = getQueryParam(this.route, 'publico') as EmailAudience | null;
    if (fromUrl && this.audiences.includes(fromUrl)) this.activeAudience.set(fromUrl);
    await this.reload();
    const keyFromUrl = getQueryParam(this.route, 'plantilla');
    if (keyFromUrl && this.templates().some((t) => t.key === keyFromUrl)) this.openEditor(keyFromUrl);
  }

  ngOnDestroy(): void {
    this.refreshPreviewDebounced.cancel();
  }

  private async reload(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [{ templates, sendingEnabled }, settings] = await Promise.all([
        this.service.list(),
        this.service.getSettings(),
      ]);
      this.templates.set(templates);
      this.sendingEnabled.set(sendingEnabled);
      this.applySettings(settings);
    } catch {
      this.toast.error('No se pudieron cargar los correos');
    } finally {
      this.isLoading.set(false);
    }
  }

  setAudience(audience: EmailAudience): void {
    if (this.activeAudience() === audience) return;
    this.activeAudience.set(audience);
    syncQueryParams(this.router, this.route, { publico: audience === 'cliente' ? null : audience });
  }

  countFor(audience: EmailAudience): number {
    return this.templates().filter((t) => t.audience === audience).length;
  }

  // ---------------------------------------------------------------- Marca

  private applySettings(settings: EmailSettings): void {
    this.settings.set(settings);
    this.brandFooter.set(settings.footerText ?? '');
    this.brandSupport.set(settings.supportEmail ?? '');
  }

  async saveBrand(): Promise<void> {
    this.brandSaving.set(true);
    try {
      this.applySettings(
        await this.service.updateSettings({ footerText: this.brandFooter(), supportEmail: this.brandSupport() }),
      );
      this.toast.success('Marca de los correos actualizada');
      this.refreshPreviewDebounced();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar');
    } finally {
      this.brandSaving.set(false);
    }
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoUploading.set(true);
    try {
      this.applySettings(await this.service.uploadLogo(file));
      this.toast.success('Logo actualizado');
      this.refreshPreviewDebounced();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo subir el logo');
    } finally {
      this.logoUploading.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Volver al logo original',
      message: 'Los correos usarán de nuevo el logo amarillo de Tellego. ¿Continuar?',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    this.logoUploading.set(true);
    try {
      this.applySettings(await this.service.removeLogo());
      this.refreshPreviewDebounced();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo restaurar el logo');
    } finally {
      this.logoUploading.set(false);
    }
  }

  // ---------------------------------------------------------------- Editor

  async openEditor(key: string): Promise<void> {
    if (this.editingKey() && this.editingKey() !== key && this.isDirty()) {
      const ok = await this.confirm.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar en el correo que estás editando. ¿Descartarlos?',
        confirmLabel: 'Descartar',
        variant: 'danger',
      });
      if (!ok) return;
    }
    const template = this.templates().find((t) => t.key === key);
    if (!template) return;
    this.editingKey.set(key);
    this.draft.set({ ...template.content });
    this.previewHtml.set(null);
    syncQueryParams(this.router, this.route, { plantilla: key });
    void this.refreshPreview();
    setTimeout(() => document.getElementById('email-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async closeEditor(): Promise<void> {
    if (this.isDirty()) {
      const ok = await this.confirm.confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar. ¿Cerrar el editor de todos modos?',
        confirmLabel: 'Descartar',
        variant: 'danger',
      });
      if (!ok) return;
    }
    this.refreshPreviewDebounced.cancel();
    this.editingKey.set(null);
    this.draft.set(null);
    syncQueryParams(this.router, this.route, { plantilla: null });
  }

  patchDraft(field: TextField, value: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, [field]: value });
    this.refreshPreviewDebounced();
  }

  blockIcon(block: EmailBlock): IconName {
    const icons: Record<EmailBlock, IconName> = {
      code: 'mail',
      receipt: 'receipt',
      reason: 'flag',
      credentials: 'user',
      payout: 'credit-card',
      none: 'send',
    };
    return icons[block];
  }

  token(name: string): string {
    return `{{${name}}}`;
  }

  /** Inserta {{variable}} al final del campo de texto principal (o lo copia, si el navegador lo permite). */
  async copyVariable(name: string): Promise<void> {
    const token = `{{${name}}}`;
    try {
      await navigator.clipboard.writeText(token);
      this.toast.success(`${token} copiado — pégalo donde quieras`);
    } catch {
      this.patchDraft('body', `${this.draft()?.body ?? ''} ${token}`);
    }
  }

  setPreviewDark(dark: boolean): void {
    if (this.previewDark() === dark) return;
    this.previewDark.set(dark);
    void this.refreshPreview();
  }

  private async refreshPreview(): Promise<void> {
    const key = this.editingKey();
    const draft = this.draft();
    if (!key || !draft) return;
    const seq = ++this.previewSeq;
    this.previewLoading.set(true);
    try {
      const result = await this.service.preview(key, draft, this.previewDark());
      if (seq !== this.previewSeq) return; // llegó una respuesta vieja después de una más nueva
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(result.html));
      this.previewSubject.set(result.subject);
      this.previewError.set(null);
    } catch (err: any) {
      if (seq !== this.previewSeq) return;
      this.previewError.set(err?.error?.message ?? 'No se pudo generar la vista previa');
    } finally {
      if (seq === this.previewSeq) this.previewLoading.set(false);
    }
  }

  private replaceTemplate(updated: EmailTemplate): void {
    this.templates.update((list) => list.map((t) => (t.key === updated.key ? updated : t)));
  }

  async save(): Promise<void> {
    const key = this.editingKey();
    const draft = this.draft();
    if (!key || !draft) return;
    if (!draft.subject.trim() || !draft.heading.trim()) {
      this.toast.error('El asunto y el título no pueden quedar vacíos');
      return;
    }
    this.saving.set(true);
    try {
      const updated = await this.service.update(key, draft);
      this.replaceTemplate(updated);
      this.draft.set({ ...updated.content });
      this.toast.success('Correo guardado — los próximos envíos ya salen así');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleEnabled(template: EmailTemplate, enabled: boolean): Promise<void> {
    if (!enabled) {
      const ok = await this.confirm.confirm({
        title: `Desactivar "${template.name}"`,
        message: 'Mientras esté desactivado, este correo no se enviará a nadie. ¿Continuar?',
        confirmLabel: 'Desactivar',
        variant: 'danger',
      });
      if (!ok) return;
    }
    try {
      this.replaceTemplate(await this.service.update(template.key, { isEnabled: enabled }));
      this.toast.success(enabled ? 'Correo activado' : 'Correo desactivado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo cambiar el estado');
    }
  }

  async resetTemplate(): Promise<void> {
    const template = this.editing();
    if (!template) return;
    const ok = await this.confirm.confirm({
      title: 'Restaurar correo original',
      message: 'Se descartan el texto personalizado y el arte de este correo, y vuelve a la versión original. ¿Continuar?',
      confirmLabel: 'Restaurar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const updated = await this.service.reset(template.key);
      this.replaceTemplate(updated);
      this.draft.set({ ...updated.content });
      void this.refreshPreview();
      this.toast.success('Correo restaurado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo restaurar');
    }
  }

  async sendTest(): Promise<void> {
    const key = this.editingKey();
    if (!key) return;
    if (this.isDirty()) {
      this.toast.error('Guarda los cambios primero: la prueba se envía con la versión guardada');
      return;
    }
    this.sendingTest.set(true);
    try {
      this.toast.success(await this.service.sendTest(key));
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo enviar la prueba');
    } finally {
      this.sendingTest.set(false);
    }
  }

  async onBannerSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const key = this.editingKey();
    if (!file || !key) return;
    this.bannerUploading.set(true);
    try {
      this.replaceTemplate(await this.service.uploadBanner(key, file));
      void this.refreshPreview();
      this.toast.success('Arte actualizado');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo subir la imagen');
    } finally {
      this.bannerUploading.set(false);
    }
  }

  async removeBanner(): Promise<void> {
    const key = this.editingKey();
    if (!key) return;
    this.bannerUploading.set(true);
    try {
      this.replaceTemplate(await this.service.removeBanner(key));
      void this.refreshPreview();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo quitar la imagen');
    } finally {
      this.bannerUploading.set(false);
    }
  }
}
