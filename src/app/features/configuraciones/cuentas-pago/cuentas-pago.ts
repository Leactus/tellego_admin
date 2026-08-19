import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../core/config/environment';
import { PlatformPaymentsService, PlatformBankAccountInput } from '../../../core/services/platform-payments.service';
import {
  PLATFORM_BANK_NAMES,
  PlatformApayCredencial,
  PlatformBankAccount,
  PlatformBankName,
} from '../../../core/models/company.model';
import { Icon } from '../../../shared/icon/icon';
import { Select, SelectOption } from '../../../shared/select/select';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { PendingActions } from '../../../shared/pending-actions';

const BANK_OPTIONS: SelectOption<PlatformBankName>[] = PLATFORM_BANK_NAMES.map((name) => ({ value: name, label: name }));
const ACCOUNT_TYPE_OPTIONS: SelectOption<'checking' | 'savings'>[] = [
  { value: 'checking', label: 'Cuenta corriente' },
  { value: 'savings', label: 'Cuenta de ahorro' },
];

/**
 * Configuraciones > Cuentas de pago: cuentas bancarias + credencial APay de la EMPRESA MADRE — lo
 * que los negocios ven en /negocio/pagos como formas de pago hacia la plataforma (transferencia y
 * tarjeta). No confundir con negocio-detalle.ts (esa es la cuenta APay de CADA negocio, para cobrar
 * a SUS clientes, no a la plataforma).
 */
@Component({
  selector: 'app-cuentas-pago',
  standalone: true,
  imports: [FormsModule, Icon, Select, Skeleton],
  templateUrl: './cuentas-pago.html',
  styleUrl: './cuentas-pago.scss',
})
export class CuentasPago implements OnInit {
  private readonly service = inject(PlatformPaymentsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly bankOptions = BANK_OPTIONS;
  readonly accountTypeOptions = ACCOUNT_TYPE_OPTIONS;
  /** Fijo por deploy (environment.apiUrl) — se pega en el campo "Endpoint" del perfil de APay de la
   * cuenta de la plataforma. Es EL MISMO endpoint que usan las cuentas APay de cada negocio (ver
   * apay.controller.ts#webhook: distingue un pago de pedido de uno de plataforma por dónde encuentra el link). */
  readonly apayWebhookUrl = `${environment.apiUrl}/apay/webhook`;

  readonly isLoading = signal(true);
  readonly accounts = signal<PlatformBankAccount[]>([]);
  /** Evita doble-click en guardar/activar — ver shared/pending-actions.ts. */
  readonly busy = new PendingActions();

  readonly accountModalOpen = signal(false);
  editingAccount: PlatformBankAccount | null = null;
  accountForm: PlatformBankAccountInput = {
    bankName: PLATFORM_BANK_NAMES[0],
    accountType: 'checking',
    accountNumber: '',
    accountHolder: '',
  };
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly accountSubmitted = signal(false);
  readonly isSavingAccount = signal(false);

  readonly apayCredencial = signal<PlatformApayCredencial | null>(null);
  readonly revealedApay = signal<{ apayToken: string; apayBusinessId: string | null } | null>(null);
  readonly isRevealingApay = signal(false);
  readonly isSavingApay = signal(false);
  apayForm = { apayToken: '', apayBusinessId: '' };
  readonly apayModalOpen = signal(false);
  /** true recién después de un intento de "Guardar" fallido — antes de eso no se marca nada en rojo. */
  readonly apaySubmitted = signal(false);

  isApayTokenInvalid(): boolean {
    return this.apaySubmitted() && !this.apayForm.apayToken.trim();
  }

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [accounts, apayCredencial] = await Promise.all([
        this.service.listBankAccounts(),
        this.service.getApayCredencial(),
      ]);
      this.accounts.set(accounts);
      this.apayCredencial.set(apayCredencial);
    } catch {
      this.toast.error('No se pudieron cargar las cuentas de pago');
    } finally {
      this.isLoading.set(false);
    }
  }

  accountTypeLabel(type: 'checking' | 'savings'): string {
    return type === 'checking' ? 'Corriente' : 'Ahorro';
  }

  isAccountNumberInvalid(): boolean {
    return this.accountSubmitted() && !this.accountForm.accountNumber.trim();
  }

  isAccountHolderInvalid(): boolean {
    return this.accountSubmitted() && !this.accountForm.accountHolder.trim();
  }

  openNewAccount(): void {
    this.editingAccount = null;
    this.accountForm = { bankName: PLATFORM_BANK_NAMES[0], accountType: 'checking', accountNumber: '', accountHolder: '' };
    this.accountSubmitted.set(false);
    this.accountModalOpen.set(true);
  }

  openEditAccount(account: PlatformBankAccount): void {
    this.editingAccount = account;
    this.accountForm = {
      bankName: account.bankName,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolder,
    };
    this.accountSubmitted.set(false);
    this.accountModalOpen.set(true);
  }

  closeAccountModal(): void {
    this.accountModalOpen.set(false);
  }

  async saveAccount(): Promise<void> {
    this.accountSubmitted.set(true);
    if (!this.accountForm.accountNumber.trim() || !this.accountForm.accountHolder.trim()) return;

    this.isSavingAccount.set(true);
    try {
      if (this.editingAccount) {
        const updated = await this.service.updateBankAccount(this.editingAccount.id, this.accountForm);
        this.accounts.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
        this.toast.success('Cuenta actualizada');
      } else {
        const created = await this.service.createBankAccount(this.accountForm);
        this.accounts.update((list) => [...list, created]);
        this.toast.success('Cuenta creada');
      }
      this.closeAccountModal();
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la cuenta');
    } finally {
      this.isSavingAccount.set(false);
    }
  }

  async toggleAccountStatus(account: PlatformBankAccount): Promise<void> {
    const nextStatus = account.status === 'active' ? 'inactive' : 'active';
    await this.busy.run(`toggle-account-${account.id}`, async () => {
      try {
        const updated = await this.service.updateBankAccount(account.id, { status: nextStatus });
        this.accounts.update((list) => list.map((a) => (a.id === updated.id ? updated : a)));
        this.toast.success(nextStatus === 'active' ? 'Cuenta activada' : 'Cuenta desactivada');
      } catch {
        this.toast.error('No se pudo actualizar la cuenta');
      }
    });
  }

  openApayModal(): void {
    this.apayForm = { apayToken: '', apayBusinessId: '' };
    this.apaySubmitted.set(false);
    this.apayModalOpen.set(true);
  }

  closeApayModal(): void {
    this.apayModalOpen.set(false);
  }

  async saveApay(): Promise<void> {
    this.apaySubmitted.set(true);
    const apayToken = this.apayForm.apayToken.trim();
    if (!apayToken) return;

    this.isSavingApay.set(true);
    try {
      const credencial = await this.service.saveApayCredencial({
        apayToken,
        apayBusinessId: this.apayForm.apayBusinessId.trim() || undefined,
      });
      this.apayCredencial.set(credencial);
      this.revealedApay.set(null);
      this.closeApayModal();
      this.toast.success('Credencial APay de la plataforma guardada');
    } catch (err: any) {
      this.toast.error(err?.error?.message ?? 'No se pudo guardar la credencial APay');
    } finally {
      this.isSavingApay.set(false);
    }
  }

  async toggleRevealApay(): Promise<void> {
    if (this.revealedApay()) {
      this.revealedApay.set(null);
      return;
    }

    this.isRevealingApay.set(true);
    try {
      const data = await this.service.revealApayCredencial();
      this.revealedApay.set(data);
    } catch {
      this.toast.error('No se pudo revelar la credencial APay');
    } finally {
      this.isRevealingApay.set(false);
    }
  }

  async copyApayWebhookUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.apayWebhookUrl);
      this.toast.success('URL copiada');
    } catch {
      this.toast.error('No se pudo copiar la URL');
    }
  }

  async removeApay(): Promise<void> {
    const credencial = this.apayCredencial();
    if (!credencial) return;

    const ok = await this.confirm.confirm({
      title: 'Quitar credencial APay',
      message: 'La plataforma dejará de poder cobrar la cuota/comisión con tarjeta hasta que se cargue un token nuevo. ¿Confirmas?',
      confirmLabel: 'Quitar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await this.service.deleteApayCredencial(credencial.id);
      this.apayCredencial.set(null);
      this.revealedApay.set(null);
      this.toast.success('Credencial APay desactivada');
    } catch {
      this.toast.error('No se pudo desactivar la credencial APay');
    }
  }
}
