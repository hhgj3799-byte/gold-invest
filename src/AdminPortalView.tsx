import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Coins,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type {
  AdminUserSummary,
  DepositRecord,
  PaymentMethod,
  PlatformSettings,
  SupportedAsset,
  UserProfile,
  VipPlan,
  WithdrawalRecord,
} from '../types/platform';
import { formatUsd } from '../utils/investment';

interface AdminPortalViewProps {
  token: string | null;
  user: UserProfile | null;
  adminStatus: { hasAdmin: boolean; passcodeConfigured: boolean };
  onAdminAuthenticated: (token: string, payload: unknown) => void;
  onRefreshPublicConfig: () => Promise<void>;
}

interface AdminOverviewResponse {
  settings: PlatformSettings;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  plans: VipPlan[];
  paymentMethods: PaymentMethod[];
  admins: AdminUserSummary[];
  stats: {
    totalUsers: number;
    pendingDeposits: number;
    approvedVolumeUsd: number;
    activePositions: number;
  };
}

type AdminSection = 'approvals' | 'content' | 'plans-payments' | 'bonuses' | 'admins';

const ALL_ASSETS: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

export function AdminPortalView({
  token,
  user,
  adminStatus,
  onAdminAuthenticated,
  onRefreshPublicConfig,
}: AdminPortalViewProps) {
  const [section, setSection] = useState<AdminSection>('approvals');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Admin Login / Bootstrap form state
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<PlatformSettings | null>(null);

  // New Payment Method form
  const [newPmName, setNewPmName] = useState('');
  const [newPmNetwork, setNewPmNetwork] = useState('TRC-20 (Tron)');
  const [newPmAddress, setNewPmAddress] = useState('');
  const [newPmInstructions, setNewPmInstructions] = useState('');

  // New VIP Plan form
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSubtitle, setNewPlanSubtitle] = useState('');
  const [newPlanAmount, setNewPlanAmount] = useState('10');
  const [newPlanRate, setNewPlanRate] = useState('0.01');

  // Bonus distribution form
  const [bonusPercent, setBonusPercent] = useState('2');
  const [bonusTitle, setBonusTitle] = useState('Platform Surplus Trading Profit Bonus');

  // New Admin form
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const isAdmin = Boolean(token && user?.role === 'admin');

  const loadOverview = useCallback(async () => {
    if (!token || user?.role !== 'admin') return;
    setLoading(true);
    try {
      const data = await apiFetch<AdminOverviewResponse>('/api/admin/overview', { token });
      setOverview(data);
      setSettingsForm(data.settings);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load admin overview.',
      });
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (isAdmin) {
      loadOverview();
    }
  }, [isAdmin, loadOverview]);

  async function handleBootstrapAdmin(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/admin/bootstrap', {
        method: 'POST',
        body: {
          fullName: authName,
          email: authEmail,
          password: authPassword,
          passcode: authPasscode,
        },
      });
      onAdminAuthenticated(res.token, res);
      await onRefreshPublicConfig();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not initialize admin account.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/admin/login', {
        method: 'POST',
        body: {
          email: authEmail,
          password: authPassword,
          passcode: authPasscode,
        },
      });
      onAdminAuthenticated(res.token, res);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Admin authentication failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewDeposit(id: string, action: 'approve' | 'reject') {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/deposits/${id}/review`, {
        method: 'POST',
        token,
        body: { action },
      });
      setNotice({
        type: 'success',
        text: `Deposit ${action === 'approve' ? 'approved and activated' : 'rejected'}.`,
      });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update deposit.',
      });
    }
  }

  async function handleReviewWithdrawal(id: string, action: 'approve' | 'reject') {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/withdrawals/${id}/review`, {
        method: 'POST',
        token,
        body: { action },
      });
      setNotice({
        type: 'success',
        text: `Withdrawal ${action === 'approve' ? 'marked disbursed' : 'rejected & refunded'}.`,
      });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update withdrawal.',
      });
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!token || !settingsForm) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        token,
        body: settingsForm,
      });
      setNotice({ type: 'success', text: 'Dashboard content and platform rules updated live.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    }
  }

  async function handleUpdatePaymentMethod(pm: PaymentMethod) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/payment-methods/${pm.id}`, {
        method: 'PUT',
        token,
        body: pm,
      });
      setNotice({ type: 'success', text: `Updated payment method: ${pm.name}` });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update payment method.',
      });
    }
  }

  async function handleAddPaymentMethod(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/payment-methods', {
        method: 'POST',
        token,
        body: {
          name: newPmName,
          network: newPmNetwork,
          walletAddress: newPmAddress,
          instructions: newPmInstructions,
        },
      });
      setNewPmName('');
      setNewPmAddress('');
      setNewPmInstructions('');
      setNotice({ type: 'success', text: 'New TRC-20 payment method added.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add payment method.',
      });
    }
  }

  async function handleDeletePaymentMethod(id: string) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/payment-methods/${id}`, { method: 'DELETE', token });
      setNotice({ type: 'success', text: 'Payment method removed.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove payment method.',
      });
    }
  }

  async function handleUpdatePlan(plan: VipPlan) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        token,
        body: plan,
      });
      setNotice({ type: 'success', text: `Saved changes to ${plan.name}.` });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save plan.',
      });
    }
  }

  async function handleAddPlan(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/plans', {
        method: 'POST',
        token,
        body: {
          tierNumber: (overview?.plans.length ?? 5) + 1,
          name: newPlanName,
          subtitle: newPlanSubtitle,
          amountUsd: Number(newPlanAmount),
          dailyRatePerDollar: Number(newPlanRate),
          supportedAssets: ALL_ASSETS,
          durationLabel: 'No Fixed Duration',
        },
      });
      setNewPlanName('');
      setNewPlanSubtitle('');
      setNotice({ type: 'success', text: 'New VIP investment plan added.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add VIP plan.',
      });
    }
  }

  async function handleDistributeBonus(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    try {
      const res = await apiFetch<{ distributedCount: number; totalDistributedUsd: number }>(
        '/api/admin/bonuses/distribute',
        {
          method: 'POST',
          token,
          body: {
            bonusPercent: Number(bonusPercent),
            title: bonusTitle,
          },
        }
      );
      setNotice({
        type: 'success',
        text: `Distributed ${formatUsd(res.totalDistributedUsd)} extra trading bonus across ${res.distributedCount} active positions.`,
      });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to distribute bonus.',
      });
    }
  }

  async function handleRunDailyYield() {
    if (!token) return;
    setNotice(null);
    try {
      const res = await apiFetch<{ creditedCount: number }>('/api/admin/yield/run-daily', {
        method: 'POST',
        token,
      });
      setNotice({
        type: 'success',
        text: `Processed daily yield for ${res.creditedCount} pending active positions.`,
      });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to run daily yield.',
      });
    }
  }

  async function handleAddAdmin(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/admins', {
        method: 'POST',
        token,
        body: {
          fullName: newAdminName,
          email: newAdminEmail,
          password: newAdminPassword,
        },
      });
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNotice({ type: 'success', text: 'Administrator account added successfully.' });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add administrator.',
      });
    }
  }

  async function handleRevokeAdmin(id: string) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/admins/${id}`, { method: 'DELETE', token });
      setNotice({ type: 'success', text: 'Administrator role revoked.' });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke administrator.',
      });
    }
  }

  // Unauthenticated or non-admin view: Show Admin Login or First-Run Setup
  if (!isAdmin) {
    const isBootstrap = !adminStatus.hasAdmin;

    return (
      <div className="max-w-lg mx-auto py-4">
        <div className="rounded-2xl border border-[#252F42] bg-[#10151E] p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 flex items-center justify-center text-[#E5C158]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#F3EFE6]">
                {isBootstrap ? 'Initialize Primary Admin' : 'Admin Portal Login'}
              </h1>
              <p className="text-xs text-[#9AA4B5]">
                {isBootstrap
                  ? 'First-run setup: claim the primary administrator account for this platform.'
                  : 'Authorized administrator access for deposit verification and platform CMS.'}
              </p>
            </div>
          </div>

          {notice && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              {notice.text}
            </div>
          )}

          <form
            onSubmit={isBootstrap ? handleBootstrapAdmin : handleAdminLogin}
            className="space-y-4"
          >
            {isBootstrap && (
              <div>
                <label htmlFor="admin-name" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Administrator Full Name
                </label>
                <input
                  id="admin-name"
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Operations Lead"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Admin Gmail Address
              </label>
              <input
                id="admin-email"
                type="email"
                required={!adminStatus.passcodeConfigured}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="admin@gmail.com"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Admin Password
              </label>
              <input
                id="admin-password"
                type="password"
                required={!adminStatus.passcodeConfigured}
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {adminStatus.passcodeConfigured && (
              <div>
                <label htmlFor="admin-passcode" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                  Admin Passcode (Configured in Environment)
                </label>
                <input
                  id="admin-passcode"
                  type="password"
                  value={authPasscode}
                  onChange={(e) => setAuthPasscode(e.target.value)}
                  placeholder="Enter environment passcode"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm transition-colors cursor-pointer"
            >
              {loading
                ? 'Authenticating...'
                : isBootstrap
                  ? 'Initialize Admin Account'
                  : 'Sign In to Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">Admin Control Center</h1>
          <p className="text-sm text-[#9AA4B5] mt-0.5">
            Verify TRC-20 deposits, manage dynamic dashboard content, plans, payment wallets, and multi-admin access.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#2D384B] text-xs font-medium text-[#F3EFE6] inline-flex items-center gap-2 hover:border-[#D4AF37] self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Pending Deposits</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-300 mt-1">
              {overview.stats.pendingDeposits}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Approved Volume</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158] mt-1">
              {formatUsd(overview.stats.approvedVolumeUsd)}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Active VIP Positions</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
              {overview.stats.activePositions}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Verified Investors</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#F3EFE6] mt-1">
              {overview.stats.totalUsers}
            </p>
          </div>
        </div>
      )}

      {/* Admin Sub-Nav */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl border border-[#222B3A] bg-[#0D1118]">
        {[
          { id: 'approvals' as const, label: 'Approvals Queue' },
          { id: 'content' as const, label: 'Dashboard Content' },
          { id: 'plans-payments' as const, label: 'Plans & Wallets' },
          { id: 'bonuses' as const, label: 'Bonuses & Yield' },
          { id: 'admins' as const, label: 'Multi-Admin' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              section === tab.id
                ? 'bg-[#D4AF37] text-[#090C11]'
                : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* SECTION 1: Deposit & Withdrawal Approvals */}
      {section === 'approvals' && overview && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Deposit Verification Queue</h2>
              <span className="text-xs text-[#9AA4B5]">{overview.deposits.length} total</span>
            </div>
            {overview.deposits.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#9AA4B5]">No deposit submissions yet.</p>
            ) : (
              <div className="divide-y divide-[#1D2533]">
                {overview.deposits.map((dep) => (
                  <div
                    key={dep.id}
                    data-testid={`admin-deposit-row-${dep.id}`}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#F3EFE6]">{dep.userEmail}</span>
                        <span aria-hidden="true" className="text-[#546075]">·</span>
                        <span className="text-[#E5C158] font-medium">
                          {dep.planName ?? 'Wallet Top-Up'} ({dep.selectedAsset})
                        </span>
                        <span aria-hidden="true" className="text-[#546075]">·</span>
                        <span className="text-[#9AA4B5]">{dep.paymentMethodName}</span>
                      </div>
                      <p className="font-mono text-xs text-[#D8DEE9] break-all">
                        TxID: <span className="text-[#E5C158]">{dep.txId}</span>
                      </p>
                      <p className="text-[11px] text-[#8D97A8]">
                        Submitted {new Date(dep.createdAt).toLocaleString()}
                        {dep.senderNote ? ` · Note: ${dep.senderNote}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <span className="font-mono tabular-nums text-base font-bold text-[#F3EFE6]">
                        {formatUsd(dep.amountUsd)}
                      </span>
                      {dep.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewDeposit(dep.id, 'approve')}
                            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewDeposit(dep.id, 'reject')}
                            className="min-h-[40px] px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            dep.status === 'Approved' ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {dep.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736]">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Withdrawal Requests</h2>
            </div>
            {overview.withdrawals.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#9AA4B5]">No withdrawal requests yet.</p>
            ) : (
              <div className="divide-y divide-[#1D2533]">
                {overview.withdrawals.map((wd) => (
                  <div
                    key={wd.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-[#F3EFE6]">
                        {wd.userEmail} · {wd.paymentMethodName}
                      </p>
                      <p className="font-mono text-xs text-[#A6AEBD] break-all">{wd.walletAddress}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono tabular-nums font-bold text-[#E5C158]">
                        {formatUsd(wd.amountUsd)}
                      </span>
                      {wd.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(wd.id, 'approve')}
                            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(wd.id, 'reject')}
                            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-rose-500/40 text-rose-200 text-xs font-semibold cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            wd.status === 'Approved' ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {wd.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 2: Dynamic Dashboard Content CMS */}
      {section === 'content' && settingsForm && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-[#1E2736] pb-3">
            <Sliders className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-base font-semibold text-[#F3EFE6]">
              Dynamic Dashboard Content & Rules
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cms-brand" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Platform Brand Name
              </label>
              <input
                id="cms-brand"
                type="text"
                value={settingsForm.brandName}
                onChange={(e) => setSettingsForm({ ...settingsForm, brandName: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-tagline" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Brand Tagline
              </label>
              <input
                id="cms-tagline"
                type="text"
                value={settingsForm.brandTagline}
                onChange={(e) => setSettingsForm({ ...settingsForm, brandTagline: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="cms-headline" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Hero Headline
              </label>
              <input
                id="cms-headline"
                type="text"
                value={settingsForm.heroHeadline}
                onChange={(e) => setSettingsForm({ ...settingsForm, heroHeadline: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="cms-subheadline" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Hero Subheadline
              </label>
              <textarea
                id="cms-subheadline"
                rows={2}
                value={settingsForm.heroSubheadline}
                onChange={(e) => setSettingsForm({ ...settingsForm, heroSubheadline: e.target.value })}
                className="w-full rounded-xl border border-[#242E3F] bg-[#090C11] p-3 text-sm text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="cms-announcement" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Top Announcement Banner
              </label>
              <input
                id="cms-announcement"
                type="text"
                value={settingsForm.announcementBanner}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, announcementBanner: e.target.value })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="cms-bonus-notice" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Extra Profit Trading Bonus Notice
              </label>
              <input
                id="cms-bonus-notice"
                type="text"
                value={settingsForm.extraBonusNotice}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, extraBonusNotice: e.target.value })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-support-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Support Email
              </label>
              <input
                id="cms-support-email"
                type="email"
                value={settingsForm.supportEmail}
                onChange={(e) => setSettingsForm({ ...settingsForm, supportEmail: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-telegram" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Official Telegram URL
              </label>
              <input
                id="cms-telegram"
                type="url"
                value={settingsForm.telegramUrl}
                onChange={(e) => setSettingsForm({ ...settingsForm, telegramUrl: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-min-wd" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Minimum Withdrawal (USD)
              </label>
              <input
                id="cms-min-wd"
                type="number"
                step="0.1"
                value={settingsForm.minWithdrawalUsd}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, minWithdrawalUsd: Number(e.target.value) })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-ref-pct" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Referral Commission (%)
              </label>
              <input
                id="cms-ref-pct"
                type="number"
                step="1"
                value={settingsForm.referralCommissionPct}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    referralCommissionPct: Number(e.target.value),
                  })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold cursor-pointer"
          >
            Save Dynamic Content
          </button>
        </form>
      )}

      {/* SECTION 3: Payment Methods & VIP Plans CRUD */}
      {section === 'plans-payments' && overview && (
        <div className="space-y-8">
          {/* Payment Methods */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[#F3EFE6]">Manage TRC-20 Payment Methods</h2>
            <div className="space-y-4">
              {overview.paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                >
                  <div className="md:col-span-3">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Method Name</label>
                    <input
                      type="text"
                      value={pm.name}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                paymentMethods: prev.paymentMethods.map((item) =>
                                  item.id === pm.id ? { ...item, name: e.target.value } : item
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Wallet Address</label>
                    <input
                      type="text"
                      value={pm.walletAddress}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                paymentMethods: prev.paymentMethods.map((item) =>
                                  item.id === pm.id ? { ...item, walletAddress: e.target.value } : item
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Status</label>
                    <select
                      value={pm.isActive ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                paymentMethods: prev.paymentMethods.map((item) =>
                                  item.id === pm.id
                                    ? { ...item, isActive: e.target.value === 'active' }
                                    : item
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2.5 text-xs text-[#F3EFE6]"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Disabled</option>
                    </select>
                  </div>
                  <div className="md:col-span-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdatePaymentMethod(pm)}
                      className="flex-1 min-h-[40px] rounded-lg bg-[#D4AF37] text-[#090C11] text-xs font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${pm.name}`}
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      className="min-h-[40px] min-w-[40px] rounded-lg border border-rose-500/40 text-rose-300 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddPaymentMethod}
              className="rounded-xl border border-dashed border-[#2F3B50] p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">New Method Name</label>
                <input
                  type="text"
                  required
                  value={newPmName}
                  onChange={(e) => setNewPmName(e.target.value)}
                  placeholder="e.g. OKX (USDT TRC-20)"
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Network</label>
                <input
                  type="text"
                  required
                  value={newPmNetwork}
                  onChange={(e) => setNewPmNetwork(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">TRC-20 Address</label>
                <input
                  type="text"
                  required
                  value={newPmAddress}
                  onChange={(e) => setNewPmAddress(e.target.value)}
                  placeholder="T..."
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Payment Method</span>
              </button>
            </form>
          </section>

          {/* VIP Plans */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[#F3EFE6]">Manage Active VIP Investment Plans</h2>
            <div className="space-y-4">
              {overview.plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                >
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Tier Name</label>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id ? { ...p, name: e.target.value } : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={plan.subtitle}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id ? { ...p, subtitle: e.target.value } : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Amount (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={plan.amountUsd}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id ? { ...p, amountUsd: Number(e.target.value) } : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Daily / $1</label>
                    <input
                      type="number"
                      step="0.001"
                      value={plan.dailyRatePerDollar}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id
                                    ? { ...p, dailyRatePerDollar: Number(e.target.value) }
                                    : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Active</label>
                    <select
                      value={plan.isActive ? 'yes' : 'no'}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id ? { ...p, isActive: e.target.value === 'yes' } : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 text-xs text-[#F3EFE6]"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => handleUpdatePlan(plan)}
                      className="w-full min-h-[40px] rounded-lg bg-[#D4AF37] text-[#090C11] text-xs font-semibold cursor-pointer"
                    >
                      Save Plan
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddPlan}
              className="rounded-xl border border-dashed border-[#2F3B50] p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="VIP 6"
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Subtitle</label>
                <input
                  type="text"
                  value={newPlanSubtitle}
                  onChange={(e) => setNewPlanSubtitle(e.target.value)}
                  placeholder="Institutional Tier"
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newPlanAmount}
                  onChange={(e) => setNewPlanAmount(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Daily / $1</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={newPlanRate}
                  onChange={(e) => setNewPlanRate(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Plan</span>
              </button>
            </form>
          </section>
        </div>
      )}

      {/* SECTION 4: Extra Profit Bonuses & Daily Yield */}
      {section === 'bonuses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleDistributeBonus}
            className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">
                Distribute Extra Profit Trading Bonus
              </h2>
            </div>
            <p className="text-xs text-[#9AA4B5] leading-relaxed">
              Credit an additional surplus trading profit bonus across all active VIP investment positions.
            </p>
            <div>
              <label htmlFor="bonus-title" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Bonus Distribution Title
              </label>
              <input
                id="bonus-title"
                type="text"
                required
                value={bonusTitle}
                onChange={(e) => setBonusTitle(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="bonus-pct" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Bonus Percentage of Invested Principal (%)
              </label>
              <input
                id="bonus-pct"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                required
                value={bonusPercent}
                onChange={(e) => setBonusPercent(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6]"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold cursor-pointer"
            >
              Distribute Extra Profit Bonus Now
            </button>
          </form>

          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Batch Daily Yield Settlement</h2>
              <p className="text-xs text-[#9AA4B5] leading-relaxed">
                Credit today&apos;s fixed $0.01 per $1 daily income for every active VIP position that has not yet claimed today&apos;s task.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunDailyYield}
              className="w-full min-h-[44px] rounded-xl border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-sm font-semibold transition-colors cursor-pointer"
            >
              Run Daily Yield Batch
            </button>
          </section>
        </div>
      )}

      {/* SECTION 5: Multi-Admin Support */}
      {section === 'admins' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Active Administrators</h2>
              <span className="text-xs text-[#9AA4B5]">{overview.admins.length} accounts</span>
            </div>
            <div className="divide-y divide-[#1D2533]">
              {overview.admins.map((admin) => (
                <div key={admin.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#F3EFE6]">{admin.fullName}</p>
                    <p className="font-mono text-xs text-[#9AA4B5]">{admin.email}</p>
                  </div>
                  {admin.id === user?.id ? (
                    <span className="text-xs text-[#E5C158] font-medium">Current Session</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeAdmin(admin.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 text-xs font-medium cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <form
            onSubmit={handleAddAdmin}
            className="lg:col-span-5 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">Add New Administrator</h2>
            </div>
            <div>
              <label htmlFor="new-admin-name" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Full Name
              </label>
              <input
                id="new-admin-name"
                type="text"
                required
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Compliance Officer"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="new-admin-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Gmail Address (@gmail.com)
              </label>
              <input
                id="new-admin-email"
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="co-admin@gmail.com"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="new-admin-pass" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Initial Password
              </label>
              <input
                id="new-admin-pass"
                type="password"
                required
                minLength={6}
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold cursor-pointer"
            >
              Create Administrator
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
