import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { LegalDocumentsService } from '../../../core/services/legal-documents.service';
import {
  LEGAL_AUDIENCES,
  LEGAL_AUDIENCE_HINT,
  LEGAL_AUDIENCE_LABELS,
  LEGAL_DOC_LABELS,
  LegalAcceptanceSummary,
  LegalAudience,
  LegalDocument,
  LegalDocumentType,
} from '../../../core/models/legal.model';
import { getQueryParam, syncQueryParams } from '../../../core/utils/query-param-state';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { Icon } from '../../../shared/icon/icon';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

interface DocEditor {
  open: boolean;
  content: string;
  effectiveDate: string;
  saving: boolean;
}

/** Clave estable por (público, tipo) para indexar editores/historial abierto. */
type DocKey = `${LegalAudience}:${LegalDocumentType}`;
const docKey = (audience: LegalAudience, type: LegalDocumentType): DocKey => `${audience}:${type}`;

function emptyEditor(): DocEditor {
  return { open: false, content: '', effectiveDate: '', saving: false };
}

/**
 * Configuraciones > Términos y privacidad: el súper-admin redacta y publica los
 * Términos y Condiciones y la Política de Privacidad de la plataforma, POR
 * PÚBLICO — Clientes, Repartidores y Negocios tienen textos y versiones
 * independientes. Cada flujo de registro (delivery-store, delivery-repartidor,
 * delivery-pedidos-admin) muestra y exige los de su público. Publicar una
 * versión nueva no borra la anterior: queda el historial de qué versión aceptó
 * cada cuenta.
 */
@Component({
  selector: 'app-terminos-privacidad',
  standalone: true,
  imports: [FormsModule, Icon, Skeleton],
  templateUrl: './terminos-privacidad.html',
  styleUrl: './terminos-privacidad.scss',
})
export class TerminosPrivacidad implements OnInit {
  private readonly service = inject(LegalDocumentsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly docLabels = LEGAL_DOC_LABELS;
  readonly audienceLabels = LEGAL_AUDIENCE_LABELS;
  readonly audienceHint = LEGAL_AUDIENCE_HINT;
  readonly audiences = LEGAL_AUDIENCES;
  readonly docTypes: LegalDocumentType[] = ['terms', 'privacy'];
  readonly docKey = docKey;

  readonly isLoading = signal(true);
  readonly documents = signal<LegalDocument[]>([]);
  readonly summary = signal<LegalAcceptanceSummary[]>([]);

  /** Público activo — se refleja en la URL (?publico=) para que un F5 no reinicie la vista. */
  readonly activeAudience = signal<LegalAudience>('cliente');
  readonly openHistory = signal<Set<DocKey>>(new Set());
  readonly openPreview = signal<Set<DocKey>>(new Set());
  readonly editors = signal<Record<DocKey, DocEditor>>({} as Record<DocKey, DocEditor>);

  /** { 'cliente:terms': { current, history }, … } para todos los pares. */
  readonly byKey = computed(() => {
    const map = {} as Record<DocKey, { current: LegalDocument | null; history: LegalDocument[] }>;
    for (const audience of this.audiences) {
      for (const type of this.docTypes) {
        const versions = this.documents()
          .filter((d) => d.audience === audience && d.docType === type)
          .sort((a, b) => b.version - a.version);
        map[docKey(audience, type)] = {
          current: versions.find((v) => v.isCurrent) ?? null,
          history: versions,
        };
      }
    }
    return map;
  });

  /** Cuántos de los 2 documentos del público activo ya están publicados. */
  readonly publishedCount = computed(() => {
    const a = this.activeAudience();
    return this.docTypes.filter((t) => this.byKey()[docKey(a, t)].current).length;
  });

  async ngOnInit(): Promise<void> {
    const fromUrl = getQueryParam(this.route, 'publico') as LegalAudience | null;
    if (fromUrl && this.audiences.includes(fromUrl)) this.activeAudience.set(fromUrl);
    await this.reload();
  }

  setAudience(audience: LegalAudience): void {
    if (this.activeAudience() === audience) return;
    this.activeAudience.set(audience);
    syncQueryParams(this.router, this.route, { publico: audience === 'cliente' ? null : audience });
  }

  private async reload(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [documents, summary] = await Promise.all([this.service.list(), this.service.acceptancesSummary()]);
      this.documents.set(documents);
      this.summary.set(summary);
    } catch {
      this.toast.error('No se pudieron cargar los documentos legales');
    } finally {
      this.isLoading.set(false);
    }
  }

  summaryFor(audience: LegalAudience, type: LegalDocumentType): LegalAcceptanceSummary | undefined {
    return this.summary().find((s) => s.audience === audience && s.docType === type);
  }

  editorFor(key: DocKey): DocEditor {
    return this.editors()[key] ?? emptyEditor();
  }

  isHistoryOpen(key: DocKey): boolean {
    return this.openHistory().has(key);
  }

  isPreviewOpen(key: DocKey): boolean {
    return this.openPreview().has(key);
  }

  toggleHistory(key: DocKey): void {
    this.openHistory.update((set) => toggled(set, key));
  }

  togglePreview(key: DocKey): void {
    this.openPreview.update((set) => toggled(set, key));
  }

  startEdit(audience: LegalAudience, type: LegalDocumentType): void {
    const key = docKey(audience, type);
    const current = this.byKey()[key].current;
    this.editors.update((state) => ({
      ...state,
      [key]: {
        open: true,
        content: current?.content ?? '',
        effectiveDate: new Date().toISOString().slice(0, 10),
        saving: false,
      },
    }));
  }

  cancelEdit(key: DocKey): void {
    this.editors.update((state) => ({ ...state, [key]: { ...this.editorFor(key), open: false } }));
  }

  patchEditor(key: DocKey, patch: Partial<DocEditor>): void {
    this.editors.update((state) => ({ ...state, [key]: { ...this.editorFor(key), ...patch } }));
  }

  async publish(audience: LegalAudience, type: LegalDocumentType): Promise<void> {
    const key = docKey(audience, type);
    const editor = this.editorFor(key);
    if (!editor.content.trim()) {
      this.toast.error('El contenido no puede quedar vacío');
      return;
    }

    const current = this.byKey()[key].current;
    const nextVersion = (current?.version ?? 0) + 1;
    const label = `${this.docLabels[type]} · ${this.audienceLabels[audience]}`;
    const ok = await this.confirm.confirm({
      title: `Publicar ${label} v${nextVersion}`,
      message:
        `Esta versión pasa a ser la vigente para ${this.audienceHint[audience]} y se le mostrará a partir de ` +
        'ahora a quien se registre. La versión anterior se conserva para el historial. ¿Continuar?',
      confirmLabel: 'Publicar',
    });
    if (!ok) return;

    this.patchEditor(key, { saving: true });
    try {
      await this.service.publish({
        docType: type,
        audience,
        content: editor.content,
        effectiveDate: editor.effectiveDate || undefined,
      });
      this.toast.success(`${label} v${nextVersion} publicada`);
      this.cancelEdit(key);
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo publicar la versión');
    } finally {
      this.patchEditor(key, { saving: false });
    }
  }
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}
