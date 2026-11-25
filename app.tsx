import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  FileText,
  Home,
  Layers,
  LogOut,
  Shield,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from './api/client';
import { AuthModal } from './components/AuthModal';
import { AdminPortalView } from './components/AdminPortalView';
import { DepositView } from './components/DepositView';
import { HomeDashboard } from './components/HomeDashboard';
import { RecordsView } from './components/RecordsView';
import { ReferralView } from './components/ReferralView';
import { VipPlansView } from './components/VipPlansView';
import { WithdrawView } from './components/WithdrawView';
import type {
  ActiveTab,
  DepositRecord,
  EarningsRecord,
  FinancialRecord,
  InvestmentPosition,
  PaymentMethod,
  PlatformSettings,
  ReferralSummary,
  SupportedAsset,
  TaskRecord,
  UserProfile,
  VipPlan,
  WithdrawalRecord,
} from './types/platform';
import { DEFAULT_SETTINGS } from './utils/defaults';

interface PublicConfigResponse {
  settings: PlatformSettings;
  vipPlans: VipPlan[];
  paymentMethods: PaymentMethod[];
  adminStatus: {
    hasAdmin: boolean;
    passcodeConfigured: boolean;
  };
}

interface UserBundleResponse {
  user: UserProfile;
  investments: InvestmentPosition[];
  deposits: DepositRecord[];
  earnings: EarningsRecord[];
  tasks: TaskRecord[];
  financial: FinancialRecord[];
  withdrawals: WithdrawalRecord[];
  referralSummary: ReferralSummary;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [adminStatus, setAdminStatus] = useState({ hasAdmin: false, passcodeConfigured: false });

  const [investments, setInvestments] = useState<InvestmentPosition[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [earnings, setEarnings] = useState<EarningsRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [financial, setFinancial] = useState<FinancialRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);

  const [preselectedPlan, setPreselectedPlan] = useState<VipPlan | null>(null);
  const [preselectedAsset, setPreselectedAsset] = useState<SupportedAsset>('Gold');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [emblemError, setEmblemError] = useState(false);

  const initialReferralCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('ref')?.toUpperCase() ?? ''
      : '';

  const applyUserBundle = useCallback((bundle: Partial<UserBundleResponse>) => {
    if (bundle.user) setUser(bundle.user);
    if (bundle.investments) setInvestments(bundle.investments);
    if (bundle.deposits) setDeposits(bundle.deposits);
    if (bundle.earnings) setEarnings(bundle.earnings);
    if (bundle.tasks) setTasks(bundle.tasks);
    if (bundle.financial) setFinancial(bundle.financial);
    if (bundle.withdrawals) setWithdrawals(bundle.withdrawals);
    if (bundle.referralSummary) setReferralSummary(bundle.referralSummary);
  }, []);

  const loadPublicConfig = useCallback(async () => {
    try {
      const data = await apiFetch<PublicConfigResponse>('/api/public/config');
      setSettings(data.settings);
      setVipPlans(data.vipPlans);
      setPaymentMethods(data.paymentMethods);
      setAdminStatus(data.adminStatus);
    } catch {
      // Keep current state if temporary fetch error occurs
    }
  }, []);

  useEffect(() => {
    loadPublicConfig();
    if (initialReferralCode) {
      setAuthModalMode('register');
      setAuthModalOpen(true);
    }
  }, [loadPublicConfig, initialReferralCode]);

  function handleAuthenticated(newToken: string, payload: unknown) {
    setToken(newToken);
    applyUserBundle(payload as Partial<UserBundleResponse>);
  }

  function handleSignOut() {
    setToken(null);
    setUser(null);
    setInvestments([]);
    setDeposits([]);
    setEarnings([]);
    setTasks([]);
    setFinancial([]);
    setWithdrawals([]);
    setReferralSummary(null);
    setActiveTab('home');
  }

  function openAuth(mode: 'login' | 'register') {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }

  function handleSelectPlanForDeposit(plan: VipPlan, asset: SupportedAsset) {
    setPreselectedPlan(plan);
    setPreselectedAsset(asset);
    setActiveTab('deposit');
  }

  async function handleActivateFromBalance(plan: VipPlan, asset: SupportedAsset) {
    if (!token) return;
    const bundle = await apiFetch<UserBundleResponse>('/api/investments/from-balance', {
      method: 'POST',
      token,
      body: { planId: plan.id, selectedAsset: asset },
    });
    applyUserBundle(bundle);
  }

  async function handleSubmitDeposit(payload: {
    planId: string | null;
    selectedAsset: SupportedAsset;
    paymentMethodId: string;
    txId: string;
    senderNote: string;
    customAmountUsd?: number;
  }) {
    if (!token) return;
    const bundle = await apiFetch<UserBundleResponse>('/api/deposits', {
      method: 'POST',
      token,
      body: payload,
    });
    applyUserBundle(bundle);
  }

  async function handleClaimDailyTask(investmentId: string) {
    if (!token) return;
    const bundle = await apiFetch<UserBundleResponse>('/api/tasks/claim', {
      method: 'POST',
      token,
      body: { investmentId },
    });
    applyUserBundle(bundle);
  }

  async function handleSubmitWithdrawal(payload: {
    paymentMethodName: string;
    walletAddress: string;
    amountUsd: number;
  }) {
    if (!token) return;
    const bundle = await apiFetch<UserBundleResponse>('/api/withdrawals', {
      method: 'POST',
      token,
      body: payload,
    });
    applyUserBundle(bundle);
  }

  const pendingDepositsCount = deposits.filter((d) => d.status === 'Pending').length;

  const navItems: Array<{ id: ActiveTab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'plans', label: 'VIP Plans', icon: Layers },
    { id: 'deposit', label: 'Deposit', icon: Wallet },
    { id: 'withdraw', label: 'Withdraw', icon: ArrowDownToLine },
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'refer', label: 'Refer', icon: Users },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  // Mobile bottom navigation uses the 5 core destinations matching the screenshot layout
  const mobileBottomItems: Array<{ id: ActiveTab; label: string; icon: typeof Home }> = [
    { id: 'refer', label: 'Refer', icon: Users },
    { id: 'deposit', label: 'Deposit', icon: Wallet },
    { id: 'withdraw', label: 'Withdraw', icon: ArrowDownToLine },
    { id: 'records', label: 'Records', icon: FileText },
    { id: 'home', label: 'Home', icon: Home },
  ];

  return (
    <div className="min-h-screen bg-[#090C11] text-[#F3EFE6] flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#1C2331] bg-[#0B0F17] px-4 py-6 justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            {!emblemError ? (
              <img
                src="/src/assets/images/aurum_crest_emblem_1795609990742.jpg"
                alt={`${settings.brandName} crest`}
                referrerPolicy="no-referrer"
                onError={() => setEmblemError(true)}
                className="w-10 h-10 rounded-xl object-cover border border-[#D4AF37]/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 flex items-center justify-center text-[#E5C158] font-display font-bold shrink-0">
                AC
              </div>
            )}
            <span className="font-display text-lg font-bold tracking-tight text-[#F3EFE6] truncate">
              {settings.brandName}
            </span>
          </div>

          <nav aria-label="Main navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37]/15 text-[#E5C158] border border-[#D4AF37]/30'
                      : 'text-[#9AA4B5] hover:text-[#F3EFE6] hover:bg-[#131924] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#1C2331] pt-4 space-y-3 px-1">
          {user ? (
            <>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-[#F3EFE6] truncate">{user.fullName}</p>
                <p className="text-[11px] font-mono text-[#9AA4B5] truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full min-h-[40px] px-3 rounded-lg border border-[#242E3F] hover:border-rose-500/40 text-xs font-medium text-[#B8C0CE] hover:text-rose-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold transition-colors cursor-pointer"
            >
              Sign In / Register
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header Bar (3-zone contract, <=54px compact on mobile) */}
        <header className="sticky top-0 z-30 h-[54px] lg:h-16 border-b border-[#1C2331] bg-[#0B0F17]/95 backdrop-blur-md px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="lg:hidden font-display text-base font-bold text-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {settings.brandName}
            </button>
            <span className="hidden lg:inline text-sm font-medium text-[#9AA4B5] whitespace-nowrap">
              {navItems.find((n) => n.id === activeTab)?.label ?? 'Overview'}
            </span>
          </div>

          <nav aria-label="Quick section links" className="hidden md:flex lg:hidden items-center gap-5 text-xs font-medium text-[#A6AEBD]">
            <button type="button" onClick={() => setActiveTab('plans')} className="hover:text-[#E5C158] whitespace-nowrap cursor-pointer">
              VIP Plans
            </button>
            <button type="button" onClick={() => setActiveTab('admin')} className="hover:text-[#E5C158] whitespace-nowrap cursor-pointer">
              Admin
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs font-mono text-[#A6AEBD] truncate max-w-[200px]">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className="lg:hidden min-h-[36px] px-3 rounded-lg border border-[#2A3548] text-xs font-medium text-[#E5C158] whitespace-nowrap cursor-pointer"
                >
                  Admin
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className="lg:hidden min-h-[36px] px-2.5 rounded-lg border border-[#2A3548] text-xs font-medium text-[#A6AEBD] whitespace-nowrap cursor-pointer"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="min-h-[38px] px-4 rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
          {activeTab === 'home' && (
            <HomeDashboard
              settings={settings}
              user={user}
              vipPlans={vipPlans}
              investments={investments}
              pendingDepositsCount={pendingDepositsCount}
              onNavigate={setActiveTab}
              onOpenAuth={openAuth}
              onSelectPlanForDeposit={handleSelectPlanForDeposit}
              onClaimDailyTask={handleClaimDailyTask}
            />
          )}

          {activeTab === 'plans' && (
            <VipPlansView
              vipPlans={vipPlans}
              settings={settings}
              user={user}
              investments={investments}
              onDepositForPlan={handleSelectPlanForDeposit}
              onActivateFromBalance={handleActivateFromBalance}
              onOpenAuth={openAuth}
            />
          )}

          {activeTab === 'deposit' && (
            <DepositView
              settings={settings}
              user={user}
              vipPlans={vipPlans}
              paymentMethods={paymentMethods}
              deposits={deposits}
              preselectedPlan={preselectedPlan}
              preselectedAsset={preselectedAsset}
              onSubmitDeposit={handleSubmitDeposit}
              onOpenAuth={openAuth}
            />
          )}

          {activeTab === 'withdraw' && (
            <WithdrawView
              settings={settings}
              user={user}
              paymentMethods={paymentMethods}
              withdrawals={withdrawals}
              onSubmitWithdrawal={handleSubmitWithdrawal}
              onOpenAuth={openAuth}
            />
          )}

          {activeTab === 'records' && (
            <RecordsView
              user={user}
              earnings={earnings}
              deposits={deposits}
              tasks={tasks}
              financial={financial}
              onOpenAuth={openAuth}
            />
          )}

          {activeTab === 'refer' && (
            <ReferralView
              settings={settings}
              user={user}
              referralSummary={referralSummary}
              onOpenAuth={openAuth}
            />
          )}

          {activeTab === 'admin' && (
            <AdminPortalView
              token={token}
              user={user}
              adminStatus={adminStatus}
              onAdminAuthenticated={handleAuthenticated}
              onRefreshPublicConfig={loadPublicConfig}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar (58px height + 54px top header = 112px < 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[58px] border-t border-[#1E2736] bg-[#0B0F17]/95 backdrop-blur-md grid grid-cols-5 items-center"
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                active ? 'text-[#E5C158]' : 'text-[#8D97A8]'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        initialReferralCode={initialReferralCode}
        brandName={settings.brandName}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}
