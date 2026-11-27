import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  ActiveTab,
  ActivationRequest,
  DepositRecord,
  PaymentMethod,
  PlatformSettings,
  SupportedAsset,
  SupportedLanguage,
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
  activationRequests: ActivationRequest[];
  preselectedPlan: VipPlan | null;
  preselectedAsset: SupportedAsset;
  lang: SupportedLanguage;
  onSubmitActivation: (payload: {
    paymentMethodId: string;
    txId: string;
    senderAccount: string;
  }) => Promise<void>;
  onSubmitDeposit: (payload: {
    planId: string | null;
    selectedAsset: SupportedAsset;
    paymentMethodId: string;
    txId: string;
    senderNote: string;
    customAmountUsd?: number;
  }) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onNavigate: (tab: ActiveTab) => void;
}

export function DepositView({
  settings,
  user,
  vipPlans,
  paymentMethods,
  deposits,
  activationRequests,
  preselectedPlan,
  preselectedAsset,
  lang,
  onSubmitActivation,
  onSubmitDeposit,
  onOpenAuth,
  onNavigate,
}: DepositViewProps) {
  const isUnactivated = Boolean(user && user.role !== 'admin' && user.activationStatus !== 'Activated');
  const [flowMode, setFlowMode] = useState<'activation' | 'deposit'>(
    isUnactivated ? 'activation' : 'deposit'
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string>(paymentMethods[0]?.id ?? '');
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    preselectedPlan?.id ?? vipPlans[0]?.id ?? ''
  );
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset>(preselectedAsset);
  const [customAmount, setCustomAmount] = useState('10');
  const [txId, setTxId] = useState('');
  const [senderNote, setSenderNote] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPlan) {
      setSelectedPlanId(preselectedPlan.id);
      if (!isUnactivated) setFlowMode('deposit');
    }
  }, [preselectedPlan, isUnactivated]);

  useEffect(() => {
    if (user?.activationStatus === 'Activated') {
      setFlowMode('deposit');
    } else if (isUnactivated) {
      setFlowMode('activation');
    }
  }, [user?.activationStatus, isUnactivated]);

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
  const safeTelegram = sanitizeExternalUrl(settings.telegramUrl);

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
      onOpenAuth('register');
      return;
    }
    if (!activeMethod) {
      setError('No active payment method is configured.');
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (flowMode === 'activation') {
        await onSubmitActivation({
          paymentMethodId: activeMethod.id,
          txId: txId.trim(),
          senderAccount: senderNote.trim(),
        });
        setTxId('');
        setSenderNote('');
        setSuccess(
          `Activation proof (${settings.activationFeeBdt} BDT / $${settings.activationFeeUsd.toFixed(2)}) submitted! The Admin has been notified for manual activation.`
        );
      } else {
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
        setSuccess('Deposit submitted! Status is Pending until verified by an administrator.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-[#1E2736] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">{t(lang, 'depositTitle')}</h1>
          <p className="text-sm text-[#9AA4B5] mt-1">{t(lang, 'depositSubtitle')}</p>
        </div>
        <span className="text-xs font-mono text-[#E5C158] whitespace-nowrap">
          Activation Fee: {settings.activationFeeBdt} BDT (${settings.activationFeeUsd.toFixed(2)})
        </span>
      </div>

      {/* Mode Switch: Account Activation vs VIP Deposit */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-xl border border-[#222B3A] bg-[#0D1118] max-w-md">
        <button
          type="button"
          onClick={() => {
            setFlowMode('activation');
            setError(null);
            setSuccess(null);
          }}
          className={`flex-1 min-h-[42px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            flowMode === 'activation'
              ? 'bg-[#D4AF37] text-[#090C11]'
              : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
          }`}
        >
          Account Activation ({settings.activationFeeBdt} BDT)
        </button>
        <button
          type="button"
          onClick={() => {
            setFlowMode('deposit');
            setError(null);
            setSuccess(null);
          }}
          className={`flex-1 min-h-[42px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            flowMode === 'deposit'
              ? 'bg-[#D4AF37] text-[#090C11]'
              : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
          }`}
        >
          VIP $1–$10 Deposit
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F3EFE6]">1. Select Payment Method</h2>
              <span className="text-xs text-[#9AA4B5]">{paymentMethods.length} active</span>
            </div>

            {paymentMethods.length === 0 ? (
              <p className="text-sm text-amber-300">
                No payment methods are currently active. Contact support or Admin configuration.
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

            {activeMethod && (
              <div className="rounded-xl border border-[#2A3548] bg-[#0B0F17] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-[#9AA4B5]">
                  <span>{activeMethod.name} Number / Address</span>
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
                  <span>{copiedAddress ? 'Copied Number / Address' : 'Copy Number / Address'}</span>
                </button>
              </div>
            )}
          </section>

          {/* Form Section */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[#F3EFE6] mb-4">
              {flowMode === 'activation'
                ? `2. Submit ${settings.activationFeeBdt} BDT ($${settings.activationFeeUsd.toFixed(2)}) Account Activation Proof`
                : '2. Submit VIP Plan Allocation & Transaction ID'}
            </h2>

            {user?.activationStatus === 'Activated' && flowMode === 'activation' && (
              <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Your account is already activated! Switch to VIP $1–$10 Deposit above.</span>
              </div>
            )}

            {flowMode === 'deposit' && isUnactivated && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>
                  Account status: <strong>{user?.activationStatus}</strong>. Complete the{' '}
                  {settings.activationFeeBdt} BDT (${settings.activationFeeUsd.toFixed(2)}) activation
                  fee first so the Admin can activate your account.
                </span>
              </div>
            )}

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
              {flowMode === 'activation' ? (
                <div className="rounded-xl border border-[#D4AF37]/30 bg-[#0B0F17] p-4 flex items-center justify-between text-sm">
                  <span className="text-[#9AA4B5]">Activation Fee Due</span>
                  <span className="font-mono tabular-nums font-bold text-[#E5C158]">
                    {settings.activationFeeBdt} BDT (${settings.activationFeeUsd.toFixed(2)})
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="deposit-plan-select" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                      Investment Tier (VIP $1–$10 or Wallet Top-Up)
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
                      {formatUsd(amountDue)}
                    </span>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="deposit-txid" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Transaction ID / TxHash (TrxID)
                </label>
                <input
                  id="deposit-txid"
                  type="text"
                  required
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  placeholder="Paste Nagad TrxID, Binance Order ID, or TRC20/BEP20 TxHash"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label htmlFor="deposit-note" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  {flowMode === 'activation'
                    ? 'Your Sender Number / Wallet ID (Optional)'
                    : 'Sender Wallet / Note (Optional)'}
                </label>
                <input
                  id="deposit-note"
                  type="text"
                  value={senderNote}
                  onChange={(e) => setSenderNote(e.target.value)}
                  placeholder="e.g. +88017... or Binance Pay ID"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  (flowMode === 'activation' && user?.activationStatus === 'Activated')
                }
                className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Submitting...'
                    : !user
                      ? 'Register / Sign In to Submit'
                      : flowMode === 'activation'
                        ? 'Notify Admin & Submit Activation Proof'
                        : 'Submit Deposit for Verification'}
                </span>
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: Deposit Process + Activation History + Direct Support */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#F3EFE6]">Deposit & Activation Process</h2>
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

          {user && activationRequests.length > 0 && (
            <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#F3EFE6]">Activation Fee Requests</h3>
              <div className="divide-y divide-[#1D2533]">
                {activationRequests.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-[#F3EFE6] truncate">
                        {act.paymentMethodName} · {act.amountLabel}
                      </p>
                      <p className="font-mono text-[#8D97A8] truncate">{act.txId}</p>
                    </div>
                    <span
                      className={
                        act.status === 'Approved'
                          ? 'text-emerald-300 font-semibold'
                          : act.status === 'Rejected'
                            ? 'text-rose-300 font-semibold'
                            : 'text-amber-300 font-semibold'
                      }
                    >
                      {act.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {user && deposits.length > 0 && (
            <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#F3EFE6]">Recent Deposit Submissions</h3>
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

          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-[#F3EFE6]">Direct Admin Support</h3>
                <p className="text-xs text-[#9AA4B5] mt-1">
                  Message the Admin directly or join our official Telegram group for instant assistance.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('support')}
                className="min-h-[42px] rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Message Admin</span>
              </button>
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
          </section>
        </div>
      </div>
    </div>
  );
}
