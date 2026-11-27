export type SupportedAsset = 'Gold' | 'USD' | 'Apple' | 'Meta' | 'Tesla';
export type SupportedLanguage = 'en' | 'bn' | 'zh' | 'hi';

export type DepositStatus = 'Pending' | 'Approved' | 'Rejected';
export type ActivationStatus = 'Unpaid' | 'Pending' | 'Activated';
export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  phoneNumber: string;
  fullName: string;
  role: UserRole;
  isVerified: boolean;
  activationStatus: ActivationStatus;
  isBlocked: boolean;
  fundsFrozen: boolean;
  referralCode: string;
  referredByUserId: string | null;
  balanceUsd: number;
  totalInvestedUsd: number;
  totalEarnedUsd: number;
  totalReferralEarnedUsd: number;
  createdAt: string;
}

export interface VipPlan {
  id: string;
  tierNumber: number;
  name: string;
  subtitle: string;
  amountUsd: number;
  dailyRatePerDollar: number;
  monthlyRatePerDollar: number;
  supportedAssets: SupportedAsset[];
  durationDays: number;
  durationLabel: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  network: string;
  walletAddress: string;
  instructions: string;
  isActive: boolean;
  sortOrder: number;
}

export interface DepositGuideStep {
  step: number;
  title: string;
  description: string;
}

export interface PlatformSettings {
  brandName: string;
  brandTagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  announcementBanner: string;
  extraBonusNotice: string;
  supportEmail: string;
  telegramUrl: string;
  minWithdrawalUsd: number;
  referralCommissionPct: number;
  activationFeeBdt: number;
  activationFeeUsd: number;
  defaultAdRewardUsd: number;
  depositGuideSteps: DepositGuideStep[];
}

export interface ActivationRequest {
  id: string;
  userId: string;
  userEmail?: string;
  userPhone?: string;
  paymentMethodId: string;
  paymentMethodName: string;
  amountLabel: string;
  amountUsd: number;
  txId: string;
  senderAccount: string;
  status: DepositStatus;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface DailyAdItem {
  id: string;
  title: string;
  description: string;
  targetUrl: string;
  rewardUsd: number;
  durationSeconds: number;
  isActive: boolean;
  claimedToday?: boolean;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  senderRole: UserRole;
  senderEmail: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminManagedUser {
  id: string;
  email: string;
  phoneNumber: string;
  fullName: string;
  role: UserRole;
  activationStatus: ActivationStatus;
  isBlocked: boolean;
  fundsFrozen: boolean;
  balanceUsd: number;
  totalInvestedUsd: number;
  savedPassword: string | null;
  createdAt: string;
}

export interface DepositRecord {
  id: string;
  userId: string;
  userEmail?: string;
  planId: string | null;
  planName: string | null;
  selectedAsset: SupportedAsset;
  paymentMethodId: string;
  paymentMethodName: string;
  amountUsd: number;
  txId: string;
  senderNote: string;
  status: DepositStatus;
  adminNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface InvestmentPosition {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  selectedAsset: SupportedAsset;
  amountUsd: number;
  dailyIncomeUsd: number;
  sourceDepositId: string | null;
  status: 'Active' | 'Paused' | 'Expired';
  purchasedAt: string;
  durationDays: number;
  expiresAt: string | null;
  expiredAt: string | null;
  lastClaimedDate: string | null;
  totalEarnedUsd: number;
  createdAt: string;
}

export interface EarningsRecord {
  id: string;
  userId: string;
  type: 'Daily Yield' | 'Extra Profit Bonus' | 'Referral Commission' | 'Ad Viewing Reward';
  title: string;
  asset: string;
  amountUsd: number;
  referenceId: string | null;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  userId: string;
  investmentId: string;
  planName: string;
  asset: string;
  taskTitle: string;
  rewardUsd: number;
  status: 'Completed' | 'Pending';
  taskDate: string;
  createdAt: string;
}

export interface FinancialRecord {
  id: string;
  userId: string;
  category:
    | 'Deposit'
    | 'Plan Purchase'
    | 'Daily Yield'
    | 'Extra Bonus'
    | 'Referral Commission'
    | 'Ad Reward'
    | 'Activation Fee'
    | 'Withdrawal'
    | 'Plan Expired';
  description: string;
  direction: 'Credit' | 'Debit';
  amountUsd: number;
  balanceAfterUsd: number;
  status: 'Completed' | 'Pending' | 'Rejected';
  createdAt: string;
}

export interface WithdrawalRecord {
  id: string;
  userId: string;
  userEmail?: string;
  paymentMethodName: string;
  walletAddress: string;
  amountUsd: number;
  status: DepositStatus;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ReferralSummary {
  referralCode: string;
  commissionPct: number;
  totalReferrals: number;
  totalCommissionUsd: number;
  referredUsers: Array<{
    id: string;
    maskedEmail: string;
    fullName: string;
    isVerified: boolean;
    totalInvestedUsd: number;
    joinedAt: string;
  }>;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export type ActivityLogCategory =
  | 'User Login'
  | 'Investment Activation'
  | 'Deposit Submission';

export interface ActivityLogRecord {
  id: string;
  category: ActivityLogCategory;
  userId: string | null;
  userEmail: string;
  userName: string;
  actionTitle: string;
  details: string;
  amountUsd: number | null;
  ipAddress: string;
  status: string;
  createdAt: string;
}

export type ActiveTab =
  | 'home'
  | 'plans'
  | 'ads'
  | 'deposit'
  | 'withdraw'
  | 'records'
  | 'refer'
  | 'support'
  | 'admin';

export type RecordsSubTab = 'earnings' | 'deposits' | 'tasks' | 'financial';
