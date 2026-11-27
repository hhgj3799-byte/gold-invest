import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Coins,
  Copy,
  Download,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sliders,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import type {
  ActivationRequest,
  ActivityLogCategory,
  ActivityLogRecord,
  AdminManagedUser,
  AdminUserSummary,
  DailyAdItem,
  DepositRecord,
  DirectMessage,
  PaymentMethod,
  PlatformSettings,
  SupportedAsset,
  UserProfile,
  VipPlan,
  WithdrawalRecord,
} from '../types/platform';
import {
  MAX_PLAN_AMOUNT_USD,
  formatDurationLabel,
  formatUsd,
  sanitizeDurationDays,
} from '../utils/investment';

interface AdminPortalViewProps {
  token: string | null;
  user: UserProfile | null;
  adminStatus: { hasAdmin: boolean; passcodeConfigured: boolean };
  onAdminAuthenticated: (token: string, payload: unknown) => void;
  onRefreshPublicConfig: () => Promise<void>;
}

interface AdminOverviewResponse {
  settings: PlatformSettings;
  activations: ActivationRequest[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  plans: VipPlan[];
  paymentMethods: PaymentMethod[];
  ads: DailyAdItem[];
  users: AdminManagedUser[];
  messages: DirectMessage[];
  admins: AdminUserSummary[];
  activityLogs: ActivityLogRecord[];
  stats: {
    totalUsers: number;
    pendingActivations: number;
    pendingDeposits: number;
    pendingWithdrawals: number;
    unreadMessages: number;
    approvedVolumeUsd: number;
    activePositions: number;
  };
}

type AdminSection =
  | 'approvals'
  | 'users'
  | 'plans-payments'
  | 'ads'
  | 'content'
  | 'bonuses'
  | 'messages'
  | 'logs'
  | 'admins';

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

  // Admin Login / Bootstrap state
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');

  // CMS Settings state
  const [settingsForm, setSettingsForm] = useState<PlatformSettings | null>(null);

  // New Payment Method
  const [newPmName, setNewPmName] = useState('');
  const [newPmNetwork, setNewPmNetwork] = useState('P2P / USDT');
  const [newPmAddress, setNewPmAddress] = useState('');
  const [newPmInstructions, setNewPmInstructions] = useState('');

  // New VIP Plan
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSubtitle, setNewPlanSubtitle] = useState('');
  const [newPlanAmount, setNewPlanAmount] = useState('10');
  const [newPlanRate, setNewPlanRate] = useState('0.01');
  const [newPlanMonthlyRate, setNewPlanMonthlyRate] = useState('0.20');
  const [newPlanDurationDays, setNewPlanDurationDays] = useState('30');

  // New Ad
  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdDesc, setNewAdDesc] = useState('');
  const [newAdUrl, setNewAdUrl] = useState('https://t.me/aurumcapital_official');
  const [newAdReward, setNewAdReward] = useState('0.02');
  const [newAdDuration, setNewAdDuration] = useState('5');

  // Direct Message reply drafts keyed by userId
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Bonus distribution
  const [bonusPercent, setBonusPercent] = useState('2');
  const [bonusTitle, setBonusTitle] = useState('Platform Surplus Trading Profit Bonus');

  // New Admin
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Admin User Credential Recovery / Reset
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);
  const [passwordResetDrafts, setPasswordResetDrafts] = useState<Record<string, string>>({});
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<string | null>(null);

  // Activity Logs filter & CSV export
  const [logCategoryFilter, setLogCategoryFilter] = useState<'All' | ActivityLogCategory>('All');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

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

  async function handleReviewActivation(id: string, action: 'approve' | 'reject') {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/activations/${id}/review`, {
        method: 'POST',
        token,
        body: { action },
      });
      setNotice({
        type: 'success',
        text: `Account activation ${action === 'approve' ? 'approved' : 'rejected'}.`,
      });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to review activation.',
      });
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

  async function handleToggleUserStatus(
    userId: string,
    patch: { isBlocked?: boolean; fundsFrozen?: boolean; activationStatus?: 'Activated' | 'Unpaid' }
  ) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        token,
        body: patch,
      });
      setNotice({ type: 'success', text: 'User security controls updated.' });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update user status.',
      });
    }
  }

  async function handleCopyCredential(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredential(key);
      setTimeout(() => setCopiedCredential((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      setNotice({ type: 'error', text: 'Could not copy to clipboard.' });
    }
  }

  async function handleSetUserPassword(userId: string) {
    if (!token) return;
    const nextPassword = (passwordResetDrafts[userId] ?? '').trim();
    if (nextPassword.length < 6) {
      setNotice({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        token,
        body: { newPassword: nextPassword },
      });
      setPasswordResetDrafts((prev) => ({ ...prev, [userId]: '' }));
      setEditingPasswordUserId(null);
      setRevealedPasswords((prev) => ({ ...prev, [userId]: true }));
      setNotice({ type: 'success', text: 'User password updated and available for recovery.' });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update user password.',
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
      setNotice({ type: 'success', text: 'Payment method added.' });
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
    if (!Number.isFinite(plan.amountUsd) || plan.amountUsd <= 0 || plan.amountUsd > MAX_PLAN_AMOUNT_USD) {
      setNotice({
        type: 'error',
        text: `Plan amount must be between $0.01 and $${MAX_PLAN_AMOUNT_USD.toFixed(2)}.`,
      });
      return;
    }
    const safeDays = sanitizeDurationDays(plan.durationDays, 30);
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        token,
        body: {
          ...plan,
          durationDays: safeDays,
          durationLabel: formatDurationLabel(safeDays),
        },
      });
      setNotice({
        type: 'success',
        text: `Saved changes to ${plan.name} (${formatDurationLabel(safeDays)}).`,
      });
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
    const parsedAmount = Number(newPlanAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > MAX_PLAN_AMOUNT_USD) {
      setNotice({
        type: 'error',
        text: `Maximum VIP plan amount is $${MAX_PLAN_AMOUNT_USD.toFixed(2)}.`,
      });
      return;
    }
    const safeDays = sanitizeDurationDays(Number(newPlanDurationDays), 30);
    try {
      await apiFetch('/api/admin/plans', {
        method: 'POST',
        token,
        body: {
          tierNumber: (overview?.plans.length ?? 8) + 1,
          name: newPlanName,
          subtitle: newPlanSubtitle,
          amountUsd: parsedAmount,
          dailyRatePerDollar: Number(newPlanRate),
          monthlyRatePerDollar: Number(newPlanMonthlyRate),
          supportedAssets: ALL_ASSETS,
          durationDays: safeDays,
          durationLabel: formatDurationLabel(safeDays),
        },
      });
      setNewPlanName('');
      setNewPlanSubtitle('');
      setNewPlanAmount('10');
      setNewPlanDurationDays('30');
      setNotice({
        type: 'success',
        text: `New VIP investment plan added (${formatDurationLabel(safeDays)}).`,
      });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add VIP plan.',
      });
    }
  }

  async function handleAddAd(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/ads', {
        method: 'POST',
        token,
        body: {
          title: newAdTitle,
          description: newAdDesc,
          targetUrl: newAdUrl,
          rewardUsd: Number(newAdReward),
          durationSeconds: Number(newAdDuration),
        },
      });
      setNewAdTitle('');
      setNewAdDesc('');
      setNotice({ type: 'success', text: 'Daily advertisement campaign created.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add advertisement.',
      });
    }
  }

  async function handleUpdateAd(ad: DailyAdItem) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, {
        method: 'PUT',
        token,
        body: ad,
      });
      setNotice({
        type: 'success',
        text: `Saved ${ad.title} (${ad.isActive ? 'Active' : 'Disabled / Off'}).`,
      });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update advertisement.',
      });
    }
  }

  async function handleToggleSingleAd(ad: DailyAdItem) {
    await handleUpdateAd({ ...ad, isActive: !ad.isActive });
  }

  async function handleToggleAllAds(isActive: boolean) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch('/api/admin/ads/toggle-all', {
        method: 'POST',
        token,
        body: { isActive },
      });
      setNotice({
        type: 'success',
        text: isActive ? 'All daily ads enabled.' : 'All daily ads turned off.',
      });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update ad status.',
      });
    }
  }

  async function handleDeleteAd(id: string) {
    if (!token) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/ads/${id}`, { method: 'DELETE', token });
      setNotice({ type: 'success', text: 'Advertisement removed.' });
      await Promise.all([loadOverview(), onRefreshPublicConfig()]);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete advertisement.',
      });
    }
  }

  async function handleSendReply(targetUserId: string) {
    if (!token) return;
    const text = (replyDrafts[targetUserId] ?? '').trim();
    if (!text) return;
    setNotice(null);
    try {
      await apiFetch(`/api/admin/messages/${targetUserId}/reply`, {
        method: 'POST',
        token,
        body: { body: text },
      });
      setReplyDrafts((prev) => ({ ...prev, [targetUserId]: '' }));
      setNotice({ type: 'success', text: 'Reply sent to user inbox.' });
      await loadOverview();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send reply.',
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
        text: `Distributed ${formatUsd(res.totalDistributedUsd)} bonus across ${res.distributedCount} active positions.`,
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
        text: `Processed daily yield for ${res.creditedCount} active positions.`,
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
      setNotice({ type: 'success', text: 'Administrator controller added successfully.' });
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

  async function handleExportActivityLogsCsv() {
    if (!token) return;
    setNotice(null);
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (logCategoryFilter !== 'All') {
        params.set('category', logCategoryFilter);
      }
      const trimmedSearch = logSearchQuery.trim();
      if (trimmedSearch) {
        params.set('q', trimmedSearch);
      }
      const queryString = params.toString();
      const url = `/api/admin/activity-logs/export${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errPayload?.error || 'Failed to export activity logs CSV.');
      }

      const csvText = await response.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      setNotice({
        type: 'success',
        text: 'Activity logs exported to CSV successfully.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export activity logs CSV.',
      });
    } finally {
      setExportingCsv(false);
    }
  }

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
                  ? 'First-run setup: claim the primary administrator controller account.'
                  : 'Authorized administrator access for activations, deposits, users, ads, and controllers.'}
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
                Admin Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                required={!adminStatus.passcodeConfigured}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="admin@example.com"
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
            Verify 40 BDT activations, review P2P & USDT transactions, manage users, daily ads, and multi-admin controllers.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#2D384B] text-xs font-medium text-[#F3EFE6] inline-flex items-center gap-2 hover:border-[#D4AF37] self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Pending Activations</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158] mt-1">
              {overview.stats.pendingActivations}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Pending Deposits</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-300 mt-1">
              {overview.stats.pendingDeposits}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Pending Withdrawals</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-200 mt-1">
              {overview.stats.pendingWithdrawals}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Unread Messages</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-sky-300 mt-1">
              {overview.stats.unreadMessages}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Approved Volume</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
              {formatUsd(overview.stats.approvedVolumeUsd)}
            </p>
          </div>
          <div className="rounded-xl border border-[#222B3A] bg-[#10151E] p-4">
            <p className="text-xs text-[#9AA4B5]">Registered Users</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#F3EFE6] mt-1">
              {overview.stats.totalUsers}
            </p>
          </div>
        </div>
      )}

      {/* Admin Sub-Nav */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl border border-[#222B3A] bg-[#0D1118]">
        {[
          {
            id: 'approvals' as const,
            label: `Approvals (${(overview?.stats.pendingActivations ?? 0) + (overview?.stats.pendingDeposits ?? 0)})`,
          },
          { id: 'users' as const, label: 'Users, IDs & Passwords' },
          { id: 'plans-payments' as const, label: 'Numbers & VIP ($1–$10)' },
          { id: 'ads' as const, label: 'Daily Ads' },
          { id: 'content' as const, label: 'CMS & Fees' },
          { id: 'bonuses' as const, label: 'Bonuses & Yield' },
          { id: 'messages' as const, label: `Messages (${overview?.stats.unreadMessages ?? 0})` },
          { id: 'logs' as const, label: `Activity Logs (${overview?.activityLogs?.length ?? 0})` },
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

      {/* SECTION 1: Activations, Deposits & Withdrawals */}
      {section === 'approvals' && overview && (
        <div className="space-y-6">
          {/* Account Activation Notifications */}
          <section className="rounded-2xl border border-[#D4AF37]/40 bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#E5C158]">
                Account Activation Notifications (40 BDT / $0.40)
              </h2>
              <span className="text-xs text-[#9AA4B5]">
                {overview.stats.pendingActivations} pending
              </span>
            </div>
            {overview.activations.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#9AA4B5]">
                No account activation submissions yet.
              </p>
            ) : (
              <div className="divide-y divide-[#1D2533]">
                {overview.activations.map((act) => (
                  <div
                    key={act.id}
                    data-testid={`admin-activation-row-${act.id}`}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#F3EFE6]">{act.userEmail}</span>
                        <span aria-hidden="true" className="text-[#546075]">·</span>
                        <span className="font-mono text-[#9AA4B5]">{act.userPhone}</span>
                        <span aria-hidden="true" className="text-[#546075]">·</span>
                        <span className="text-[#E5C158]">{act.paymentMethodName}</span>
                      </div>
                      <p className="font-mono text-xs text-[#D8DEE9] break-all">
                        TxID: <span className="text-[#E5C158]">{act.txId}</span> · {act.amountLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {act.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewActivation(act.id, 'approve')}
                            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Activate Account</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewActivation(act.id, 'reject')}
                            className="min-h-[40px] px-4 py-2 rounded-lg border border-rose-500/40 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            act.status === 'Approved' ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {act.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Deposit Queue */}
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

          {/* Withdrawal Queue */}
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

      {/* SECTION 2: Users Management (IDs, Recoverable Passwords, Block / Unblock & Freeze / Unfreeze Funds) */}
      {section === 'users' && overview && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1E2736] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#F3EFE6]">
                User IDs, Login Passwords & Account Controls
              </h2>
              <p className="text-xs text-[#9AA4B5] mt-0.5">
                View or copy any user&apos;s ID and password for forgotten-password recovery, or reset passwords directly.
              </p>
            </div>
            <span className="text-xs text-[#9AA4B5]">{overview.users.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                <tr>
                  <th className="px-4 py-3 font-medium">User / Login ID</th>
                  <th className="px-4 py-3 font-medium">Saved Password</th>
                  <th className="px-4 py-3 font-medium">Activation</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium text-right">Invested</th>
                  <th className="px-4 py-3 font-medium text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B2331]">
                {overview.users.map((u) => {
                  const isRevealed = Boolean(revealedPasswords[u.id]);
                  const isEditingPwd = editingPasswordUserId === u.id;
                  return (
                    <tr key={u.id} data-testid={`admin-user-row-${u.id}`} className="hover:bg-[#141A25]">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-[#F3EFE6]">
                          {u.fullName} {u.role === 'admin' ? '(Admin)' : ''}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[#E5C158]">{u.email}</span>
                          <button
                            type="button"
                            aria-label={`Copy login email for ${u.fullName}`}
                            onClick={() => handleCopyCredential(u.email, `email-${u.id}`)}
                            className="text-[#8D97A8] hover:text-[#E5C158] cursor-pointer"
                          >
                            {copiedCredential === `email-${u.id}` ? (
                              <Check className="w-3 h-3 text-emerald-300" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px] text-[#8D97A8] whitespace-nowrap">
                          <span>ID: {u.id.slice(0, 8)}...</span>
                          <button
                            type="button"
                            aria-label={`Copy user ID for ${u.fullName}`}
                            onClick={() => handleCopyCredential(u.id, `id-${u.id}`)}
                            className="hover:text-[#F3EFE6] cursor-pointer"
                          >
                            {copiedCredential === `id-${u.id}` ? (
                              <Check className="w-3 h-3 text-emerald-300" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span>{u.phoneNumber || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 min-w-[210px]">
                        {u.role === 'admin' ? (
                          <span className="text-[11px] text-[#8D97A8]">Protected (Admin)</span>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {u.savedPassword ? (
                                <>
                                  <span
                                    data-testid={`user-password-${u.id}`}
                                    className="font-mono text-xs text-[#F3EFE6] bg-[#090C11] border border-[#242E3F] rounded px-2 py-1"
                                  >
                                    {isRevealed ? u.savedPassword : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`${isRevealed ? 'Hide' : 'Show'} password for ${u.email}`}
                                    onClick={() =>
                                      setRevealedPasswords((prev) => ({
                                        ...prev,
                                        [u.id]: !prev[u.id],
                                      }))
                                    }
                                    className="min-h-[28px] px-2 rounded border border-[#2D384B] text-[#B8C0CE] hover:border-[#D4AF37] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    {isRevealed ? (
                                      <EyeOff className="w-3 h-3" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                    <span>{isRevealed ? 'Hide' : 'Show'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Copy password for ${u.email}`}
                                    onClick={() =>
                                      handleCopyCredential(u.savedPassword!, `pwd-${u.id}`)
                                    }
                                    className="min-h-[28px] px-2 rounded border border-[#2D384B] text-[#E5C158] hover:border-[#D4AF37] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    {copiedCredential === `pwd-${u.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-300" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] text-amber-300">Not saved yet</span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingPasswordUserId(isEditingPwd ? null : u.id)
                                }
                                className="min-h-[28px] px-2 rounded border border-[#2D384B] text-[#9AA4B5] hover:text-[#F3EFE6] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>{u.savedPassword ? 'Reset' : 'Set'}</span>
                              </button>
                            </div>
                            {isEditingPwd && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={passwordResetDrafts[u.id] ?? ''}
                                  onChange={(e) =>
                                    setPasswordResetDrafts((prev) => ({
                                      ...prev,
                                      [u.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="New password (6+ chars)"
                                  className="w-36 min-h-[30px] rounded border border-[#242E3F] bg-[#090C11] px-2 font-mono text-[11px] text-[#F3EFE6]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSetUserPassword(u.id)}
                                  className="min-h-[30px] px-2.5 rounded bg-[#D4AF37] text-[#090C11] font-semibold text-[11px] cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={
                            u.activationStatus === 'Activated'
                              ? 'text-emerald-300 font-medium'
                              : u.activationStatus === 'Pending'
                                ? 'text-amber-300 font-medium'
                                : 'text-rose-300 font-medium'
                          }
                        >
                          {u.activationStatus}
                        </span>
                        {u.isBlocked && <p className="text-rose-300 font-semibold mt-0.5">BLOCKED</p>}
                        {u.fundsFrozen && <p className="text-amber-300 font-semibold mt-0.5">FUNDS FROZEN</p>}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#E5C158] font-semibold">
                        {formatUsd(u.balanceUsd)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#F3EFE6]">
                        {formatUsd(u.totalInvestedUsd)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          {u.activationStatus !== 'Activated' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleUserStatus(u.id, { activationStatus: 'Activated' })
                              }
                              className="min-h-[34px] px-2.5 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </button>
                          )}
                          {u.role !== 'admin' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u.id, { fundsFrozen: !u.fundsFrozen })}
                                className={`min-h-[34px] px-2.5 rounded-lg border inline-flex items-center gap-1 cursor-pointer ${
                                  u.fundsFrozen
                                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                                    : 'border-[#2D384B] text-[#B8C0CE] hover:border-amber-400'
                                }`}
                              >
                                {u.fundsFrozen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                <span>{u.fundsFrozen ? 'Unfreeze Funds' : 'Freeze Funds'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u.id, { isBlocked: !u.isBlocked })}
                                className={`min-h-[34px] px-2.5 rounded-lg border inline-flex items-center gap-1 cursor-pointer ${
                                  u.isBlocked
                                    ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                                    : 'border-rose-500/40 text-rose-300 hover:bg-rose-500/15'
                                }`}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>{u.isBlocked ? 'Unblock' : 'Block'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 3: Payment Numbers & VIP 1-7 Plans */}
      {section === 'plans-payments' && overview && (
        <div className="space-y-8">
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[#F3EFE6]">
              Modify Payment Numbers & Wallet Addresses (Nagad, Binance P2P, Trust Wallet TRC20/BEP20)
            </h2>
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
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Number / Pay ID / Address</label>
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
                  placeholder="e.g. Nagad P2P Agent"
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
                <label className="block text-[11px] text-[#8D97A8] mb-1">Number / Address</label>
                <input
                  type="text"
                  required
                  value={newPmAddress}
                  onChange={(e) => setNewPmAddress(e.target.value)}
                  placeholder="+8801... or T..."
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

          {/* VIP 1-7 Plans */}
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-[#F3EFE6]">
                Manage VIP Investment Tiers & Fixed Durations
              </h2>
              <p className="text-xs text-[#9AA4B5] mt-1">
                Set or update each tier&apos;s investment amount ($1–${MAX_PLAN_AMOUNT_USD} max), yield rates, and fixed duration in days (0 = no expiry).
              </p>
            </div>
            <div className="space-y-3">
              {overview.plans.map((plan) => (
                <div
                  key={plan.id}
                  data-testid={`admin-plan-row-${plan.id}`}
                  className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end"
                >
                  <div>
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
                  <div>
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Amount ($1–$10)</label>
                    <input
                      type="number"
                      min="0.01"
                      max={MAX_PLAN_AMOUNT_USD}
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
                  <div>
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Daily Rate/$1</label>
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
                  <div>
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Est. Monthly/$1</label>
                    <input
                      type="number"
                      step="0.01"
                      value={plan.monthlyRatePerDollar ?? 0.2}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id
                                    ? { ...p, monthlyRatePerDollar: Number(e.target.value) }
                                    : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`plan-duration-${plan.id}`}
                      className="block text-[11px] text-[#8D97A8] mb-1"
                    >
                      Duration (Days)
                    </label>
                    <input
                      id={`plan-duration-${plan.id}`}
                      type="number"
                      min="0"
                      max="3650"
                      step="1"
                      value={plan.durationDays ?? 30}
                      onChange={(e) => {
                        const nextDays = Math.max(0, Math.min(3650, Math.floor(Number(e.target.value) || 0)));
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id
                                    ? {
                                        ...p,
                                        durationDays: nextDays,
                                        durationLabel: formatDurationLabel(nextDays),
                                      }
                                    : p
                                ),
                              }
                            : prev
                        );
                      }}
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#E5C158]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Status</label>
                    <select
                      value={plan.isActive ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                plans: prev.plans.map((p) =>
                                  p.id === plan.id ? { ...p, isActive: e.target.value === 'active' } : p
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2.5 text-xs text-[#F3EFE6]"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Hidden</option>
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
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
              className="rounded-xl border border-dashed border-[#2F3B50] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">New VIP Name</label>
                <input
                  type="text"
                  required
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="VIP 8"
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Subtitle</label>
                <input
                  type="text"
                  required
                  value={newPlanSubtitle}
                  onChange={(e) => setNewPlanSubtitle(e.target.value)}
                  placeholder="Institutional Tier"
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Amount ($1–$10)</label>
                <input
                  type="number"
                  min="0.01"
                  max={MAX_PLAN_AMOUNT_USD}
                  step="0.01"
                  required
                  value={newPlanAmount}
                  onChange={(e) => setNewPlanAmount(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8D97A8] mb-1">Daily / Monthly/$1</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newPlanRate}
                    onChange={(e) => setNewPlanRate(e.target.value)}
                    className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 font-mono text-xs text-[#F3EFE6]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPlanMonthlyRate}
                    onChange={(e) => setNewPlanMonthlyRate(e.target.value)}
                    className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 font-mono text-xs text-[#F3EFE6]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="new-plan-duration" className="block text-[11px] text-[#8D97A8] mb-1">
                  Duration (Days)
                </label>
                <input
                  id="new-plan-duration"
                  type="number"
                  min="0"
                  max="3650"
                  step="1"
                  required
                  value={newPlanDurationDays}
                  onChange={(e) => setNewPlanDurationDays(e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#E5C158]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add VIP Plan</span>
              </button>
            </form>
          </section>
        </div>
      )}

      {/* SECTION 4: Daily Ads & Customizable Rewards */}
      {section === 'ads' && overview && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2736] pb-3">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-[#D4AF37]" />
              <div>
                <h2 className="text-base font-semibold text-[#F3EFE6]">
                  Manage Daily Ads, Custom Links & Rewards
                </h2>
                <p className="text-xs text-[#9AA4B5]">
                  Set custom ad links users click to watch (3s–60s), adjust rewards, or turn individual/all ads off.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleAllAds(true)}
                className="min-h-[36px] px-3 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15 text-xs font-semibold cursor-pointer"
              >
                Enable All Ads
              </button>
              <button
                type="button"
                onClick={() => handleToggleAllAds(false)}
                className="min-h-[36px] px-3 rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/15 text-xs font-semibold cursor-pointer"
              >
                Turn Off All Ads
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {overview.ads.map((ad) => (
              <div
                key={ad.id}
                data-testid={`admin-ad-row-${ad.id}`}
                className={`rounded-xl border p-4 space-y-3 ${
                  ad.isActive
                    ? 'border-[#1E2736] bg-[#0B0F17]'
                    : 'border-rose-500/30 bg-[#0D1017] opacity-80'
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Ad Title</label>
                    <input
                      type="text"
                      value={ad.title}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id ? { ...a, title: e.target.value } : a
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Custom Ad Link (URL)</label>
                    <input
                      type="text"
                      data-testid={`admin-ad-url-${ad.id}`}
                      value={ad.targetUrl}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id ? { ...a, targetUrl: e.target.value } : a
                                ),
                              }
                            : prev
                        )
                      }
                      placeholder="https://example.com/ad"
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#E5C158]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Reward (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ad.rewardUsd}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id ? { ...a, rewardUsd: Number(e.target.value) } : a
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Sec</label>
                    <input
                      type="number"
                      min="3"
                      max="60"
                      value={ad.durationSeconds}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id
                                    ? { ...a, durationSeconds: Number(e.target.value) }
                                    : a
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 font-mono text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Status</label>
                    <select
                      value={ad.isActive ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id ? { ...a, isActive: e.target.value === 'active' } : a
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2.5 text-xs text-[#F3EFE6]"
                    >
                      <option value="active">Active (On)</option>
                      <option value="inactive">Off (Disabled)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-7">
                    <label className="block text-[11px] text-[#8D97A8] mb-1">Description</label>
                    <input
                      type="text"
                      value={ad.description}
                      onChange={(e) =>
                        setOverview((prev) =>
                          prev
                            ? {
                                ...prev,
                                ads: prev.ads.map((a) =>
                                  a.id === ad.id ? { ...a, description: e.target.value } : a
                                ),
                              }
                            : prev
                        )
                      }
                      className="w-full min-h-[38px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#D8DEE9]"
                    />
                  </div>
                  <div className="md:col-span-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSingleAd(ad)}
                      className={`min-h-[38px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        ad.isActive
                          ? 'border-rose-500/40 text-rose-200 hover:bg-rose-500/15'
                          : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15'
                      }`}
                    >
                      {ad.isActive ? 'Turn Off' : 'Turn On'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateAd(ad)}
                      className="flex-1 min-h-[38px] rounded-lg bg-[#D4AF37] text-[#090C11] text-xs font-semibold cursor-pointer"
                    >
                      Save Ad
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${ad.title}`}
                      onClick={() => handleDeleteAd(ad.id)}
                      className="min-h-[38px] min-w-[38px] rounded-lg border border-rose-500/40 text-rose-300 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddAd}
            className="rounded-xl border border-dashed border-[#2F3B50] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-3">
              <label className="block text-[11px] text-[#8D97A8] mb-1">New Ad Title</label>
              <input
                type="text"
                required
                value={newAdTitle}
                onChange={(e) => setNewAdTitle(e.target.value)}
                placeholder="Gold Market Brief"
                className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] text-[#8D97A8] mb-1">Description</label>
              <input
                type="text"
                required
                value={newAdDesc}
                onChange={(e) => setNewAdDesc(e.target.value)}
                placeholder="View sponsored briefing"
                className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] text-[#8D97A8] mb-1">Custom Ad Link (URL)</label>
              <input
                type="text"
                value={newAdUrl}
                onChange={(e) => setNewAdUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 font-mono text-xs text-[#E5C158]"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[11px] text-[#8D97A8] mb-1">Reward</label>
              <input
                type="number"
                step="0.01"
                required
                value={newAdReward}
                onChange={(e) => setNewAdReward(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 font-mono text-xs text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[11px] text-[#8D97A8] mb-1">Sec</label>
              <input
                type="number"
                min="3"
                max="60"
                required
                value={newAdDuration}
                onChange={(e) => setNewAdDuration(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-[#242E3F] bg-[#090C11] px-2 font-mono text-xs text-[#F3EFE6]"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full min-h-[40px] rounded-lg border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ad</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* SECTION 5: Dynamic CMS & Fee Rules */}
      {section === 'content' && settingsForm && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-[#1E2736] pb-3">
            <Sliders className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-base font-semibold text-[#F3EFE6]">
              Platform Content, Activation Fees & Telegram Settings
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
              <label htmlFor="cms-telegram" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Official Telegram Group URL
              </label>
              <input
                id="cms-telegram"
                type="url"
                value={settingsForm.telegramUrl}
                onChange={(e) => setSettingsForm({ ...settingsForm, telegramUrl: e.target.value })}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
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
              <label htmlFor="cms-act-bdt" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Activation Fee (BDT)
              </label>
              <input
                id="cms-act-bdt"
                type="number"
                step="1"
                value={settingsForm.activationFeeBdt}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, activationFeeBdt: Number(e.target.value) })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="cms-act-usd" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Activation Fee (USD Cents)
              </label>
              <input
                id="cms-act-usd"
                type="number"
                step="0.01"
                value={settingsForm.activationFeeUsd}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, activationFeeUsd: Number(e.target.value) })
                }
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6]"
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
            Save Dynamic Settings
          </button>
        </form>
      )}

      {/* SECTION 6: Bonuses & Yield */}
      {section === 'bonuses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleDistributeBonus}
            className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base font-semibold text-[#F3EFE6]">
                Distribute Extra Profit Trading Bonus
              </h2>
            </div>
            <p className="text-xs text-[#9AA4B5] leading-relaxed">
              Credit an extra trading profit bonus across every active VIP $1–$10 position and log it in user Earnings and Financial ledgers.
            </p>
            <div>
              <label htmlFor="bonus-title" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Bonus Label
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
                Bonus Percentage of Active Principal (%)
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
              Distribute Extra Profit Bonus
            </button>
          </form>

          <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Daily Yield Settlement Batch</h2>
              <p className="text-xs text-[#9AA4B5] leading-relaxed">
                Credits today’s fixed $0.01 per $1 invested yield for all active VIP $1–$10 positions not yet claimed today.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunDailyYield}
              className="w-full min-h-[44px] rounded-xl border border-[#D4AF37] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#090C11] text-sm font-semibold transition-colors cursor-pointer"
            >
              Run Daily Yield Settlement Now
            </button>
          </div>
        </div>
      )}

      {/* SECTION 7: Direct Admin Messages Inbox */}
      {section === 'messages' && overview && (
        <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#1E2736] pb-3">
            <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-base font-semibold text-[#F3EFE6]">Direct User Support Messages</h2>
          </div>

          {overview.messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9AA4B5]">
              No user support messages received yet.
            </p>
          ) : (
            <div className="space-y-4">
              {overview.messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#E5C158]">
                      {msg.senderRole === 'admin' ? 'Admin Reply' : `${msg.userName} (${msg.userEmail})`} · {msg.subject}
                    </span>
                    <span className="text-[#8D97A8]">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-[#F3EFE6]">{msg.body}</p>
                  {msg.senderRole === 'user' && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={replyDrafts[msg.userId] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [msg.userId]: e.target.value }))
                        }
                        placeholder="Write a direct reply to this investor..."
                        className="flex-1 min-h-[38px] rounded-lg border border-[#242E3F] bg-[#090C11] px-3 text-xs text-[#F3EFE6]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendReply(msg.userId)}
                        className="min-h-[38px] px-3.5 rounded-lg bg-[#D4AF37] text-[#090C11] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Reply</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 8: Multi-Admin Controllers */}
      {section === 'admins' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#F3EFE6]">Active Admin Controllers</h2>
              <span className="text-xs text-[#9AA4B5]">{overview.admins.length} admins</span>
            </div>
            <div className="divide-y divide-[#1D2533]">
              {overview.admins.map((adm) => (
                <div key={adm.id} className="px-5 py-4 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-[#F3EFE6] text-sm">{adm.fullName}</p>
                    <p className="font-mono text-[#A6AEBD] mt-0.5">{adm.email}</p>
                  </div>
                  {adm.id !== user?.id ? (
                    <button
                      type="button"
                      onClick={() => handleRevokeAdmin(adm.id)}
                      className="min-h-[36px] px-3 rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/15 cursor-pointer"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-[#E5C158] font-medium">Current Session</span>
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
              <h2 className="text-base font-semibold text-[#F3EFE6]">Add Admin Controller</h2>
            </div>
            <div>
              <label htmlFor="new-adm-name" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Full Name
              </label>
              <input
                id="new-adm-name"
                type="text"
                required
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Finance Controller"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="new-adm-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Email Address
              </label>
              <input
                id="new-adm-email"
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="controller@example.com"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <div>
              <label htmlFor="new-adm-pass" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Password (min 6 chars)
              </label>
              <input
                id="new-adm-pass"
                type="password"
                required
                minLength={6}
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6]"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold cursor-pointer"
            >
              Add Admin Account
            </button>
          </form>
        </div>
      )}

      {/* SECTION 9: Audit Activity Logs + CSV Export */}
      {section === 'logs' && overview && (() => {
        const logs = overview.activityLogs ?? [];
        const trimmedQuery = logSearchQuery.trim().toLowerCase();
        const filteredLogs = logs.filter((log) => {
          if (logCategoryFilter !== 'All' && log.category !== logCategoryFilter) {
            return false;
          }
          if (!trimmedQuery) return true;
          return (
            log.userEmail.toLowerCase().includes(trimmedQuery) ||
            log.userName.toLowerCase().includes(trimmedQuery) ||
            (log.userId ?? '').toLowerCase().includes(trimmedQuery) ||
            log.actionTitle.toLowerCase().includes(trimmedQuery) ||
            log.details.toLowerCase().includes(trimmedQuery) ||
            log.status.toLowerCase().includes(trimmedQuery) ||
            log.ipAddress.toLowerCase().includes(trimmedQuery)
          );
        });

        const categoryOptions: Array<'All' | ActivityLogCategory> = [
          'All',
          'User Login',
          'Investment Activation',
          'Deposit Submission',
        ];

        return (
          <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2736] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <History className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-[#F3EFE6]">
                    System Audit & Activity Logs
                  </h2>
                  <p className="text-xs text-[#9AA4B5] mt-0.5">
                    Real-time audit trail of user logins, VIP investment activations, and deposit or activation submissions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="export-activity-logs-csv"
                disabled={exportingCsv}
                onClick={handleExportActivityLogsCsv}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] disabled:opacity-60 text-[#090C11] text-xs font-semibold inline-flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{exportingCsv ? 'Exporting CSV...' : 'Export CSV'}</span>
              </button>
            </div>

            <div className="px-5 py-3.5 border-b border-[#1E2736] bg-[#0B0F17] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter activity logs by category">
                {categoryOptions.map((cat) => {
                  const count =
                    cat === 'All' ? logs.length : logs.filter((entry) => entry.category === cat).length;
                  const active = logCategoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLogCategoryFilter(cat)}
                      className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#D4AF37]/20 text-[#E5C158] border border-[#D4AF37]/50'
                          : 'bg-[#10151E] text-[#9AA4B5] border border-[#222B3A] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full lg:w-72">
                <Search className="w-3.5 h-3.5 text-[#8D97A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search activity logs"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Search email, user ID, TxID, IP..."
                  className="w-full min-h-[36px] rounded-lg border border-[#242E3F] bg-[#090C11] pl-9 pr-3 text-xs text-[#F3EFE6] placeholder:text-[#6E788A]"
                />
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="py-12 px-5 text-center space-y-1.5">
                <p className="text-sm font-medium text-[#F3EFE6]">No matching activity logs found</p>
                <p className="text-xs text-[#8D97A8]">
                  Try clearing your search filter or switching categories.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2736] bg-[#0D1118] text-[#8D97A8] uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 font-semibold">Timestamp</th>
                      <th className="py-3 px-4 font-semibold">Category</th>
                      <th className="py-3 px-4 font-semibold">User</th>
                      <th className="py-3 px-4 font-semibold">Event & Details</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D2533]">
                    {filteredLogs.map((log) => {
                      const categoryStyles =
                        log.category === 'User Login'
                          ? 'border-sky-500/35 bg-sky-500/10 text-sky-200'
                          : log.category === 'Investment Activation'
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-500/35 bg-amber-500/10 text-amber-200';

                      const statusStyles =
                        log.status === 'Blocked' || log.status === 'Rejected'
                          ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                          : log.status === 'Pending'
                            ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                            : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200';

                      return (
                        <tr key={log.id} className="hover:bg-[#141A25]/70 align-top">
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-[#A6AEBD]">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${categoryStyles}`}
                            >
                              {log.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 min-w-[180px]">
                            <p className="font-semibold text-[#F3EFE6]">
                              {log.userName || 'Investor'}
                            </p>
                            <p className="font-mono text-[11px] text-[#A6AEBD]">
                              {log.userEmail || 'N/A'}
                            </p>
                            {log.userId && (
                              <p className="font-mono text-[10px] text-[#727C8E] mt-0.5">
                                ID: {log.userId.slice(0, 8)}...
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 min-w-[240px]">
                            <p className="font-semibold text-[#E5C158]">{log.actionTitle}</p>
                            {log.details && (
                              <p className="text-[#B8C0CE] mt-0.5 leading-relaxed">{log.details}</p>
                            )}
                            {log.ipAddress && (
                              <p className="font-mono text-[10px] text-[#7C8699] mt-1">
                                IP: {log.ipAddress}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono tabular-nums font-semibold text-[#F3EFE6]">
                            {log.amountUsd !== null ? formatUsd(log.amountUsd) : '—'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${statusStyles}`}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
}
