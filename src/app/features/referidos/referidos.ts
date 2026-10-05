import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ReferralsService } from '../../core/services/referrals.service';
import {
  Referral,
  ReferralAudience,
  ReferralProgram,
  ReferralProgramPayload,
  ReferralStatus,
  ReferralSummary,
} from '../../core/models/referral.model';
import { DEFAULT_PAGE_SIZE } from '../../core/models/pagination.model';
import { getQueryParam, getQueryParamNumber, syncQueryParams } from '../../core/utils/query-param-state';
import { formatShortDate, formatShortDateTime } from '../../core/utils/format-date';
import { debounce } from '../../core/utils/debounce';
import { Icon } from '../../shared/icon/icon';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { Pager } from '../../shared/pager/pager';
import { Select, SelectOption } from '../../shared/select/select';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToggleSwitch } from '../../shared/toggle-switch/toggle-switch';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { ToastService } from '../../shared/toast/toast.service';

type StatusTab = ReferralStatus | 'all';

const STATUS_LABELS: Record<ReferralStatus, string> = {
  in_progress: 'En curso',
  completed: 'Por pagar',
  paid: 'Pagado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

const AUDIENCE_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'Todos (propios y freelance)' },
  { value: 'freelance', label: 'Solo freelance' },
  { value: 'propio', label: 'Solo propios (de un negocio)' },
];

interface ProgramForm {
  name: string;
  requiredDeliveries: number | null;
  referrerRewardAmount: number | null;
  referredRewardAmount: number | null;
  rewardDescription: string;
  daysToComplete: number | null;
  audience: ReferralAudience;
  maxReferralsPerDriver: number | null;
  isActive: boolean;
}

function emptyForm(): ProgramForm {
  return {
    name: 'Invita y gana',
    requiredDeliveries: 20,
    referrerRewardAmount: 10,
    referredRewardAmount: 0,
    rewardDescription: '',
    daysToComplete: 30,
    audience: 'all',
    maxReferralsPerDriver: null,
    isActive: true,
  };
}

/**
 * Referidos de repartidores ("Invita y gana"): cada repartidor (propio o freelance) tiene un código
 * de asociado; un repartidor nuevo lo escribe al registrarse o en su app. Aquí se definen las
 * reglas (cuántas entregas debe completar el recomendado, el premio para cada uno, el plazo y para
 * quién aplica), se sigue cuántas entregas le faltan a cada recomendado y se registra el pago del
 * premio. Cada referido guarda las reglas con las que empezó: editar el programa no lo cambia.
 */
@Component({
  selector: 'app-referidos',
  standalone: true,
  imports: [FormsModule, Icon, EmptyState, Pager, Select, Skeleton, ToggleSwitch, UserAvatar],
  templateUrl: './referidos.html',
  styleUrl: './referidos.scss',
})
export class Referidos implements OnInit {
  readonly formatShortDate = formatShortDate;
  readonly formatShortDateTime = formatShortDateTime;
  readonly audienceOptions = AUDIENCE_OPTIONS;
  readonly statusTabs: StatusTab[] = ['all', 'in_progress', 'completed', 'paid', 'expired', 'cancelled'];

  private readonly referrals = inject(ReferralsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // --- Programas ---
  readonly programsLoading = signal(true);
  readonly programs = signal<ReferralProgram[]>([]);
  readonly activeProgram = computed(() => this.programs().find((p) => p.isActive) ?? null);
  readonly togglingId = signal<number | null>(null);

  // --- Modal programa ---
  readonly programModal = signal<{ program: ReferralProgram | null } | null>(null);
  readonly savingProgram = signal(false);
  form: ProgramForm = emptyForm();

  // --- Referidos ---
  readonly listLoading = signal(true);
  readonly rows = signal<Referral[]>([]);
  readonly summary = signal<ReferralSummary | null>(null);
  readonly status = signal<StatusTab>('all');
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly totalPages = signal(1);
  search = '';
  readonly allCount = computed(() => {
    const s = this.summary();
    return s ? Object.values(s).reduce((acc, v) => acc + v.count, 0) : 0;
  });

  // --- Modal detalle / pago / cancelación ---
  readonly detail = signal<Referral | null>(null);
  readonly detailLoading = signal(false);
  readonly acting = signal(false);
  payForm = { reference: '', note: '' };
  readonly cancelMode = signal(false);
  cancelReason = '';

  private readonly searchDebounced = debounce(() => {
    this.page.set(1);
    this.syncUrl();
    void this.loadList();
  }, 350);

  async ngOnInit(): Promise<void> {
    const qpStatus = getQueryParam(this.route, 'estado') as StatusTab | null;
    if (qpStatus && (this.statusTabs as string[]).includes(qpStatus)) this.status.set(qpStatus);
    this.search = getQueryParam(this.route, 'q') ?? '';
    this.page.set(getQueryParamNumber(this.route, 'page', 1));
    await Promise.all([this.loadPrograms(), this.loadList()]);
  }

  private syncUrl(): void {
    syncQueryParams(this.router, this.route, {
      estado: this.status() === 'all' ? null : this.status(),
      q: this.search.trim() || null,
      page: this.page() > 1 ? this.page() : null,
    });
  }

  statusLabel(s: StatusTab): string {
    return s === 'all' ? 'Todos' : STATUS_LABELS[s];
  }

  statusCount(s: StatusTab): number {
    if (s === 'all') return this.allCount();
    return this.summary()?.[s]?.count ?? 0;
  }

  audienceLabel(a: ReferralAudience): string {
    return a === 'all' ? 'Propios y freelance' : a === 'freelance' ? 'Solo freelance' : 'Solo propios';
  }

  money(value: number | string | null | undefined): string {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }

  /** "$10.00 + Mochila" / "Mochila" / "—" */
  prizeText(amount: number, description: string | null): string {
    const parts: string[] = [];
    if (amount > 0) parts.push(this.money(amount));
    if (description) parts.push(description);
    return parts.join(' + ') || '—';
  }

  /** Los dos que pueden ganar: quien recomendó y el recomendado, con su premio y cuenta bancaria. */
  beneficiaries(r: Referral) {
    return [
      {
        label: 'Recomendó',
        driver: r.referrer,
        prize: this.prizeText(r.referrerRewardAmount, r.rewardDescription),
        amount: r.referrerRewardAmount,
      },
      {
        label: 'Recomendado',
        driver: r.referred,
        prize: r.referredRewardAmount > 0 ? this.money(r.referredRewardAmount) : '—',
        amount: r.referredRewardAmount,
      },
    ];
  }

  progressPct(r: Referral): number {
    return r.requiredDeliveries > 0 ? Math.min(100, Math.round((r.deliveredCount / r.requiredDeliveries) * 100)) : 0;
  }

  accountTypeLabel(type: 'checking' | 'savings'): string {
    return type === 'checking' ? 'Corriente' : 'Ahorro';
  }

  driverTypeLabel(type: 'propio' | 'freelance'): string {
    return type === 'propio' ? 'Propio' : 'Freelance';
  }

  // --- Programas ---

  async loadPrograms(): Promise<void> {
    try {
      this.programs.set(await this.referrals.listPrograms());
    } catch {
      this.toast.error('No se pudieron cargar los programas de referidos');
    } finally {
      this.programsLoading.set(false);
    }
  }

  openProgram(program: ReferralProgram | null): void {
    this.form = program
      ? {
          name: program.name,
          requiredDeliveries: program.requiredDeliveries,
          referrerRewardAmount: program.referrerRewardAmount,
          referredRewardAmount: program.referredRewardAmount,
          rewardDescription: program.rewardDescription ?? '',
          daysToComplete: program.daysToComplete,
          audience: program.audience,
          maxReferralsPerDriver: program.maxReferralsPerDriver,
          isActive: program.isActive,
        }
      : emptyForm();
    this.programModal.set({ program });
  }

  closeProgram(): void {
    if (this.savingProgram()) return;
    this.programModal.set(null);
  }

  private toPayload(): ReferralProgramPayload | null {
    const f = this.form;
    if (f.name.trim().length < 2) {
      this.toast.error('Ponle un nombre al programa');
      return null;
    }
    if (!f.requiredDeliveries || f.requiredDeliveries < 1) {
      this.toast.error('Indica cuántas entregas debe completar el recomendado');
      return null;
    }
    const referrer = Number(f.referrerRewardAmount ?? 0);
    const referred = Number(f.referredRewardAmount ?? 0);
    if (referrer <= 0 && referred <= 0 && !f.rewardDescription.trim()) {
      this.toast.error('Define un premio: un bono en dinero o una descripción del premio');
      return null;
    }
    return {
      name: f.name.trim(),
      requiredDeliveries: Number(f.requiredDeliveries),
      referrerRewardAmount: referrer,
      referredRewardAmount: referred,
      rewardDescription: f.rewardDescription.trim() || null,
      daysToComplete: f.daysToComplete ? Number(f.daysToComplete) : null,
      audience: f.audience,
      maxReferralsPerDriver: f.maxReferralsPerDriver ? Number(f.maxReferralsPerDriver) : null,
      isActive: f.isActive,
    };
  }

  async saveProgram(): Promise<void> {
    const modal = this.programModal();
    const payload = this.toPayload();
    if (!modal || !payload || this.savingProgram()) return;
    this.savingProgram.set(true);
    try {
      if (modal.program) await this.referrals.updateProgram(modal.program.id, payload);
      else await this.referrals.createProgram(payload);
      this.toast.success(modal.program ? 'Programa actualizado' : 'Programa creado');
      this.programModal.set(null);
      await this.loadPrograms();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo guardar el programa'));
    } finally {
      this.savingProgram.set(false);
    }
  }

  async toggleActive(program: ReferralProgram, isActive: boolean): Promise<void> {
    this.togglingId.set(program.id);
    try {
      await this.referrals.updateProgram(program.id, { isActive });
      this.toast.success(isActive ? `"${program.name}" activado` : `"${program.name}" desactivado`);
      await this.loadPrograms();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo cambiar el estado'));
    } finally {
      this.togglingId.set(null);
    }
  }

  // --- Referidos ---

  async loadList(): Promise<void> {
    this.listLoading.set(true);
    try {
      const status = this.status();
      const res = await this.referrals.list({
        page: this.page(),
        pageSize: this.pageSize(),
        status: status === 'all' ? null : status,
        q: this.search.trim() || undefined,
      });
      this.rows.set(res.data);
      this.summary.set(res.summary);
      this.total.set(res.meta.total);
      this.totalPages.set(res.meta.totalPages);
    } catch {
      this.toast.error('No se pudieron cargar los referidos');
    } finally {
      this.listLoading.set(false);
    }
  }

  setStatus(s: StatusTab): void {
    this.status.set(s);
    this.page.set(1);
    this.syncUrl();
    void this.loadList();
  }

  onSearch(): void {
    this.searchDebounced();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.syncUrl();
    void this.loadList();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.syncUrl();
    void this.loadList();
  }

  // --- Detalle ---

  async openDetail(r: Referral): Promise<void> {
    this.detail.set(r);
    this.payForm = { reference: '', note: '' };
    this.cancelMode.set(false);
    this.cancelReason = '';
    this.detailLoading.set(true);
    try {
      this.detail.set(await this.referrals.get(r.id));
    } catch {
      this.toast.error('No se pudo cargar el detalle');
    } finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    if (this.acting()) return;
    this.detail.set(null);
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copiado');
    } catch {
      /* el navegador no dejó copiar — no pasa nada */
    }
  }

  async confirmPay(): Promise<void> {
    const r = this.detail();
    if (!r || this.acting()) return;
    this.acting.set(true);
    try {
      this.detail.set(
        await this.referrals.pay(r.id, {
          reference: this.payForm.reference.trim() || undefined,
          note: this.payForm.note.trim() || undefined,
        }),
      );
      this.toast.success('Pago del premio registrado');
      await this.loadList();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo registrar el pago'));
    } finally {
      this.acting.set(false);
    }
  }

  async confirmCancel(): Promise<void> {
    const r = this.detail();
    if (!r || this.acting()) return;
    if (this.cancelReason.trim().length < 3) {
      this.toast.error('Escribe el motivo de la cancelación');
      return;
    }
    this.acting.set(true);
    try {
      this.detail.set(await this.referrals.cancel(r.id, this.cancelReason.trim()));
      this.cancelMode.set(false);
      this.toast.success('Referido cancelado');
      await this.loadList();
    } catch (err) {
      this.toast.error(this.errorMessage(err, 'No se pudo cancelar'));
    } finally {
      this.acting.set(false);
    }
  }

  private errorMessage(err: unknown, fallback: string): string {
    return (err as { error?: { message?: string } })?.error?.message ?? fallback;
  }
}
