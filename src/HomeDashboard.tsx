import { useState } from 'react';
import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  Coins,
  Layers,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  ActiveTab,
  InvestmentPosition,
  PlatformSettings,
  SupportedAsset,
  UserProfile,
  VipPlan,
} from '../types/platform';
import { formatUsd, summarizePortfolio } from '../utils/investment';
import { ASSET_META } from './AssetBadge';

interface HomeDashboardProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  vipPlans: VipPlan[];
  investments: InvestmentPosition[];
  pendingDepositsCount: number;
  onNavigate: (tab: ActiveTab) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onSelectPlanForDeposit: (plan: VipPlan, asset: SupportedAsset) => void;
  onClaimDailyTask: (investmentId: string) => Promise<void>;
}

const ASSETS: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

export function HomeDashboard({
  settings,
  user,
  vipPlans,
  investments,
  pendingDepositsCount,
  onNavigate,
  onOpenAuth,
  onSelectPlanForDeposit,
  onClaimDailyTask,
}: HomeDashboardProps) {
  const [bannerError, setBannerError] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const portfolio = summarizePortfolio(investments);
  const todayStr = new Date().toISOString().slice(0, 10);

  async function handleClaim(investmentId: string) {
    setClaimingId(investmentId);
    setTaskFeedback(null);
    try {
      await onClaimDailyTask(investmentId);
      setTaskFeedback('Daily market settlement reward credited to your balance.');
    } catch (err) {
      setTaskFeedback(err instanceof Error ? err.message : 'Unable to claim daily yield.');
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Dynamic Announcement Notice */}
      {settings.announcementBanner && (
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#121822] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[#D8DEE9]">
          <p className="leading-relaxed">{settings.announcementBanner}</p>
          <span className="font-mono text-[#E5C158] whitespace-nowrap shrink-0">
            $0.01 / $1 Daily Rate
          </span>
        </div>
      )}

      {/* Hero & Account Balance Split (sibling cards, no card-within-card nesting) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 relative overflow-hidden rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 lg:p-8 flex flex-col justify-between">
          {!bannerError && (
            <img
              src="/src/assets/images/gold_bullion_banner_1795609991383.jpg"
              alt="Brushed 24k gold bullion bars on dark slate"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-45"
            />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#090C11]/95 via-[#090C11]/85 to-[#090C11]/55"
            aria-hidden="true"
          />

          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#D4AF37]">
              <span>{settings.brandTagline}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="text-[#E5C158]/90">No Fixed Duration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#F3EFE6] leading-tight text-balance">
              {settings.heroHeadline}
            </h1>
            <p className="text-sm sm:text-base text-[#B8C0CE] max-w-2xl leading-relaxed">
              {settings.heroSubheadline}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('plans')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Explore VIP Tiers</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('deposit')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#344157] bg-[#10151E]/90 hover:border-[#D4AF37] text-[#F3EFE6] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Deposit USDT (TRC-20)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Create Gmail Account</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('login')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#344157] bg-[#10151E]/90 hover:border-[#D4AF37] text-[#F3EFE6] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Investor Sign In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sibling Balance Summary Card */}
        <div className="lg:col-span-5 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-between border-b border-[#1C2433] pb-4">
            <div>
              <p className="text-xs text-[#9AA4B5]">Available Wallet Balance</p>
              <p
                data-testid="dashboard-balance"
                className="text-3xl font-bold font-mono tabular-nums text-[#E5C158] mt-1"
              >
                {formatUsd(user?.balanceUsd ?? 0)}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 flex items-center justify-center text-[#E5C158]">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-[#9AA4B5]">Active Invested</p>
              <p className="font-mono tabular-nums font-semibold text-[#F3EFE6] mt-0.5">
                {formatUsd(portfolio.totalInvestedUsd)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9AA4B5]">Daily Fixed Yield</p>
              <p className="font-mono tabular-nums font-semibold text-emerald-300 mt-0.5">
                {formatUsd(portfolio.dailyIncomeUsd)} / day
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9AA4B5]">Total Earned</p>
              <p className="font-mono tabular-nums font-semibold text-[#F3EFE6] mt-0.5">
                {formatUsd(user?.totalEarnedUsd ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9AA4B5]">Pending Deposits</p>
              <p className="font-mono tabular-nums font-semibold text-amber-300 mt-0.5">
                {pendingDepositsCount}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#1C2433] flex items-center justify-between text-xs text-[#A6AEBD]">
            <span>Referral Partner Rate: {settings.referralCommissionPct}%</span>
            <button
              type="button"
              onClick={() => onNavigate('withdraw')}
              className="text-[#D4AF37] hover:underline font-medium cursor-pointer"
            >
              Withdraw Funds
            </button>
          </div>
        </div>
      </section>

      {/* Supported Trading Assets */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#F3EFE6]">Supported Trading & Reserve Assets</h2>
            <p className="text-xs text-[#9AA4B5] mt-0.5">
              Every VIP allocation can be assigned across five institutional asset classes
            </p>
          </div>
          <span className="text-xs text-[#D4AF37]">5 Active Markets · Open Duration</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ASSETS.map((asset) => {
            const meta = ASSET_META[asset];
            const allocatedCount = investments.filter(
              (inv) => inv.status === 'Active' && inv.selectedAsset === asset
            ).length;
            return (
              <div
                key={asset}
                className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#E5C158]">{meta.symbol}</span>
                  <span className="text-xs text-[#8D97A8]">{meta.market}</span>
                </div>
                <div>
                  <p className="text-base font-semibold text-[#F3EFE6]">{meta.label}</p>
                  <p className="text-xs text-[#9AA4B5] mt-0.5 tabular-nums">
                    {allocatedCount} active {allocatedCount === 1 ? 'position' : 'positions'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Extra Profit Bonus Policy Notice */}
      <section className="rounded-xl border border-[#2B3446] bg-[#10151E] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 flex items-center justify-center text-[#E5C158] shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F3EFE6]">Extra Profit Bonus Policy</h3>
            <p className="text-xs text-[#A6AEBD] mt-1 leading-relaxed">{settings.extraBonusNotice}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('records')}
          className="min-h-[40px] px-4 py-2 rounded-lg border border-[#2D384B] text-xs font-medium text-[#E5C158] hover:border-[#D4AF37] whitespace-nowrap shrink-0 cursor-pointer"
        >
          View Earnings Ledger
        </button>
      </section>

      {/* Active VIP Positions & Daily Task Claim */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#F3EFE6]">Active VIP Positions & Daily Tasks</h2>
            <p className="text-xs text-[#9AA4B5] mt-0.5">
              Complete your daily settlement task on each active VIP position to credit $0.01 per $1 invested
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="text-xs font-medium text-[#D4AF37] hover:underline self-start sm:self-auto cursor-pointer"
          >
            Add Another VIP Plan
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
            <ShieldCheck className="w-8 h-8 text-[#D4AF37] mx-auto" />
            <p className="text-sm font-medium text-[#F3EFE6]">
              Sign in with your verified Gmail account to view active VIP positions and claim daily yield tasks.
            </p>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
            >
              Sign In or Register
            </button>
          </div>
        ) : investments.length === 0 ? (
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#F3EFE6]">No Active VIP Positions Yet</p>
              <p className="text-xs text-[#9AA4B5]">
                Start with VIP 1 ($1.00) or higher. Multiple purchases of the same VIP tier are supported.
              </p>
            </div>
            {vipPlans[0] && (
              <button
                type="button"
                onClick={() => onSelectPlanForDeposit(vipPlans[0], 'Gold')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Start {vipPlans[0].name} ({formatUsd(vipPlans[0].amountUsd)})
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investments.map((pos) => {
              const claimedToday = pos.lastClaimedDate === todayStr;
              return (
                <div
                  key={pos.id}
                  className="rounded-xl border border-[#222B3A] bg-[#10151E] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold text-[#F3EFE6]">{pos.planName}</span>
                      <span className="text-xs font-mono text-[#E5C158]">{pos.selectedAsset}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#9AA4B5]">
                      <span>Principal: {formatUsd(pos.amountUsd)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Daily: {formatUsd(pos.dailyIncomeUsd)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1C2433]">
                      <span className="text-[#9AA4B5]">Cumulative Earned</span>
                      <span className="font-mono tabular-nums text-emerald-300 font-medium">
                        {formatUsd(pos.totalEarnedUsd)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={claimedToday || claimingId === pos.id}
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
                        <span>Completed Today</span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4" />
                        <span>
                          {claimingId === pos.id
                            ? 'Processing...'
                            : `Claim Daily Task (+${formatUsd(pos.dailyIncomeUsd)})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick VIP Snapshot Strip */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F3EFE6]">VIP 1–5 Investment Tiers</h2>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="text-xs font-medium text-[#D4AF37] hover:underline cursor-pointer"
          >
            View All Tiers
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {vipPlans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#F3EFE6]">{plan.name}</span>
                  <Layers className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158] mt-2">
                  {formatUsd(plan.amountUsd)}
                </p>
                <p className="text-xs text-[#9AA4B5] mt-1 tabular-nums">
                  {formatUsd(plan.amountUsd * plan.dailyRatePerDollar)} daily · {plan.durationLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectPlanForDeposit(plan, 'Gold')}
                className="w-full min-h-[40px] rounded-lg border border-[#344157] hover:border-[#D4AF37] text-xs font-medium text-[#F3EFE6] transition-colors cursor-pointer"
              >
                Select {plan.name}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Referral Callout */}
      <section className="rounded-xl border border-[#222B3A] bg-[#10151E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 flex items-center justify-center text-[#E5C158] shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F3EFE6]">
              {settings.referralCommissionPct}% Partner Referral Commission
            </h3>
            <p className="text-xs text-[#9AA4B5] mt-0.5">
              Invite fellow investors with your referral code and receive {settings.referralCommissionPct}% on every approved deposit.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('refer')}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          Open Referral Center
        </button>
      </section>
    </div>
  );
}
