import { useState } from 'react';
import { Award, Check, Layers, Repeat, Wallet } from 'lucide-react';
import type {
  InvestmentPosition,
  PlatformSettings,
  SupportedAsset,
  UserProfile,
  VipPlan,
} from '../types/platform';
import { calculateDailyIncome, formatUsd, summarizePortfolio } from '../utils/investment';
import { AssetSelector } from './AssetBadge';

interface VipPlansViewProps {
  vipPlans: VipPlan[];
  settings: PlatformSettings;
  user: UserProfile | null;
  investments: InvestmentPosition[];
  onDepositForPlan: (plan: VipPlan, asset: SupportedAsset) => void;
  onActivateFromBalance: (plan: VipPlan, asset: SupportedAsset) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export function VipPlansView({
  vipPlans,
  settings,
  user,
  investments,
  onDepositForPlan,
  onActivateFromBalance,
  onOpenAuth,
}: VipPlansViewProps) {
  const [selectedAssetsByPlan, setSelectedAssetsByPlan] = useState<Record<string, SupportedAsset>>({});
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const portfolio = summarizePortfolio(investments);

  function getSelectedAsset(plan: VipPlan): SupportedAsset {
    return selectedAssetsByPlan[plan.id] ?? plan.supportedAssets[0] ?? 'Gold';
  }

  async function handleBalancePurchase(plan: VipPlan) {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    setFeedback(null);
    setActivatingPlanId(plan.id);
    try {
      const asset = getSelectedAsset(plan);
      await onActivateFromBalance(plan, asset);
      setFeedback({
        type: 'success',
        message: `${plan.name} (${asset}) activated from your available balance. You can purchase any VIP tier multiple times.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Activation failed.',
      });
    } finally {
      setActivatingPlanId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1E2736] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">VIP Investment Plans (VIP 1 – VIP 5)</h1>
          <p className="text-sm text-[#9AA4B5] mt-1">
            Fixed daily income of $0.01 per $1 invested · No fixed duration · Unlimited multi-purchase per tier
          </p>
        </div>
        {user && (
          <div className="rounded-xl border border-[#242E3F] bg-[#10151E] px-4 py-2.5 flex items-center gap-4 text-xs">
            <div>
              <span className="text-[#9AA4B5]">Available Balance: </span>
              <span className="font-mono tabular-nums font-semibold text-[#E5C158]">
                {formatUsd(user.balanceUsd)}
              </span>
            </div>
            <span aria-hidden="true" className="text-[#344157]">|</span>
            <div>
              <span className="text-[#9AA4B5]">Active Plans: </span>
              <span className="font-mono tabular-nums font-semibold text-[#F3EFE6]">
                {portfolio.activePositionsCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Extra Profit Bonus Notice */}
      <div className="rounded-xl border border-[#D4AF37]/30 bg-[#121822] p-4 flex items-start gap-3">
        <Award className="w-5 h-5 text-[#E5C158] shrink-0 mt-0.5" />
        <div className="text-xs text-[#D8DEE9] leading-relaxed">
          <span className="font-semibold text-[#F7E7B4]">Surplus Profit Bonus Program: </span>
          {settings.extraBonusNotice}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {vipPlans.map((plan) => {
          const selectedAsset = getSelectedAsset(plan);
          const dailyIncome = calculateDailyIncome(plan.amountUsd, plan.dailyRatePerDollar);
          const ownedCount = portfolio.tierCounts[plan.id] ?? 0;
          const canPayFromBalance = Boolean(user && user.balanceUsd >= plan.amountUsd);

          return (
            <article
              key={plan.id}
              data-testid={`vip-plan-card-${plan.id}`}
              className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 flex flex-col justify-between gap-6"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#D4AF37]">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Tier {plan.tierNumber}</span>
                      {ownedCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-300 font-medium">Owned {ownedCount}x</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-[#F3EFE6] mt-1">{plan.name}</h2>
                    <p className="text-xs text-[#9AA4B5] mt-0.5">{plan.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158]">
                      {formatUsd(plan.amountUsd)}
                    </p>
                    <p className="text-[11px] text-[#8D97A8]">Per Position</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#1E2736] bg-[#0B0F17] p-3.5 text-xs">
                  <div>
                    <p className="text-[#8D97A8]">Daily Yield</p>
                    <p className="font-mono tabular-nums font-semibold text-emerald-300 mt-0.5">
                      {formatUsd(dailyIncome)} / day
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D97A8]">Duration</p>
                    <p className="font-medium text-[#F3EFE6] mt-0.5">{plan.durationLabel}</p>
                  </div>
                  <div>
                    <p className="text-[#8D97A8]">Yield Rate</p>
                    <p className="font-mono tabular-nums text-[#F3EFE6] mt-0.5">
                      ${plan.dailyRatePerDollar.toFixed(2)} per $1
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8D97A8]">Multi-Purchase</p>
                    <p className="font-medium text-[#E5C158] mt-0.5 inline-flex items-center gap-1">
                      <Repeat className="w-3 h-3" />
                      <span>Allowed</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#B8C0CE]">Select Target Asset for This Position</p>
                  <AssetSelector
                    assets={plan.supportedAssets}
                    selected={selectedAsset}
                    onSelect={(asset) =>
                      setSelectedAssetsByPlan((prev) => ({ ...prev, [plan.id]: asset }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-[#1D2533]">
                <button
                  type="button"
                  onClick={() => onDepositForPlan(plan, selectedAsset)}
                  className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold transition-colors cursor-pointer"
                >
                  Deposit & Purchase {plan.name} ({formatUsd(plan.amountUsd)})
                </button>

                <button
                  type="button"
                  disabled={activatingPlanId === plan.id || (Boolean(user) && !canPayFromBalance)}
                  onClick={() => handleBalancePurchase(plan)}
                  className="w-full min-h-[42px] rounded-xl border border-[#2C3649] hover:border-[#D4AF37] text-xs font-medium text-[#F3EFE6] disabled:opacity-45 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>
                    {activatingPlanId === plan.id
                      ? 'Activating...'
                      : user
                        ? canPayFromBalance
                          ? `Activate Again from Balance (${formatUsd(plan.amountUsd)})`
                          : `Insufficient Balance for Instant Purchase`
                        : 'Sign In to Activate from Balance'}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 text-[11px] text-[#8D97A8] justify-center">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Includes {settings.referralCommissionPct}% partner commission eligibility</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
