import { PageMeta } from './pagination.model';

export type ReferralAudience = 'all' | 'freelance' | 'propio';
export type ReferralStatus = 'in_progress' | 'completed' | 'paid' | 'expired' | 'cancelled';

/** Reglas de "Invita y gana" (backend: driver_referral_programs). Solo uno activo a la vez. */
export interface ReferralProgram {
  id: number;
  name: string;
  requiredDeliveries: number;
  referrerRewardAmount: number;
  referredRewardAmount: number;
  rewardDescription: string | null;
  daysToComplete: number | null;
  audience: ReferralAudience;
  maxReferralsPerDriver: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  referralCounts?: Partial<Record<ReferralStatus, number>>;
}

export type ReferralProgramPayload = Omit<ReferralProgram, 'id' | 'createdAt' | 'updatedAt' | 'referralCounts'>;

export interface ReferralBankAccount {
  bankName: string;
  accountType: 'checking' | 'savings';
  accountNumber: string;
  accountHolder: string;
  holderDocument: string | null;
}

export interface ReferralDriver {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  type: 'propio' | 'freelance';
  status: string;
  referralCode: string | null;
  /** Solo en el detalle (GET /admin/referrals/:id). */
  bankAccount?: ReferralBankAccount | null;
}

export interface Referral {
  id: number;
  status: ReferralStatus;
  source: 'signup' | 'app';
  codeUsed: string;
  program: { id: number; name: string } | null;
  referrer: ReferralDriver | null;
  referred: ReferralDriver | null;
  deliveredCount: number;
  requiredDeliveries: number;
  remaining: number;
  referrerRewardAmount: number;
  referredRewardAmount: number;
  rewardDescription: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  note: string | null;
  createdAt: string;
}

export type ReferralSummary = Record<ReferralStatus, { count: number; amount: number }>;

export interface ReferralsPage {
  data: Referral[];
  meta: PageMeta;
  summary: ReferralSummary;
}
