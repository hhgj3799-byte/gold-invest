import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type {
  DepositRecord,
  PaymentMethod,
  PlatformSettings,
  SupportedAsset,
  UserProfile,
  VipPlan,
} from '../types/platform';
import { formatUsd, sanitizeExternalUrl } from '../utils/investment';
import { AssetSelector } from './AssetBadge';

interface DepositViewProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  vipPlans: VipPlan[];
  paymentMethods: PaymentMethod[];
  deposits: DepositRecord[];
  preselectedPlan: VipPlan | null;
  preselectedAsset: SupportedAsset;
  onSubmitDeposit: (payload: {
    planId: string | null;
    selectedAsset: SupportedAsset;
    paymentMethodId: string;
    txId: string;
    senderNote: string;
    customAmountUsd?: number;
  }) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export function DepositView({
  settings,
  user,
  vipPlans,
  paymentMethods,
  deposits,
  preselectedPlan,
  preselectedAsset,
  onSubmitDeposit,
  onOpenAuth,
}: DepositViewProps) {
  const [selectedMethodId, setSelectedMethodId] = useState<string>(paymentMethods[0]?.id ?? '');
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    preselectedPlan?.id ?? vipPlans[0]?.id ?? ''
  );
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset>(preselectedAsset);
  const [customAmount, setCustomAmount] = useState('5');
  const [txId, setTxId] = useState('');
  const [senderNote, setSenderNote] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPlan) {
      setSelectedPlanId(preselectedPlan.id);
    }
  }, [preselectedPlan]);

  useEffect(() => {
    setSelectedAsset(preselectedAsset);
  }, [preselectedAsset]);

  useEffect(() => {
    if (!selectedMethodId && paymentMethods[0]) {
      setSelectedMethodId(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedMethodId]);

  const activeMethod =
    paymentMethods.find((pm) => pm.id === selectedMethodId) ?? paymentMethods[0] ?? null;
  const activePlan = vipPlans.find((p) => p.id === selectedPlanId) ?? null;
  const amountDue = activePlan ? activePlan.amountUsd : Number(customAmount) || 0;

  async function handleCopyAddress() {
    if (!activeMethod?.walletAddress) return;
    try {
      await navigator.clipboard.writeText(activeMethod.walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      setCopiedAddress(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      onOpenAuth('login');
      return;
    }
    if (!activeMethod) {
      setError('No active TRC-20 payment method is configured.');
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await onSubmitDeposit({
        planId: selectedPlanId ? selectedPlanId : null,
        selectedAsset,
        paymentMethodId: activeMethod.id,
        txId: txId.trim(),
        senderNote: senderNote.trim(),
        customAmountUsd: selectedPlanId ? undefined : Number(customAmount),
      });
      setTxId('');
      setSenderNote('');
      setSuccess(
        'Deposit submitted! Status is now Pending until an administrator verifies your Transaction ID.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit deposit.');
    } finally {
      setSubmitting(false);
    }
  }

  const safeTelegram = sanitizeExternalUrl(settings.telegramUrl);

  return (
    <div className="space-y-8">
      <div className="border-b border-[#1E2736] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">Deposit & Manual TRC-20 Verification</h1>
          <p className="text-sm text-[#9AA4B5] mt-1">
            Transfer via Binance or Trust Wallet (TRC-20 / Tron) and submit your Transaction ID for review.
          </p>
        </div>
        <span className="text-xs font-mono text-[#E5C158] whitespace-nowrap">
          Network: USDT TRC-20 (Tron)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Payment Method Selector & Transaction Submission */}
        <div className="lg:col-span-7 space-y-6">
          {/* Payment Methods Radio List (matches reference layout in Dark/Gold) */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F3EFE6]">1. Choose TRC-20 Payment Method</h2>
              <span className="text-xs text-[#9AA4B5]">{paymentMethods.length} active</span>
            </div>

            {paymentMethods.length === 0 ? (
              <p className="text-sm text-amber-300">
                No payment methods are currently active. Contact support or check Admin configuration.
              </p>
            ) : (
              <div className="divide-y divide-[#1D2533] rounded-xl border border-[#232D3E] bg-[#0B0F17] overflow-hidden">
                {paymentMethods.map((pm) => {
                  const selected = activeMethod?.id === pm.id;
                  return (
                    <label
                      key={pm.id}
                      className={`flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer transition-colors ${
                        selected ? 'bg-[#D4AF37]/10' : 'hover:bg-[#131924]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#F3EFE6]">{pm.name}</p>
                        <p className="text-xs text-[#9AA4B5] mt-0.5">{pm.network}</p>
                      </div>
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={selected}
                        onChange={() => setSelectedMethodId(pm.id)}
                        className="w-4 h-4 accent-[#D4AF37] shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Selected Wallet Address + Copy Button */}
            {activeMethod && (
              <div className="rounded-xl border border-[#2A3548] bg-[#0B0F17] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-[#9AA4B5]">
                  <span>Official {activeMethod.name} Address</span>
                  <span className="font-mono text-[#E5C158]">{activeMethod.network}</span>
                </div>
                <p
                  data-testid="deposit-wallet-address"
                  className="font-mono text-xs sm:text-sm text-[#F3EFE6] break-all bg-[#090C11] border border-[#1E2736] rounded-lg px-3 py-2.5"
                >
                  {activeMethod.walletAddress}
                </p>
                <p className="text-xs text-[#A6AEBD] leading-relaxed">{activeMethod.instructions}</p>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedAddress ? 'Address Copied' : 'Copy Wallet Address'}</span>
                </button>
              </div>
            )}
          </section>

          {/* Deposit Proof Form */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#F3EFE6] mb-4">
              2. Submit Plan Allocation & Transaction ID
            </h2>

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
            {success && (
              <div role="status" className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="deposit-plan-select" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Investment Tier (VIP 1–5 or Wallet Top-Up)
                </label>
                <select
                  id="deposit-plan-select"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                >
                  {vipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatUsd(plan.amountUsd)} (Daily {formatUsd(plan.amountUsd * plan.dailyRatePerDollar)})
                    </option>
                  ))}
                  <option value="">General Wallet Top-Up (Custom Amount)</option>
                </select>
              </div>

              {!selectedPlanId && (
                <div>
                  <label htmlFor="deposit-custom-amount" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                    Deposit Amount (USD)
                  </label>
                  <input
                    id="deposit-custom-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-[#B8C0CE] mb-1.5">Target Asset Allocation</p>
                <AssetSelector
                  assets={activePlan?.supportedAssets ?? ['Gold', 'USD', 'Apple', 'Meta', 'Tesla']}
                  selected={selectedAsset}
                  onSelect={setSelectedAsset}
                />
              </div>

              <div className="rounded-xl border border-[#1E2736] bg-[#0B0F17] px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-[#9AA4B5]">Exact Transfer Amount</span>
                <span className="font-mono tabular-nums font-bold text-[#E5C158]">
                  {formatUsd(amountDue)} USDT (TRC-20)
                </span>
              </div>

              <div>
                <label htmlFor="deposit-txid" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Transaction ID / TxHash
                </label>
                <input
                  id="deposit-txid"
                  type="text"
                  required
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  placeholder="Paste your TRC-20 TxID (e.g. 9f8a7b6c5d4e3f2a...)"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label htmlFor="deposit-note" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Sender Wallet / Note (Optional)
                </label>
                <input
                  id="deposit-note"
                  type="text"
                  value={senderNote}
                  onChange={(e) => setSenderNote(e.target.value)}
                  placeholder="Optional reference note for the reviewer"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Submitting Proof...'
                    : user
                      ? 'Submit Deposit for Verification'
                      : 'Sign In to Submit Deposit'}
                </span>
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: Step-by-Step Deposit Process + Recent Submissions + Support */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#F3EFE6]">Deposit Process</h2>
            <div className="space-y-3">
              {settings.depositGuideSteps.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 space-y-1"
                >
                  <p className="text-sm font-semibold text-[#E5C158]">
                    {item.step}. {item.title}
                  </p>
                  <p className="text-xs text-[#A6AEBD] leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {user && deposits.length > 0 && (
            <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#F3EFE6]">Recent Submissions</h3>
              <div className="divide-y divide-[#1D2533]">
                {deposits.slice(0, 4).map((dep) => (
                  <div key={dep.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-[#F3EFE6] truncate">
                        {dep.planName ?? 'Wallet Deposit'} · {dep.selectedAsset}
                      </p>
                      <p className="font-mono text-[#8D97A8] truncate">{dep.txId}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono tabular-nums font-semibold text-[#F3EFE6]">
                        {formatUsd(dep.amountUsd)}
                      </p>
                      <p
                        className={
                          dep.status === 'Approved'
                            ? 'text-emerald-300'
                            : dep.status === 'Rejected'
                              ? 'text-rose-300'
                              : 'text-amber-300'
                        }
                      >
                        {dep.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Support Block matching screenshot 4 */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-[#F3EFE6]">Need Verification Assistance?</h3>
                <p className="text-xs text-[#9AA4B5] mt-1">
                  Contact our operations desk for any deposit questions, Transaction ID updates, or support inquiries.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <a
                href={`mailto:${settings.supportEmail}`}
                className="min-h-[42px] rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Email Support</span>
              </a>
              <a
                href={safeTelegram}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Official Telegram</span>
              </a>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#8D97A8] pt-1">
              <ShieldAlert className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>Only send USDT via the TRC-20 (Tron) network to avoid asset loss.</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
