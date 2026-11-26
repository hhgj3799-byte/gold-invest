import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, ShieldCheck } from 'lucide-react';
import type { PaymentMethod, PlatformSettings, UserProfile, WithdrawalRecord } from '../types/platform';
import { formatUsd } from '../utils/investment';

interface WithdrawViewProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  paymentMethods: PaymentMethod[];
  withdrawals: WithdrawalRecord[];
  onSubmitWithdrawal: (payload: {
    paymentMethodName: string;
    walletAddress: string;
    amountUsd: number;
  }) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export function WithdrawView({
  settings,
  user,
  paymentMethods,
  withdrawals,
  onSubmitWithdrawal,
  onOpenAuth,
}: WithdrawViewProps) {
  const [methodName, setMethodName] = useState(
    paymentMethods[0]?.name ?? 'Binance (USDT TRC-20)'
  );
  const [walletAddress, setWalletAddress] = useState('');
  const [amountUsd, setAmountUsd] = useState(String(settings.minWithdrawalUsd));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      onOpenAuth('login');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await onSubmitWithdrawal({
        paymentMethodName: methodName,
        walletAddress: walletAddress.trim(),
        amountUsd: Number(amountUsd),
      });
      setWalletAddress('');
      setSuccess('Withdrawal request submitted and placed in Pending review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">Withdraw Earnings</h1>
          <p className="text-sm text-[#9AA4B5] mt-1">
            Request TRC-20 disbursements from your available yield and referral balance.
          </p>
        </div>
        {user && (
          <div className="text-sm">
            <span className="text-[#9AA4B5]">Available: </span>
            <span className="font-mono tabular-nums font-bold text-[#E5C158]">
              {formatUsd(user.balanceUsd)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6">
          <h2 className="text-base font-semibold text-[#F3EFE6] mb-4">Withdrawal Request Form</h2>

          {!user ? (
            <div className="py-6 text-center space-y-3">
              <ShieldCheck className="w-8 h-8 text-[#D4AF37] mx-auto" />
              <p className="text-sm text-[#B8C0CE]">Sign in to withdraw your earned balance.</p>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              {success && (
                <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <div>
                <label htmlFor="wd-method" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Receiving Network / Wallet
                </label>
                <select
                  id="wd-method"
                  value={methodName}
                  onChange={(e) => setMethodName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.name}>
                      {pm.name}
                    </option>
                  ))}
                  {paymentMethods.length === 0 && (
                    <>
                      <option value="Binance (USDT TRC-20)">Binance (USDT TRC-20)</option>
                      <option value="Trust Wallet (USDT TRC-20)">Trust Wallet (USDT TRC-20)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="wd-address" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Your TRC-20 Receiving Address
                </label>
                <input
                  id="wd-address"
                  type="text"
                  required
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Enter your Tron (TRC-20) wallet address"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label htmlFor="wd-amount" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Amount (USD · Min {formatUsd(settings.minWithdrawalUsd)})
                </label>
                <input
                  id="wd-amount"
                  type="number"
                  step="0.01"
                  min={settings.minWithdrawalUsd}
                  required
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>{loading ? 'Submitting...' : 'Submit Withdrawal Request'}</span>
              </button>
            </form>
          )}
        </section>

        <section className="lg:col-span-6 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#F3EFE6]">Withdrawal History</h2>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-[#9AA4B5] py-6 text-center">
              No withdrawal requests recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#1D2533]">
              {withdrawals.map((w) => (
                <div key={w.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-[#F3EFE6]">{w.paymentMethodName}</p>
                    <p className="font-mono text-[#8D97A8] truncate">{w.walletAddress}</p>
                    <p className="text-[#6F798B] mt-0.5">{new Date(w.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums font-semibold text-[#E5C158]">
                      {formatUsd(w.amountUsd)}
                    </p>
                    <p
                      className={
                        w.status === 'Approved'
                          ? 'text-emerald-300'
                          : w.status === 'Rejected'
                            ? 'text-rose-300'
                            : 'text-amber-300'
                      }
                    >
                      {w.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
