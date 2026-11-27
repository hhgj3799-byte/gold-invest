import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  MessageSquare,
  PlayCircle,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  ActiveTab,
  InvestmentPosition,
  PlatformSettings,
  ReferralSummary,
  SupportedAsset,
  SupportedLanguage,
  UserProfile,
  VipPlan,
} from '../types/platform';
import {
  computeVipProgress,
  formatDisplayDateTime,
  formatDurationLabel,
  formatUsd,
  getRemainingTermSummary,
  isPlanExpired,
  sanitizeExternalUrl,
  summarizePortfolio,
} from '../utils/investment';
import { ASSET_META } from './AssetBadge';

interface HomeDashboardProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  vipPlans: VipPlan[];
  investments: InvestmentPosition[];
  referralSummary: ReferralSummary | null;
  pendingDepositsCount: number;
  lang: SupportedLanguage;
  onNavigate: (tab: ActiveTab) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onSelectPlanForDeposit: (plan: VipPlan, asset: SupportedAsset) => void;
  onActivateFromBalance: (plan: VipPlan, asset: SupportedAsset) => Promise<void>;
  onClaimDailyTask: (investmentId: string) => Promise<void>;
}

const ASSETS: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

const ASSET_SPARKLINES: Record<SupportedAsset, { path: string; change: string; positive: boolean; unitLabel: string }> = {
  Gold: {
    path: 'M2 20 L10 17 L18 19 L26 12 L34 14 L42 7 L50 9 L58 3',
    change: '+2.65%',
    positive: true,
    unitLabel: '$2,684.50',
  },
  USD: {
    path: 'M2 16 L10 15 L18 14 L26 14 L34 12 L42 11 L50 10 L58 9',
    change: '+0.42%',
    positive: true,
    unitLabel: '$1.0000',
  },
  Apple: {
    path: 'M2 18 L10 16 L18 12 L26 15 L34 10 L42 8 L50 11 L58 5',
    change: '+1.84%',
    positive: true,
    unitLabel: '$228.40',
  },
  Meta: {
    path: 'M2 19 L10 14 L18 15 L26 11 L34 13 L42 7 L50 6 L58 4',
    change: '+2.27%',
    positive: true,
    unitLabel: '$592.10',
  },
  Tesla: {
    path: 'M2 9 L10 12 L18 10 L26 16 L34 13 L42 15 L50 12 L58 14',
    change: '-0.68%',
    positive: false,
    unitLabel: '$341.80',
  },
};

export function HomeDashboard({
  settings,
  user,
  vipPlans,
  investments,
  referralSummary,
  pendingDepositsCount,
  lang,
  onNavigate,
  onOpenAuth,
  onSelectPlanForDeposit,
  onActivateFromBalance,
  onClaimDailyTask,
}: HomeDashboardProps) {
  const [bannerError, setBannerError] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);
  const [planFeedback, setPlanFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const portfolio = summarizePortfolio(investments);
  const vipProgress = computeVipProgress(portfolio.totalInvestedUsd, vipPlans);
  const todayStr = new Date().toISOString().slice(0, 10);
  const safeTelegram = sanitizeExternalUrl(settings.telegramUrl);

  async function handleClaim(investmentId: string) {
    setClaimingId(investmentId);
    setTaskFeedback(null);
    try {
      await onClaimDailyTask(investmentId);
      setTaskFeedback('Daily settlement reward credited to your balance.');
    } catch (err) {
      setTaskFeedback(err instanceof Error ? err.message : 'Unable to claim daily yield.');
    } finally {
      setClaimingId(null);
    }
  }

  async function handlePlanTap(plan: VipPlan) {
    const canInstantActivate = Boolean(
      user &&
        user.balanceUsd >= plan.amountUsd &&
        !user.fundsFrozen &&
        (user.activationStatus === 'Activated' || user.role === 'admin')
    );

    if (!canInstantActivate) {
      onSelectPlanForDeposit(plan, 'Gold');
      return;
    }

    setActivatingPlanId(plan.id);
    setPlanFeedback(null);
    try {
      await onActivateFromBalance(plan, 'Gold');
      setPlanFeedback({
        type: 'success',
        text: `${plan.name} (${formatUsd(plan.amountUsd)}) activated immediately from your balance!`,
      });
    } catch (err) {
      setPlanFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to activate plan.',
      });
    } finally {
      setActivatingPlanId(null);
    }
  }

  async function handleCopyInvite() {
    if (!user) {
      onOpenAuth('register');
      return;
    }
    try {
      await navigator.clipboard.writeText(user.referralCode);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      setCopiedRef(false);
    }
  }

  const quickActions: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Wallet;
  }> = [
    { id: 'deposit', label: t(lang, 'quickDeposit'), icon: Wallet },
    { id: 'withdraw', label: t(lang, 'quickWithdraw'), icon: ArrowDownToLine },
    { id: 'ads', label: t(lang, 'quickAds'), icon: PlayCircle },
    { id: 'plans', label: t(lang, 'quickVip'), icon: Crown },
    { id: 'refer', label: t(lang, 'quickTeam'), icon: Users },
    { id: 'support', label: t(lang, 'quickSupport'), icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      {/* Announcement Strip */}
      {settings.announcementBanner && (
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#111621] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[#D8DEE9]">
          <p className="leading-relaxed">{settings.announcementBanner}</p>
          <span className="font-mono text-[#E5C158] whitespace-nowrap shrink-0">
            $0.01/day · $0.20/mo per $1
          </span>
        </div>
      )}

      {/* Account Activation / Freeze / Block Notices */}
      {user && user.isBlocked && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-center gap-3 text-sm text-rose-200">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{t(lang, 'accountBlockedBanner')}</span>
        </div>
      )}

      {user && user.fundsFrozen && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3 text-sm text-amber-200">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{t(lang, 'fundsFrozenBanner')}</span>
        </div>
      )}

      {user && user.role !== 'admin' && user.activationStatus !== 'Activated' && (
        <section className="rounded-2xl border border-[#D4AF37]/45 bg-[#121722] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[#E5C158]">
              {user.activationStatus === 'Pending'
                ? t(lang, 'activationPendingTitle')
                : t(lang, 'activationRequiredTitle')}
            </h2>
            <p className="text-xs text-[#D8DEE9] leading-relaxed">
              {user.activationStatus === 'Pending'
                ? t(lang, 'activationPendingDesc')
                : t(lang, 'activationRequiredDesc')}
            </p>
          </div>
          {user.activationStatus !== 'Pending' && (
            <button
              type="button"
              onClick={() => onNavigate('deposit')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C89D2B] to-[#E5C158] text-[#090C11] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(lang, 'activateNowBtn')}
            </button>
          )}
        </section>
      )}

      {/* Quick Action Icon Tiles (matching Dark/Gold mobile-first mockup) */}
      <section aria-label="Quick actions" className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        {quickActions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="min-h-[72px] rounded-xl border border-[#2A3344] bg-[#10151E] hover:border-[#D4AF37]/60 px-2 py-3 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Icon className="w-5 h-5 text-[#E5C158]" />
              <span className="text-[11px] font-medium text-[#F3EFE6] whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </section>

      {/* Primary Row: MY INVESTMENT & VIP STATUS (sibling cards, matching mockup) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* MY INVESTMENT Card */}
        <div className="lg:col-span-6 rounded-2xl border border-[#D4AF37]/40 bg-[#10151E] p-6 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-[#B8C0CE]">
                {t(lang, 'myInvestment')}
              </p>
              <p className="text-xs text-[#8D97A8] mt-1">{t(lang, 'totalBalance')}</p>
              <p
                data-testid="dashboard-balance"
                className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-[#E5C158] mt-1"
              >
                {formatUsd(user?.balanceUsd ?? 0)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {user ? (
                <button
                  type="button"
                  onClick={() => onNavigate('deposit')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C89D2B] to-[#E5C158] hover:brightness-110 text-[#090C11] text-xs font-bold tracking-wide whitespace-nowrap cursor-pointer"
                >
                  {t(lang, 'quickDeposit')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C89D2B] to-[#E5C158] hover:brightness-110 text-[#090C11] text-xs font-bold tracking-wide whitespace-nowrap cursor-pointer"
                >
                  {t(lang, 'register')}
                </button>
              )}
              {!user && (
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="text-xs text-[#E5C158] hover:underline cursor-pointer"
                >
                  {t(lang, 'signIn')}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#1D2533] text-xs">
            <div>
              <p className="text-[#8D97A8]">{t(lang, 'activeInvested')}</p>
              <p className="font-mono tabular-nums font-semibold text-[#F3EFE6] mt-0.5">
                {formatUsd(portfolio.totalInvestedUsd)}
              </p>
            </div>
            <div>
              <p className="text-[#8D97A8]">{t(lang, 'dailyYield')}</p>
              <p className="font-mono tabular-nums font-semibold text-emerald-300 mt-0.5">
                {formatUsd(portfolio.dailyIncomeUsd)}
              </p>
            </div>
            <div>
              <p className="text-[#8D97A8]">{t(lang, 'estMonthly')}</p>
              <p className="font-mono tabular-nums font-semibold text-[#E5C158] mt-0.5">
                {formatUsd(portfolio.estimatedMonthlyUsd)}
              </p>
            </div>
            <div>
              <p className="text-[#8D97A8]">{t(lang, 'totalEarned')}</p>
              <p className="font-mono tabular-nums font-semibold text-[#F3EFE6] mt-0.5">
                {formatUsd(user?.totalEarnedUsd ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {/* VIP STATUS Gold Bullion Card */}
        <div className="lg:col-span-6 relative overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-[#10151E] p-6 flex flex-col justify-between gap-5">
          {!bannerError && (
            <img
              src="/src/assets/images/gold_bullion_banner_1795609991383.jpg"
              alt="24k gold bullion bars"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-50"
            />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#090C11]/95 via-[#090C11]/85 to-[#090C11]/45"
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-[#D8DEE9]">
                {t(lang, 'vipStatus')}
              </p>
              <p className="text-xs text-[#9AA4B5] pt-1">{t(lang, 'youAre')}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#E5C158] text-balance">
                {vipProgress.currentTierLabel}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('plans')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#D4AF37]/40 bg-[#10151E]/90 hover:border-[#E5C158] text-xs font-semibold text-[#F3EFE6] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>VIP $1–$10</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#E5C158]" />
            </button>
          </div>

          <div className="relative z-10 space-y-2">
            <div className="h-2.5 w-full rounded-full bg-[#1C2331] overflow-hidden border border-[#2D384B]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#B8891F] to-[#F1D27A] transition-all"
                style={{ width: `${vipProgress.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#D8DEE9]">
              <span>
                {vipProgress.nextTierLabel
                  ? `${t(lang, 'progressTo')} ${vipProgress.nextTierLabel}`
                  : t(lang, 'maxTierReached')}
              </span>
              <span className="font-mono tabular-nums text-[#E5C158]">
                {vipProgress.progressPct}% · {pendingDepositsCount} pending
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Row: TOP ASSETS (with SVG Sparklines) & MY REFERRALS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* TOP ASSETS */}
        <div className="lg:col-span-7 rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1D2533] pb-3">
            <h2 className="text-sm font-bold tracking-wide text-[#F3EFE6]">{t(lang, 'topAssets')}</h2>
            <span className="text-xs text-[#9AA4B5]">Gold · USD · Apple · Meta · Tesla</span>
          </div>

          <div className="divide-y divide-[#1A2230]">
            {ASSETS.map((asset) => {
              const meta = ASSET_META[asset];
              const spark = ASSET_SPARKLINES[asset];
              const activeCount = investments.filter(
                (i) => i.status === 'Active' && !isPlanExpired(i.expiresAt) && i.selectedAsset === asset
              ).length;

              return (
                <div
                  key={asset}
                  className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-3 min-w-[110px]">
                    <div className="w-8 h-8 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 flex items-center justify-center font-mono text-[10px] font-bold text-[#E5C158] shrink-0">
                      {meta.symbol}
                    </div>
                    <div>
                      <p className="font-semibold text-[#F3EFE6]">{meta.label}</p>
                      <p className="text-[11px] text-[#8D97A8]">{activeCount} active</p>
                    </div>
                  </div>

                  <svg
                    viewBox="0 0 60 24"
                    className="w-20 h-6 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      d={spark.path}
                      fill="none"
                      stroke={spark.positive ? '#34D399' : '#FB7185'}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <span
                    className={`font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                      spark.positive ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {spark.change}
                  </span>

                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums font-semibold text-[#F3EFE6]">
                      {spark.unitLabel}
                    </p>
                    <p className="text-[11px] text-[#8D97A8]">$0.01/$1 daily</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MY REFERRALS & Community Card */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-5">
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#10151E] p-6 space-y-5 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide text-[#F3EFE6]">
                {t(lang, 'myReferrals')}
              </h2>
              <span className="text-xs font-mono text-[#E5C158]">
                {settings.referralCommissionPct}% Commission
              </span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#1E2736] text-center py-2">
              <div className="pr-3">
                <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158]">
                  {referralSummary?.totalReferrals ?? 0}
                </p>
                <p className="text-xs text-[#9AA4B5] mt-1">{t(lang, 'totalPeople')}</p>
              </div>
              <div className="pl-3">
                <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158]">
                  {formatUsd(referralSummary?.totalCommissionUsd ?? 0)}
                </p>
                <p className="text-xs text-[#9AA4B5] mt-1">{t(lang, 'referralEarnings')}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#1D2533]">
              <p className="text-xs text-[#9AA4B5]">{t(lang, 'copyInvitationCode')}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-h-[44px] rounded-xl border border-[#232D3E] bg-[#0B0F17] px-3.5 flex items-center justify-center font-mono text-sm font-semibold text-[#F3EFE6]">
                  {user ? user.referralCode : 'REGISTER-TO-UNLOCK'}
                </div>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  aria-label="Copy referral invitation code"
                  className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#C89D2B] to-[#E5C158] text-[#090C11] font-semibold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedRef ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedRef ? t(lang, 'copied') : t(lang, 'copy')}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 flex items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#E5C158]">
                <Award className="w-4 h-4 shrink-0" />
                <span>Surplus Profit Bonus & Telegram</span>
              </div>
              <p className="text-xs text-[#9AA4B5] line-clamp-2">{settings.extraBonusNotice}</p>
            </div>
            <a
              href={safeTelegram}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3.5 rounded-xl border border-[#D4AF37]/40 hover:border-[#E5C158] text-xs font-semibold text-[#E5C158] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>Telegram</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Active VIP Positions & Daily Task Claim */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#F3EFE6]">Active VIP Positions & Daily Tasks</h2>
            <p className="text-xs text-[#9AA4B5] mt-0.5">
              Claim $0.01 daily yield per $1 invested ($0.20 estimated monthly per $1)
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ads')}
            className="text-xs font-medium text-[#D4AF37] hover:underline self-start sm:self-auto cursor-pointer"
          >
            Open Daily Ad Rewards →
          </button>
        </div>

        {taskFeedback && (
          <div
            role="status"
            className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-2.5 text-xs text-[#F7E7B4]"
          >
            {taskFeedback}
          </div>
        )}

        {!user ? (
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-6 text-center space-y-3">
            <p className="text-sm font-medium text-[#F3EFE6]">
              Register with your email, phone number, and password to start investing across VIP $1–$10 tiers.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
              >
                {t(lang, 'register')}
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="min-h-[44px] px-5 py-2 rounded-xl border border-[#344157] text-[#F3EFE6] text-sm font-medium cursor-pointer"
              >
                {t(lang, 'signIn')}
              </button>
            </div>
          </div>
        ) : investments.length === 0 ? (
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#F3EFE6]">No Active VIP Positions Yet</p>
              <p className="text-xs text-[#9AA4B5]">
                Choose any tier from VIP 1 ($1.00) to VIP 8 ($10.00). Multiple purchases are supported.
              </p>
            </div>
            {vipPlans[0] && (
              <button
                type="button"
                onClick={() => onSelectPlanForDeposit(vipPlans[0], 'Gold')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Select {vipPlans[0].name} ({formatUsd(vipPlans[0].amountUsd)})
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investments.map((pos) => {
              const claimedToday = pos.lastClaimedDate === todayStr;
              const term = getRemainingTermSummary(pos.expiresAt);
              const isExpired = pos.status === 'Expired' || term.expired;
              const isActive = pos.status === 'Active' && !isExpired;
              return (
                <div
                  key={pos.id}
                  data-testid={`investment-card-${pos.id}`}
                  className={`rounded-xl border p-5 flex flex-col justify-between gap-4 ${
                    isExpired
                      ? 'border-rose-500/30 bg-[#0D1118] opacity-85'
                      : 'border-[#222B3A] bg-[#10151E]'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-[#F3EFE6]">{pos.planName}</span>
                        <span
                          className={`text-[11px] font-semibold ${
                            isExpired ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {isExpired ? t(lang, 'expiredStatus') : t(lang, 'activeStatus')}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-[#E5C158]">{pos.selectedAsset}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#9AA4B5]">
                      <span>Principal: {formatUsd(pos.amountUsd)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Daily: {formatUsd(pos.dailyIncomeUsd)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDurationLabel(pos.durationDays ?? 30)}</span>
                    </div>
                    <div className="rounded-lg border border-[#1B2331] bg-[#0B0F17] p-2.5 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#8D97A8]">{t(lang, 'purchasedAt')}</span>
                        <span className="font-mono text-[#D8DEE9]">
                          {formatDisplayDateTime(pos.purchasedAt || pos.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#8D97A8]">{t(lang, 'expiresAt')}</span>
                        <span
                          className={`font-mono ${isExpired ? 'text-rose-300' : 'text-[#E5C158]'}`}
                        >
                          {pos.expiresAt
                            ? `${formatDisplayDateTime(pos.expiresAt)} (${term.label})`
                            : 'No Fixed Expiry'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1C2433]">
                      <span className="text-[#9AA4B5]">Cumulative Earned</span>
                      <span className="font-mono tabular-nums text-emerald-300 font-medium">
                        {formatUsd(pos.totalEarnedUsd)}
                      </span>
                    </div>
                  </div>

                  {isExpired ? (
                    <button
                      type="button"
                      disabled
                      className="w-full min-h-[44px] rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <span>{t(lang, 'planExpiredNotice')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isActive || claimedToday || claimingId === pos.id}
                      onClick={() => handleClaim(pos.id)}
                      className={`w-full min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        claimedToday
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 cursor-default'
                          : 'bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11]'
                      }`}
                    >
                      {claimedToday ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t(lang, 'claimedToday')}</span>
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-4 h-4" />
                          <span>
                            {claimingId === pos.id
                              ? 'Processing...'
                              : `Claim Daily (+${formatUsd(pos.dailyIncomeUsd)})`}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* VIP $1–$10 Quick Snapshot Strip */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#F3EFE6]">{t(lang, 'vipTiersTitle')}</h2>
            {user && user.balanceUsd >= 1 && (user.activationStatus === 'Activated' || user.role === 'admin') && (
              <p className="text-xs text-emerald-300 mt-0.5">{t(lang, 'instantActivateHint')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="text-xs font-medium text-[#D4AF37] hover:underline cursor-pointer"
          >
            View All Tiers
          </button>
        </div>

        {planFeedback && (
          <div
            role={planFeedback.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              planFeedback.type === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {planFeedback.text}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {vipPlans.map((plan) => {
            const canInstantActivate = Boolean(
              user &&
                user.balanceUsd >= plan.amountUsd &&
                !user.fundsFrozen &&
                (user.activationStatus === 'Activated' || user.role === 'admin')
            );
            const isActivating = activatingPlanId === plan.id;

            return (
              <button
                key={plan.id}
                type="button"
                data-testid={`home-vip-card-${plan.id}`}
                disabled={isActivating}
                onClick={() => handlePlanTap(plan)}
                className={`text-left rounded-xl border bg-[#10151E] p-3.5 flex flex-col justify-between gap-3 transition-colors cursor-pointer disabled:opacity-60 ${
                  canInstantActivate
                    ? 'border-[#D4AF37]/50 hover:border-[#E5C158] hover:bg-[#141B26]'
                    : 'border-[#222B3A] hover:border-[#344157]'
                }`}
              >
                <div>
                  <p className="text-xs font-semibold text-[#F3EFE6]">{plan.name}</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[#E5C158] mt-1">
                    {formatUsd(plan.amountUsd)}
                  </p>
                  <p className="text-[11px] text-emerald-300 mt-1 tabular-nums">
                    +{formatUsd(plan.amountUsd * plan.dailyRatePerDollar)}/day
                  </p>
                  <p className="text-[11px] text-[#8D97A8] tabular-nums">
                    {plan.durationLabel || formatDurationLabel(plan.durationDays ?? 30)}
                  </p>
                </div>
                <span
                  className={`w-full min-h-[38px] rounded-lg text-xs flex items-center justify-center transition-colors ${
                    canInstantActivate
                      ? 'bg-[#D4AF37] text-[#090C11] font-semibold'
                      : 'border border-[#344157] text-[#F3EFE6] font-medium'
                  }`}
                >
                  {isActivating
                    ? t(lang, 'activating')
                    : canInstantActivate
                      ? t(lang, 'activateNow')
                      : 'Select'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
