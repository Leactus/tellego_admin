import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LegalDocumentsService } from '../../../core/services/legal-documents.service';
import {
  LEGAL_DOC_LABELS,
  LegalAcceptanceSummary,
  LegalDocument,
  LegalDocumentType,
} from '../../../core/models/legal.model';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ToastService } from '../../../shared/toast/toast.service';

interface DocEditor {
  open: boolean;
  content: string;
  effectiveDate: string;
  saving: boolean;
}

/**
 * Configuraciones > Términos y privacidad: el súper-admin redacta y publica
 * los Términos y Condiciones y la Política de Privacidad de la plataforma.
 * Son GLOBALES (no hay un texto por negocio): todo registro nuevo —cliente,
 * negocio o repartidor— tiene que aceptarlos. Publicar una versión nueva no
 * borra la anterior; queda el historial de qué versión aceptó cada cuenta.
 */
@Component({
  selector: 'app-terminos-privacidad',
  standalone: true,
  imports: [FormsModule, Skeleton],
  templateUrl: './terminos-privacidad.html',
  styleUrl: './terminos-privacidad.scss',
})
export class TerminosPrivacidad implements OnInit {
  private readonly service = inject(LegalDocumentsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly labels = LEGAL_DOC_LABELS;
  readonly docTypes: LegalDocumentType[] = ['terms', 'privacy'];

  readonly isLoading = signal(true);
  readonly documents = signal<LegalDocument[]>([]);
  readonly summary = signal<LegalAcceptanceSummary[]>([]);
  readonly historyOpen = signal<Record<LegalDocumentType, boolean>>({ terms: false, privacy: false });

  readonly editors = signal<Record<LegalDocumentType, DocEditor>>({
    terms: { open: false, content: '', effectiveDate: '', saving: false },
    privacy: { open: false, content: '', effectiveDate: '', saving: false },
  });

  readonly byType = computed(() => {
    const map = {} as Record<LegalDocumentType, { current: LegalDocument | null; history: LegalDocument[] }>;
    for (const type of this.docTypes) {
      const versions = this.documents()
        .filter((d) => d.docType === type)
        .sort((a, b) => b.version - a.version);
      map[type] = { current: versions.find((v) => v.isCurrent) ?? null, history: versions };
    }
    return map;
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
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

  summaryFor(type: LegalDocumentType): LegalAcceptanceSummary | undefined {
    return this.summary().find((s) => s.docType === type);
  }

  toggleHistory(type: LegalDocumentType): void {
    this.historyOpen.update((state) => ({ ...state, [type]: !state[type] }));
  }

  startEdit(type: LegalDocumentType): void {
    const current = this.byType()[type].current;
    this.editors.update((state) => ({
      ...state,
      [type]: {
        open: true,
        content: current?.content ?? '',
        effectiveDate: new Date().toISOString().slice(0, 10),
        saving: false,
      },
    }));
  }

  cancelEdit(type: LegalDocumentType): void {
    this.editors.update((state) => ({ ...state, [type]: { ...state[type], open: false } }));
  }

  patchEditor(type: LegalDocumentType, patch: Partial<DocEditor>): void {
    this.editors.update((state) => ({ ...state, [type]: { ...state[type], ...patch } }));
  }

  async publish(type: LegalDocumentType): Promise<void> {
    const editor = this.editors()[type];
    if (!editor.content.trim()) {
      this.toast.error('El contenido no puede quedar vacío');
      return;
    }

    const current = this.byType()[type].current;
    const nextVersion = (current?.version ?? 0) + 1;
    const ok = await this.confirm.confirm({
      title: `Publicar ${this.labels[type]} v${nextVersion}`,
      message:
        'Esta versión pasa a ser la vigente y se le mostrará a partir de ahora a quien se registre. ' +
        'La versión anterior se conserva para el historial. ¿Continuar?',
      confirmLabel: 'Publicar',
    });
    if (!ok) return;

    this.patchEditor(type, { saving: true });
    try {
      await this.service.publish({
        docType: type,
        content: editor.content,
        effectiveDate: editor.effectiveDate || undefined,
      });
      this.toast.success(`${this.labels[type]} v${nextVersion} publicada`);
      this.cancelEdit(type);
      await this.reload();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo publicar la versión');
    } finally {
      this.patchEditor(type, { saving: false });
    }
  }
}
