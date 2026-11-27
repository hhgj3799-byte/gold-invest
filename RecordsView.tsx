import { useState } from 'react';
import { CheckSquare, DollarSign, FileSpreadsheet, History, ShieldCheck } from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  DepositRecord,
  EarningsRecord,
  FinancialRecord,
  RecordsSubTab,
  SupportedLanguage,
  TaskRecord,
  UserProfile,
} from '../types/platform';
import { formatUsd } from '../utils/investment';

interface RecordsViewProps {
  user: UserProfile | null;
  earnings: EarningsRecord[];
  deposits: DepositRecord[];
  tasks: TaskRecord[];
  financial: FinancialRecord[];
  lang: SupportedLanguage;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

const SUB_TABS: Array<{ id: RecordsSubTab; label: string }> = [
  { id: 'earnings', label: 'Earnings Records' },
  { id: 'deposits', label: 'Deposit Records' },
  { id: 'tasks', label: 'Task & Ad Records' },
  { id: 'financial', label: 'Financial Records' },
];

export function RecordsView({
  user,
  earnings,
  deposits,
  tasks,
  financial,
  lang,
  onOpenAuth,
}: RecordsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<RecordsSubTab>('earnings');

  if (!user) {
    return (
      <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-8 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-[#D4AF37] mx-auto" />
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#F3EFE6]">{t(lang, 'recordsTitle')}</h1>
          <p className="text-sm text-[#9AA4B5]">
            Sign in to view Earnings, Deposit, Task, Ad Rewards, and Financial records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenAuth('login')}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
        >
          {t(lang, 'signIn')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5">
        <h1 className="text-2xl font-bold text-[#F3EFE6]">{t(lang, 'recordsTitle')}</h1>
        <p className="text-sm text-[#9AA4B5] mt-1">{t(lang, 'recordsSubtitle')}</p>
      </div>

      <div
        role="tablist"
        aria-label="Record ledger categories"
        className="flex flex-wrap gap-1.5 p-1.5 rounded-xl border border-[#222B3A] bg-[#0D1118]"
      >
        {SUB_TABS.map((tab) => {
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSubTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#D4AF37] text-[#090C11]'
                  : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'earnings' && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">Earnings Records</h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#E5C158]">
              {earnings.length} entries
            </span>
          </div>
          {earnings.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#9AA4B5]">
              No earnings credited yet. Claim daily VIP tasks, watch daily ads, or invite partners for 10% referral rewards.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Asset</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B2331]">
                  {earnings.map((row) => (
                    <tr key={row.id} className="hover:bg-[#141A25]">
                      <td className="px-5 py-3.5 font-medium text-[#E5C158] whitespace-nowrap">{row.type}</td>
                      <td className="px-5 py-3.5 text-[#F3EFE6]">{row.title}</td>
                      <td className="px-5 py-3.5 font-mono text-[#A6AEBD]">{row.asset || 'USD'}</td>
                      <td className="px-5 py-3.5 text-[#8D97A8] whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-300">
                        +{formatUsd(row.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeSubTab === 'deposits' && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">Deposit Records</h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#E5C158]">
              {deposits.length} entries
            </span>
          </div>
          {deposits.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#9AA4B5]">
              No deposit submissions yet. Submit a Nagad, Binance P2P, or Trust Wallet transfer to fund your VIP tier.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Plan / Asset</th>
                    <th className="px-5 py-3 font-medium">Method</th>
                    <th className="px-5 py-3 font-medium">Transaction ID</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B2331]">
                  {deposits.map((dep) => (
                    <tr key={dep.id} className="hover:bg-[#141A25]">
                      <td className="px-5 py-3.5 text-[#F3EFE6]">
                        <p className="font-medium">{dep.planName ?? 'Wallet Deposit'}</p>
                        <p className="text-[11px] text-[#8D97A8]">{dep.selectedAsset}</p>
                      </td>
                      <td className="px-5 py-3.5 text-[#B8C0CE]">{dep.paymentMethodName}</td>
                      <td className="px-5 py-3.5 font-mono text-[#A6AEBD]">{dep.txId}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={
                            dep.status === 'Approved'
                              ? 'text-emerald-300 font-medium'
                              : dep.status === 'Rejected'
                                ? 'text-rose-300 font-medium'
                                : 'text-amber-300 font-medium'
                          }
                        >
                          {dep.status}
                        </span>
                        {dep.adminNote && (
                          <p className="text-[11px] text-[#8D97A8] mt-0.5">{dep.adminNote}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-[#F3EFE6]">
                        {formatUsd(dep.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeSubTab === 'tasks' && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">Task & Ad Records</h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#E5C158]">
              {tasks.length} entries
            </span>
          </div>
          {tasks.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#9AA4B5]">
              No daily trading tasks or ad rewards completed yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Task</th>
                    <th className="px-5 py-3 font-medium">Source · Asset</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B2331]">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-[#141A25]">
                      <td className="px-5 py-3.5 text-[#F3EFE6] font-medium">{task.taskTitle}</td>
                      <td className="px-5 py-3.5 text-[#B8C0CE]">
                        {task.planName} · {task.asset}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#8D97A8]">{task.taskDate}</td>
                      <td className="px-5 py-3.5 text-emerald-300 font-medium">{task.status}</td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-300">
                        +{formatUsd(task.rewardUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeSubTab === 'financial' && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">Financial Records</h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#E5C158]">
              {financial.length} entries
            </span>
          </div>
          {financial.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#9AA4B5]">
              No financial ledger movements recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B2331]">
                  {financial.map((row) => (
                    <tr key={row.id} className="hover:bg-[#141A25]">
                      <td
                        className={`px-5 py-3.5 font-medium whitespace-nowrap ${
                          row.category === 'Plan Expired' ? 'text-rose-300' : 'text-[#E5C158]'
                        }`}
                      >
                        {row.category}
                      </td>
                      <td className="px-5 py-3.5 text-[#F3EFE6]">
                        <p>{row.description}</p>
                        <p className="text-[11px] text-[#8D97A8] mt-0.5">
                          {new Date(row.createdAt).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={
                            row.status === 'Completed'
                              ? 'text-emerald-300'
                              : row.status === 'Rejected'
                                ? 'text-rose-300'
                                : 'text-amber-300'
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-mono tabular-nums font-semibold ${
                          row.category === 'Plan Expired'
                            ? 'text-[#9AA4B5]'
                            : row.direction === 'Credit'
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                        }`}
                      >
                        {row.category === 'Plan Expired'
                          ? formatUsd(row.amountUsd)
                          : `${row.direction === 'Credit' ? '+' : '-'}${formatUsd(row.amountUsd)}`}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#B8C0CE]">
                        {formatUsd(row.balanceAfterUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
