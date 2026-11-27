import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  db,
  expireDueInvestments,
  getPlatformSettings,
  initDatabase,
  queryActivityLogs,
  recordActivityLog,
} from './server/db.ts';
import {
  decryptRecoverablePassword,
  encryptRecoverablePassword,
  hashPassword,
  isSmtpConfigured,
  signSessionToken,
  verifyAdminPasscode,
  verifyPassword,
  verifySessionToken,
  type TokenPayload,
} from './server/auth.ts';
import {
  DEFAULT_DURATION_DAYS,
  MAX_PLAN_AMOUNT_USD,
  calculateDailyIncome,
  calculateExtraBonus,
  calculatePlanExpiryIso,
  calculateReferralCommission,
  formatDurationLabel,
  isPlanExpired,
  maskEmail,
  roundUsd,
  sanitizeDurationDays,
  sanitizeExternalUrl,
  validateEmailAddress,
  validatePhoneNumber,
  validateTxId,
} from './src/utils/investment.ts';
import { formatActivityLogsCsv } from './src/utils/csv.ts';
import type {
  ActivationRequest,
  ActivationStatus,
  AdminManagedUser,
  AdminUserSummary,
  DailyAdItem,
  DepositRecord,
  DirectMessage,
  EarningsRecord,
  FinancialRecord,
  InvestmentPosition,
  PaymentMethod,
  ReferralSummary,
  SupportedAsset,
  TaskRecord,
  UserProfile,
  VipPlan,
  WithdrawalRecord,
} from './src/types/platform.ts';

dotenv.config();
initDatabase();

interface AuthedRequest extends Request {
  auth?: TokenPayload & {
    activationStatus: ActivationStatus;
    isBlocked: boolean;
    fundsFrozen: boolean;
  };
}

interface DbUserRow {
  id: string;
  email: string;
  phone_number: string;
  full_name: string;
  password_hash: string;
  role: 'user' | 'admin';
  is_verified: number;
  activation_status: ActivationStatus;
  is_blocked: number;
  funds_frozen: number;
  referral_code: string;
  referred_by_user_id: string | null;
  balance_usd: number;
  total_invested_usd: number;
  total_earned_usd: number;
  total_referral_earned_usd: number;
  created_at: string;
}

function mapUser(row: DbUserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    phoneNumber: row.phone_number ?? '',
    fullName: row.full_name,
    role: row.role,
    isVerified: row.is_verified === 1,
    activationStatus: (row.activation_status ?? 'Unpaid') as ActivationStatus,
    isBlocked: row.is_blocked === 1,
    fundsFrozen: row.funds_frozen === 1,
    referralCode: row.referral_code,
    referredByUserId: row.referred_by_user_id,
    balanceUsd: roundUsd(row.balance_usd),
    totalInvestedUsd: roundUsd(row.total_invested_usd),
    totalEarnedUsd: roundUsd(row.total_earned_usd),
    totalReferralEarnedUsd: roundUsd(row.total_referral_earned_usd),
    createdAt: row.created_at,
  };
}

function mapPlan(row: {
  id: string;
  tier_number: number;
  name: string;
  subtitle: string;
  amount_usd: number;
  daily_rate_per_dollar: number;
  monthly_rate_per_dollar?: number;
  supported_assets: string;
  duration_days?: number;
  duration_label: string;
  is_active: number;
  sort_order: number;
}): VipPlan {
  let assets: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];
  try {
    const parsed = JSON.parse(row.supported_assets);
    if (Array.isArray(parsed) && parsed.length > 0) assets = parsed;
  } catch {
    assets = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];
  }
  const durationDays = sanitizeDurationDays(row.duration_days, DEFAULT_DURATION_DAYS);
  const durationLabel =
    row.duration_label && row.duration_label !== 'No Fixed Duration'
      ? row.duration_label
      : durationDays <= 0
        ? 'No Fixed Duration'
        : formatDurationLabel(durationDays);
  return {
    id: row.id,
    tierNumber: row.tier_number,
    name: row.name,
    subtitle: row.subtitle,
    amountUsd: roundUsd(row.amount_usd),
    dailyRatePerDollar: row.daily_rate_per_dollar,
    monthlyRatePerDollar: row.monthly_rate_per_dollar ?? 0.2,
    supportedAssets: assets,
    durationDays,
    durationLabel,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

function mapPaymentMethod(row: {
  id: string;
  name: string;
  network: string;
  wallet_address: string;
  instructions: string;
  is_active: number;
  sort_order: number;
}): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    network: row.network,
    walletAddress: row.wallet_address,
    instructions: row.instructions,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

function mapAd(
  row: {
    id: string;
    title: string;
    description: string;
    target_url: string;
    reward_usd: number;
    duration_seconds: number;
    is_active: number;
    created_at: string;
  },
  claimedSet?: Set<string>
): DailyAdItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetUrl: row.target_url,
    rewardUsd: roundUsd(row.reward_usd),
    durationSeconds: row.duration_seconds,
    isActive: row.is_active === 1,
    claimedToday: claimedSet ? claimedSet.has(row.id) : false,
    createdAt: row.created_at,
  };
}

function generateReferralCode(email: string): string {
  const prefix = email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, 'X');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}${suffix}`;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 80);
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim().slice(0, 80);
  }
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 80);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }
  const userRow = db
    .prepare('SELECT id, email, role, activation_status, is_blocked, funds_frozen FROM users WHERE id = ?')
    .get(payload.sub) as
    | {
        id: string;
        email: string;
        role: 'user' | 'admin';
        activation_status: ActivationStatus;
        is_blocked: number;
        funds_frozen: number;
      }
    | undefined;
  if (!userRow) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }
  if (userRow.is_blocked === 1) {
    res.status(403).json({ error: 'Your account has been blocked by an administrator.' });
    return;
  }
  req.auth = {
    ...payload,
    role: userRow.role,
    activationStatus: (userRow.activation_status ?? 'Unpaid') as ActivationStatus,
    isBlocked: userRow.is_blocked === 1,
    fundsFrozen: userRow.funds_frozen === 1,
  };
  next();
}

function requireActivated(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (req.auth?.role === 'admin') {
    next();
    return;
  }
  if (req.auth?.activationStatus !== 'Activated') {
    res.status(403).json({
      error:
        'Account activation required. Please pay the 40 BDT ($0.40) activation fee and wait for admin activation.',
      code: 'ACTIVATION_REQUIRED',
    });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

function getUserDashboardBundle(userId: string) {
  // Automatically expire any fixed-term plans whose expiration timestamp <= now before reading balances/positions
  expireDueInvestments({ userId });

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow | undefined;
  if (!userRow) return null;

  const settings = getPlatformSettings();
  const todayDate = new Date().toISOString().slice(0, 10);

  const investments = (
    db
      .prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      plan_id: string;
      plan_name: string;
      selected_asset: SupportedAsset;
      amount_usd: number;
      daily_income_usd: number;
      source_deposit_id: string | null;
      status: 'Active' | 'Paused' | 'Expired';
      purchased_at: string | null;
      duration_days: number | null;
      expires_at: string | null;
      expired_at: string | null;
      last_claimed_date: string | null;
      total_earned_usd: number;
      created_at: string;
    }>
  ).map<InvestmentPosition>((r) => ({
    id: r.id,
    userId: r.user_id,
    planId: r.plan_id,
    planName: r.plan_name,
    selectedAsset: r.selected_asset,
    amountUsd: roundUsd(r.amount_usd),
    dailyIncomeUsd: roundUsd(r.daily_income_usd),
    sourceDepositId: r.source_deposit_id,
    status: r.status,
    purchasedAt: r.purchased_at || r.created_at,
    durationDays: sanitizeDurationDays(r.duration_days, DEFAULT_DURATION_DAYS),
    expiresAt: r.expires_at ?? null,
    expiredAt: r.expired_at ?? null,
    lastClaimedDate: r.last_claimed_date,
    totalEarnedUsd: roundUsd(r.total_earned_usd),
    createdAt: r.created_at,
  }));

  const deposits = (
    db
      .prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      plan_id: string | null;
      plan_name: string | null;
      selected_asset: SupportedAsset;
      payment_method_id: string;
      payment_method_name: string;
      amount_usd: number;
      tx_id: string;
      sender_note: string;
      status: 'Pending' | 'Approved' | 'Rejected';
      admin_note: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>
  ).map<DepositRecord>((r) => ({
    id: r.id,
    userId: r.user_id,
    planId: r.plan_id,
    planName: r.plan_name,
    selectedAsset: r.selected_asset,
    paymentMethodId: r.payment_method_id,
    paymentMethodName: r.payment_method_name,
    amountUsd: roundUsd(r.amount_usd),
    txId: r.tx_id,
    senderNote: r.sender_note,
    status: r.status,
    adminNote: r.admin_note,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  }));

  const earnings = (
    db
      .prepare('SELECT * FROM earnings_records WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      type: EarningsRecord['type'];
      title: string;
      asset: string;
      amount_usd: number;
      reference_id: string | null;
      created_at: string;
    }>
  ).map<EarningsRecord>((r) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    asset: r.asset,
    amountUsd: roundUsd(r.amount_usd),
    referenceId: r.reference_id,
    createdAt: r.created_at,
  }));

  const tasks = (
    db
      .prepare('SELECT * FROM task_records WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      investment_id: string;
      plan_name: string;
      asset: string;
      task_title: string;
      reward_usd: number;
      status: 'Completed' | 'Pending';
      task_date: string;
      created_at: string;
    }>
  ).map<TaskRecord>((r) => ({
    id: r.id,
    userId: r.user_id,
    investmentId: r.investment_id,
    planName: r.plan_name,
    asset: r.asset,
    taskTitle: r.task_title,
    rewardUsd: roundUsd(r.reward_usd),
    status: r.status,
    taskDate: r.task_date,
    createdAt: r.created_at,
  }));

  const financial = (
    db
      .prepare('SELECT * FROM financial_records WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      category: FinancialRecord['category'];
      description: string;
      direction: 'Credit' | 'Debit';
      amount_usd: number;
      balance_after_usd: number;
      status: 'Completed' | 'Pending' | 'Rejected';
      created_at: string;
    }>
  ).map<FinancialRecord>((r) => ({
    id: r.id,
    userId: r.user_id,
    category: r.category,
    description: r.description,
    direction: r.direction,
    amountUsd: roundUsd(r.amount_usd),
    balanceAfterUsd: roundUsd(r.balance_after_usd),
    status: r.status,
    createdAt: r.created_at,
  }));

  const withdrawals = (
    db
      .prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      payment_method_name: string;
      wallet_address: string;
      amount_usd: number;
      status: 'Pending' | 'Approved' | 'Rejected';
      admin_note: string;
      created_at: string;
      reviewed_at: string | null;
    }>
  ).map<WithdrawalRecord>((r) => ({
    id: r.id,
    userId: r.user_id,
    paymentMethodName: r.payment_method_name,
    walletAddress: r.wallet_address,
    amountUsd: roundUsd(r.amount_usd),
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }));

  const activationRequests = (
    db
      .prepare('SELECT * FROM activation_requests WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      payment_method_id: string;
      payment_method_name: string;
      amount_label: string;
      amount_usd: number;
      tx_id: string;
      sender_account: string;
      status: 'Pending' | 'Approved' | 'Rejected';
      admin_note: string;
      created_at: string;
      reviewed_at: string | null;
    }>
  ).map<ActivationRequest>((r) => ({
    id: r.id,
    userId: r.user_id,
    paymentMethodId: r.payment_method_id,
    paymentMethodName: r.payment_method_name,
    amountLabel: r.amount_label,
    amountUsd: roundUsd(r.amount_usd),
    txId: r.tx_id,
    senderAccount: r.sender_account,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }));

  const claimedTodayRows = db
    .prepare('SELECT ad_id FROM ad_claims WHERE user_id = ? AND claim_date = ?')
    .all(userId, todayDate) as Array<{ ad_id: string }>;
  const claimedSet = new Set(claimedTodayRows.map((c) => c.ad_id));

  const ads = (
    db.prepare('SELECT * FROM ads WHERE is_active = 1 ORDER BY created_at DESC').all() as Array<
      Parameters<typeof mapAd>[0]
    >
  ).map((row) => mapAd(row, claimedSet));

  const messages = (
    db
      .prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as Array<{
      id: string;
      user_id: string;
      sender_role: 'user' | 'admin';
      sender_email: string;
      subject: string;
      body: string;
      is_read: number;
      created_at: string;
    }>
  ).map<DirectMessage>((m) => ({
    id: m.id,
    userId: m.user_id,
    senderRole: m.sender_role,
    senderEmail: m.sender_email,
    subject: m.subject,
    body: m.body,
    isRead: m.is_read === 1,
    createdAt: m.created_at,
  }));

  const referredRows = db
    .prepare(
      'SELECT id, email, full_name, is_verified, activation_status, total_invested_usd, created_at FROM users WHERE referred_by_user_id = ? ORDER BY created_at DESC'
    )
    .all(userId) as Array<{
    id: string;
    email: string;
    full_name: string;
    is_verified: number;
    activation_status: string;
    total_invested_usd: number;
    created_at: string;
  }>;

  const referralSummary: ReferralSummary = {
    referralCode: userRow.referral_code,
    commissionPct: settings.referralCommissionPct,
    totalReferrals: referredRows.length,
    totalCommissionUsd: roundUsd(userRow.total_referral_earned_usd),
    referredUsers: referredRows.map((r) => ({
      id: r.id,
      maskedEmail: maskEmail(r.email),
      fullName: r.full_name,
      isVerified: r.activation_status === 'Activated',
      totalInvestedUsd: roundUsd(r.total_invested_usd),
      joinedAt: r.created_at,
    })),
  };

  return {
    user: mapUser(userRow),
    investments,
    deposits,
    earnings,
    tasks,
    financial,
    withdrawals,
    activationRequests,
    ads,
    messages,
    referralSummary,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/public/config', (_req, res) => {
    const settings = getPlatformSettings();
    const vipPlans = (
      db
        .prepare(
          'SELECT * FROM vip_plans WHERE is_active = 1 AND amount_usd <= ? ORDER BY sort_order ASC, amount_usd ASC, tier_number ASC'
        )
        .all(MAX_PLAN_AMOUNT_USD) as Array<Parameters<typeof mapPlan>[0]>
    ).map(mapPlan);

    const paymentMethods = (
      db.prepare('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order ASC').all() as Array<
        Parameters<typeof mapPaymentMethod>[0]
      >
    ).map(mapPaymentMethod);

    const ads = (
      db.prepare('SELECT * FROM ads WHERE is_active = 1 ORDER BY created_at DESC').all() as Array<
        Parameters<typeof mapAd>[0]
      >
    ).map((row) => mapAd(row));

    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number })
      .count;

    res.json({
      settings,
      vipPlans,
      paymentMethods,
      ads,
      adminStatus: {
        hasAdmin: adminCount > 0,
        passcodeConfigured: Boolean((process.env.ADMIN_PASSCODE ?? '').trim()),
      },
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // --- AUTHENTICATION ROUTES (Email + Phone Number + Password) ---

  app.post('/api/auth/register', (req, res) => {
    const { fullName, email, phoneNumber, password, referralCode } = req.body ?? {};
    const name = String(fullName ?? '').trim();
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }

    const emailCheck = validateEmailAddress(String(email ?? ''));
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }

    const phoneCheck = validatePhoneNumber(String(phoneNumber ?? ''));
    if (!phoneCheck.valid) {
      res.status(400).json({ error: phoneCheck.error });
      return;
    }

    const rawPassword = String(password ?? '');
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailCheck.normalized) as
      | { id: string }
      | undefined;

    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    let referrerId: string | null = null;
    const cleanRef = String(referralCode ?? '').trim().toUpperCase();
    if (cleanRef) {
      const refRow = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(cleanRef) as
        | { id: string }
        | undefined;
      if (!refRow) {
        res.status(400).json({ error: 'Referral code not found. Clear it or enter a valid code.' });
        return;
      }
      referrerId = refRow.id;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(rawPassword);
    const passwordEnc = encryptRecoverablePassword(rawPassword);
    const nowIso = new Date().toISOString();
    let userRefCode = generateReferralCode(emailCheck.normalized);
    while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(userRefCode)) {
      userRefCode = generateReferralCode(emailCheck.normalized);
    }

    db.prepare(
      `INSERT INTO users (id, email, phone_number, full_name, password_hash, password_enc, role, is_verified, activation_status, is_blocked, funds_frozen, referral_code, referred_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'user', 1, 'Unpaid', 0, 0, ?, ?, ?)`
    ).run(
      userId,
      emailCheck.normalized,
      phoneCheck.normalized,
      name,
      passwordHash,
      passwordEnc,
      userRefCode,
      referrerId,
      nowIso
    );

    recordActivityLog({
      category: 'User Login',
      userId,
      userEmail: emailCheck.normalized,
      userName: name,
      actionTitle: 'Account Registered & Signed In',
      details: referrerId ? 'New investor registered with referral code' : 'New investor registered',
      ipAddress: getClientIp(req),
      status: 'Completed',
      createdAt: nowIso,
    });

    const token = signSessionToken({ sub: userId, email: emailCheck.normalized, role: 'user' });
    const bundle = getUserDashboardBundle(userId);
    res.status(201).json({ token, ...bundle });
  });

  app.post('/api/auth/login', (req, res) => {
    const emailCheck = validateEmailAddress(String(req.body?.email ?? ''));
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }
    const rawPassword = String(req.body?.password ?? '');
    if (!rawPassword) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(emailCheck.normalized) as
      | DbUserRow
      | undefined;
    if (!userRow || !verifyPassword(rawPassword, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    if (userRow.is_blocked === 1) {
      recordActivityLog({
        category: 'User Login',
        userId: userRow.id,
        userEmail: userRow.email,
        userName: userRow.full_name,
        actionTitle: 'Blocked Account Login Attempt',
        details: 'Sign-in rejected because the account is blocked by an administrator.',
        ipAddress: getClientIp(req),
        status: 'Blocked',
      });
      res.status(403).json({ error: 'This account has been blocked by an administrator.' });
      return;
    }

    recordActivityLog({
      category: 'User Login',
      userId: userRow.id,
      userEmail: userRow.email,
      userName: userRow.full_name,
      actionTitle: userRow.role === 'admin' ? 'Administrator Signed In (User Portal)' : 'User Signed In',
      details: `Account role: ${userRow.role}`,
      ipAddress: getClientIp(req),
      status: 'Completed',
    });

    const token = signSessionToken({ sub: userRow.id, email: userRow.email, role: userRow.role });
    const bundle = getUserDashboardBundle(userRow.id);
    res.json({ token, ...bundle });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const bundle = getUserDashboardBundle(req.auth!.sub);
    if (!bundle) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json(bundle);
  });

  // --- ACCOUNT ACTIVATION FEE (40 BDT / $0.40) ---

  app.post('/api/activation/submit', requireAuth, (req: AuthedRequest, res) => {
    const { paymentMethodId, txId, senderAccount } = req.body ?? {};
    const userRow = db
      .prepare('SELECT id, email, full_name, activation_status, balance_usd FROM users WHERE id = ?')
      .get(req.auth!.sub) as
      | {
          id: string;
          email: string;
          full_name: string;
          activation_status: ActivationStatus;
          balance_usd: number;
        }
      | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (userRow.activation_status === 'Activated') {
      res.status(400).json({ error: 'Your account is already activated.' });
      return;
    }

    const txValidation = validateTxId(String(txId ?? ''));
    if (!txValidation.valid) {
      res.status(400).json({ error: txValidation.error });
      return;
    }

    const duplicateTx = db
      .prepare("SELECT id FROM activation_requests WHERE LOWER(tx_id) = LOWER(?) AND status != 'Rejected'")
      .get(txValidation.normalized);
    if (duplicateTx) {
      res.status(409).json({ error: 'This Activation Transaction ID has already been submitted.' });
      return;
    }

    const pmRow = db
      .prepare('SELECT * FROM payment_methods WHERE id = ? AND is_active = 1')
      .get(String(paymentMethodId ?? '')) as Parameters<typeof mapPaymentMethod>[0] | undefined;
    if (!pmRow) {
      res.status(400).json({ error: 'Selected payment method is unavailable.' });
      return;
    }

    const settings = getPlatformSettings();
    const nowIso = new Date().toISOString();
    const amountLabel = `${settings.activationFeeBdt} BDT ($${settings.activationFeeUsd.toFixed(2)})`;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO activation_requests (id, user_id, payment_method_id, payment_method_name, amount_label, amount_usd, tx_id, sender_account, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
      ).run(
        crypto.randomUUID(),
        userRow.id,
        pmRow.id,
        pmRow.name,
        amountLabel,
        settings.activationFeeUsd,
        txValidation.normalized,
        String(senderAccount ?? '').trim().slice(0, 120),
        nowIso
      );

      db.prepare("UPDATE users SET activation_status = 'Pending' WHERE id = ?").run(userRow.id);

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Activation Fee', ?, 'Debit', ?, ?, 'Pending', ?)`
      ).run(
        crypto.randomUUID(),
        userRow.id,
        `Account Activation (${amountLabel}) via ${pmRow.name} · Tx ${txValidation.normalized}`,
        settings.activationFeeUsd,
        roundUsd(userRow.balance_usd),
        nowIso
      );

      recordActivityLog({
        category: 'Deposit Submission',
        userId: userRow.id,
        userEmail: userRow.email,
        userName: userRow.full_name,
        actionTitle: 'Account Activation Fee Submitted',
        details: `${amountLabel} via ${pmRow.name} · Tx ${txValidation.normalized}`,
        amountUsd: settings.activationFeeUsd,
        ipAddress: getClientIp(req),
        status: 'Pending',
        createdAt: nowIso,
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json(bundle);
  });

  // --- USER INVESTMENT, DEPOSIT, DAILY ADS, TASK & WITHDRAWAL ROUTES ---

  app.post('/api/deposits', requireAuth, requireActivated, (req: AuthedRequest, res) => {
    const { planId, selectedAsset, paymentMethodId, txId, senderNote, customAmountUsd } = req.body ?? {};

    const txValidation = validateTxId(String(txId ?? ''));
    if (!txValidation.valid) {
      res.status(400).json({ error: txValidation.error });
      return;
    }

    const duplicateTx = db
      .prepare("SELECT id FROM deposits WHERE LOWER(tx_id) = LOWER(?) AND status != 'Rejected'")
      .get(txValidation.normalized) as { id: string } | undefined;
    if (duplicateTx) {
      res.status(409).json({ error: 'This Transaction ID has already been submitted.' });
      return;
    }

    const pmRow = db
      .prepare('SELECT * FROM payment_methods WHERE id = ? AND is_active = 1')
      .get(String(paymentMethodId ?? '')) as Parameters<typeof mapPaymentMethod>[0] | undefined;
    if (!pmRow) {
      res.status(400).json({ error: 'Selected payment method is unavailable.' });
      return;
    }

    let resolvedPlanId: string | null = null;
    let resolvedPlanName: string | null = null;
    let amountUsd = 0;
    let allowedAssets: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

    if (planId) {
      const planRow = db
        .prepare('SELECT * FROM vip_plans WHERE id = ? AND is_active = 1')
        .get(String(planId)) as Parameters<typeof mapPlan>[0] | undefined;
      if (!planRow) {
        res.status(400).json({ error: 'Selected VIP plan is unavailable.' });
        return;
      }
      const mapped = mapPlan(planRow);
      resolvedPlanId = mapped.id;
      resolvedPlanName = mapped.name;
      amountUsd = mapped.amountUsd;
      allowedAssets = mapped.supportedAssets;
    } else {
      const parsedAmount = Number(customAmountUsd);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 1 || parsedAmount > 100000) {
        res.status(400).json({ error: 'Deposit amount must be at least $1.00.' });
        return;
      }
      amountUsd = roundUsd(parsedAmount);
    }

    const asset = String(selectedAsset ?? 'Gold') as SupportedAsset;
    if (!allowedAssets.includes(asset)) {
      res.status(400).json({ error: `Asset ${asset} is not enabled for this plan.` });
      return;
    }

    const userRow = db
      .prepare('SELECT email, full_name, balance_usd FROM users WHERE id = ?')
      .get(req.auth!.sub) as {
      email: string;
      full_name: string;
      balance_usd: number;
    };

    const depositId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const cleanNote = String(senderNote ?? '').trim().slice(0, 240);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO deposits (id, user_id, plan_id, plan_name, selected_asset, payment_method_id, payment_method_name, amount_usd, tx_id, sender_note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
      ).run(
        depositId,
        req.auth!.sub,
        resolvedPlanId,
        resolvedPlanName,
        asset,
        pmRow.id,
        pmRow.name,
        amountUsd,
        txValidation.normalized,
        cleanNote,
        nowIso
      );

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Deposit', ?, 'Credit', ?, ?, 'Pending', ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `${resolvedPlanName ? `${resolvedPlanName} (${asset})` : 'Wallet Deposit'} via ${pmRow.name} · Tx ${txValidation.normalized.slice(0, 12)}`,
        amountUsd,
        roundUsd(userRow.balance_usd),
        nowIso
      );

      recordActivityLog({
        category: 'Deposit Submission',
        userId: req.auth!.sub,
        userEmail: userRow.email,
        userName: userRow.full_name,
        actionTitle: resolvedPlanName
          ? `Plan Deposit Submitted (${resolvedPlanName})`
          : 'Wallet Deposit Submitted',
        details: `${resolvedPlanName ? `${resolvedPlanName} (${asset})` : `Wallet Balance (${asset})`} via ${pmRow.name} · Tx ${txValidation.normalized}`,
        amountUsd,
        ipAddress: getClientIp(req),
        status: 'Pending',
        createdAt: nowIso,
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json({ depositId, ...bundle });
  });

  app.post('/api/investments/from-balance', requireAuth, requireActivated, (req: AuthedRequest, res) => {
    if (req.auth?.fundsFrozen) {
      res.status(403).json({ error: 'Account funds are currently frozen by an administrator.' });
      return;
    }

    const { planId, selectedAsset } = req.body ?? {};
    const planRow = db
      .prepare('SELECT * FROM vip_plans WHERE id = ? AND is_active = 1')
      .get(String(planId ?? '')) as Parameters<typeof mapPlan>[0] | undefined;

    if (!planRow) {
      res.status(400).json({ error: 'Selected VIP plan is unavailable.' });
      return;
    }

    const mappedPlan = mapPlan(planRow);
    const asset = String(selectedAsset ?? 'Gold') as SupportedAsset;
    if (!mappedPlan.supportedAssets.includes(asset)) {
      res.status(400).json({ error: `Asset ${asset} is not enabled for ${mappedPlan.name}.` });
      return;
    }

    const dailyIncome = calculateDailyIncome(mappedPlan.amountUsd, mappedPlan.dailyRatePerDollar);
    const nowIso = new Date().toISOString();
    const expiresAtIso = calculatePlanExpiryIso(nowIso, mappedPlan.durationDays);

    db.exec('BEGIN IMMEDIATE');
    try {
      const userRow = db
        .prepare('SELECT email, full_name, balance_usd FROM users WHERE id = ?')
        .get(req.auth!.sub) as {
        email: string;
        full_name: string;
        balance_usd: number;
      };
      if (roundUsd(userRow.balance_usd) < mappedPlan.amountUsd) {
        db.exec('ROLLBACK');
        res.status(400).json({
          error: `Insufficient available balance. Required $${mappedPlan.amountUsd.toFixed(2)}, available $${userRow.balance_usd.toFixed(2)}.`,
        });
        return;
      }

      const newBalance = roundUsd(userRow.balance_usd - mappedPlan.amountUsd);
      db.prepare('UPDATE users SET balance_usd = ?, total_invested_usd = total_invested_usd + ? WHERE id = ?').run(
        newBalance,
        mappedPlan.amountUsd,
        req.auth!.sub
      );

      const investmentId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, source_deposit_id, status, purchased_at, duration_days, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'Active', ?, ?, ?, ?)`
      ).run(
        investmentId,
        req.auth!.sub,
        mappedPlan.id,
        mappedPlan.name,
        asset,
        mappedPlan.amountUsd,
        dailyIncome,
        nowIso,
        mappedPlan.durationDays,
        expiresAtIso,
        nowIso
      );

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Plan Purchase', ?, 'Debit', ?, ?, 'Completed', ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `Activated ${mappedPlan.name} (${asset}, ${formatDurationLabel(mappedPlan.durationDays)}) from Available Balance`,
        mappedPlan.amountUsd,
        newBalance,
        nowIso
      );

      recordActivityLog({
        category: 'Investment Activation',
        userId: req.auth!.sub,
        userEmail: userRow.email,
        userName: userRow.full_name,
        actionTitle: `VIP Plan Activated (${mappedPlan.name})`,
        details: `${mappedPlan.name} (${asset}, ${formatDurationLabel(mappedPlan.durationDays)}) via Available Balance`,
        amountUsd: mappedPlan.amountUsd,
        ipAddress: getClientIp(req),
        status: 'Active',
        createdAt: nowIso,
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json(bundle);
  });

  app.post('/api/tasks/claim', requireAuth, requireActivated, (req: AuthedRequest, res) => {
    const investmentId = String(req.body?.investmentId ?? '').trim();
    if (!investmentId) {
      res.status(400).json({ error: 'Investment position ID is required.' });
      return;
    }

    // Run time-based expiration sweep BEFORE opening transaction
    expireDueInvestments({ userId: req.auth!.sub });

    const nowMs = Date.now();
    const todayDate = new Date(nowMs).toISOString().slice(0, 10);
    const nowIso = new Date(nowMs).toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const inv = db
        .prepare('SELECT * FROM investments WHERE id = ? AND user_id = ?')
        .get(investmentId, req.auth!.sub) as
        | {
            id: string;
            plan_name: string;
            selected_asset: string;
            daily_income_usd: number;
            status: string;
            expires_at: string | null;
            last_claimed_date: string | null;
          }
        | undefined;

      if (!inv) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Investment position not found.' });
        return;
      }

      if (inv.status === 'Expired' || isPlanExpired(inv.expires_at, nowMs)) {
        if (inv.status === 'Active') {
          expireDueInvestments({ userId: req.auth!.sub, nowMs, skipTransaction: true });
          db.exec('COMMIT');
        } else {
          db.exec('ROLLBACK');
        }
        res.status(400).json({
          error: 'This fixed-term investment plan has expired and was automatically deactivated.',
        });
        return;
      }

      if (inv.status !== 'Active') {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'This investment position is not active.' });
        return;
      }

      if (inv.last_claimed_date === todayDate) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'Daily trading task for this position has already been completed today.' });
        return;
      }

      const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(req.auth!.sub) as {
        balance_usd: number;
      };
      const reward = roundUsd(inv.daily_income_usd);
      const newBalance = roundUsd(userRow.balance_usd + reward);

      db.prepare(
        'UPDATE users SET balance_usd = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?'
      ).run(newBalance, reward, req.auth!.sub);

      db.prepare(
        'UPDATE investments SET last_claimed_date = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?'
      ).run(todayDate, reward, inv.id);

      db.prepare(
        `INSERT INTO task_records (id, user_id, investment_id, plan_name, asset, task_title, reward_usd, status, task_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        inv.id,
        inv.plan_name,
        inv.selected_asset,
        `Daily Market Settlement · ${inv.plan_name} (${inv.selected_asset})`,
        reward,
        todayDate,
        nowIso
      );

      db.prepare(
        `INSERT INTO earnings_records (id, user_id, type, title, asset, amount_usd, reference_id, created_at)
         VALUES (?, ?, 'Daily Yield', ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `${inv.plan_name} Daily Yield ($0.01/$1)`,
        inv.selected_asset,
        reward,
        inv.id,
        nowIso
      );

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Daily Yield', ?, 'Credit', ?, ?, 'Completed', ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `Daily yield claimed for ${inv.plan_name} (${inv.selected_asset})`,
        reward,
        newBalance,
        nowIso
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.json(bundle);
  });

  // --- DAILY AD VIEWING REWARDS ---

  app.get('/api/ads', (_req, res) => {
    const ads = (
      db.prepare('SELECT * FROM ads WHERE is_active = 1 ORDER BY created_at DESC').all() as Array<
        Parameters<typeof mapAd>[0]
      >
    ).map((row) => mapAd(row));
    res.json({ ads });
  });

  app.post('/api/ads/:id/claim', requireAuth, requireActivated, (req: AuthedRequest, res) => {
    const adId = req.params.id;
    const todayDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const ad = db.prepare('SELECT * FROM ads WHERE id = ? AND is_active = 1').get(adId) as
        | { id: string; title: string; reward_usd: number }
        | undefined;
      if (!ad) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Advertisement campaign not found or inactive.' });
        return;
      }

      const alreadyClaimed = db
        .prepare('SELECT id FROM ad_claims WHERE user_id = ? AND ad_id = ? AND claim_date = ?')
        .get(req.auth!.sub, ad.id, todayDate);
      if (alreadyClaimed) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'You have already claimed today’s reward for this advertisement.' });
        return;
      }

      const reward = roundUsd(ad.reward_usd);
      const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(req.auth!.sub) as {
        balance_usd: number;
      };
      const newBalance = roundUsd(userRow.balance_usd + reward);

      db.prepare('UPDATE users SET balance_usd = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?').run(
        newBalance,
        reward,
        req.auth!.sub
      );

      db.prepare(
        'INSERT INTO ad_claims (id, user_id, ad_id, claim_date, reward_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), req.auth!.sub, ad.id, todayDate, reward, nowIso);

      db.prepare(
        `INSERT INTO earnings_records (id, user_id, type, title, asset, amount_usd, reference_id, created_at)
         VALUES (?, ?, 'Ad Viewing Reward', ?, 'USD', ?, ?, ?)`
      ).run(crypto.randomUUID(), req.auth!.sub, `Ad Reward: ${ad.title}`, reward, ad.id, nowIso);

      db.prepare(
        `INSERT INTO task_records (id, user_id, investment_id, plan_name, asset, task_title, reward_usd, status, task_date, created_at)
         VALUES (?, ?, ?, 'Daily Ads', 'USD', ?, ?, 'Completed', ?, ?)`
      ).run(crypto.randomUUID(), req.auth!.sub, ad.id, `Watched Ad: ${ad.title}`, reward, todayDate, nowIso);

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Ad Reward', ?, 'Credit', ?, ?, 'Completed', ?)`
      ).run(crypto.randomUUID(), req.auth!.sub, `Daily ad viewing reward: ${ad.title}`, reward, newBalance, nowIso);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.json(bundle);
  });

  // --- DIRECT ADMIN MESSAGING ---

  app.get('/api/messages', requireAuth, (req: AuthedRequest, res) => {
    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.json({ messages: bundle?.messages ?? [] });
  });

  app.post('/api/messages', requireAuth, (req: AuthedRequest, res) => {
    const subject = String(req.body?.subject ?? 'Support Inquiry').trim().slice(0, 120);
    const body = String(req.body?.body ?? '').trim().slice(0, 1000);
    if (body.length < 3) {
      res.status(400).json({ error: 'Please write a message of at least 3 characters.' });
      return;
    }

    db.prepare(
      `INSERT INTO messages (id, user_id, sender_role, sender_email, subject, body, is_read, created_at)
       VALUES (?, ?, 'user', ?, ?, ?, 0, ?)`
    ).run(crypto.randomUUID(), req.auth!.sub, req.auth!.email, subject || 'Support Inquiry', body, new Date().toISOString());

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json(bundle);
  });

  app.post('/api/withdrawals', requireAuth, requireActivated, (req: AuthedRequest, res) => {
    if (req.auth?.fundsFrozen) {
      res.status(403).json({
        error: 'Your funds are currently frozen by an administrator. Withdrawals are disabled.',
      });
      return;
    }

    const { paymentMethodName, walletAddress, amountUsd } = req.body ?? {};
    const settings = getPlatformSettings();
    const method = String(paymentMethodName ?? '').trim();
    const address = String(walletAddress ?? '').trim();
    const amount = roundUsd(Number(amountUsd));

    if (!method) {
      res.status(400).json({ error: 'Select a receiving payment method.' });
      return;
    }
    if (address.length < 8 || address.length > 120 || /\s/.test(address)) {
      res.status(400).json({ error: 'Enter a valid P2P number, Binance ID, or USDT wallet address.' });
      return;
    }
    if (!Number.isFinite(amount) || amount < settings.minWithdrawalUsd) {
      res.status(400).json({
        error: `Minimum withdrawal is $${settings.minWithdrawalUsd.toFixed(2)}.`,
      });
      return;
    }

    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(req.auth!.sub) as {
        balance_usd: number;
      };
      if (roundUsd(userRow.balance_usd) < amount) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'Withdrawal amount exceeds your available balance.' });
        return;
      }

      const newBalance = roundUsd(userRow.balance_usd - amount);
      db.prepare('UPDATE users SET balance_usd = ? WHERE id = ?').run(newBalance, req.auth!.sub);

      db.prepare(
        `INSERT INTO withdrawals (id, user_id, payment_method_name, wallet_address, amount_usd, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'Pending', ?)`
      ).run(crypto.randomUUID(), req.auth!.sub, method, address, amount, nowIso);

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Withdrawal', ?, 'Debit', ?, ?, 'Pending', ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `Withdrawal request to ${method} (${address.slice(0, 10)}...)`,
        amount,
        newBalance,
        nowIso
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json(bundle);
  });

  // --- ADMIN AUTHENTICATION & MANAGEMENT ROUTES ---

  app.post('/api/admin/bootstrap', (req, res) => {
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number })
      .count;
    if (adminCount > 0) {
      res.status(403).json({ error: 'Primary administrator has already been initialized. Please sign in.' });
      return;
    }

    const { fullName, email, password, passcode } = req.body ?? {};
    const configuredPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();
    if (configuredPasscode && !verifyAdminPasscode(String(passcode ?? ''), configuredPasscode)) {
      res.status(403).json({ error: 'Invalid admin setup passcode.' });
      return;
    }

    const emailCheck = validateEmailAddress(String(email ?? ''));
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }

    const name = String(fullName ?? '').trim();
    if (name.length < 2) {
      res.status(400).json({ error: 'Administrator full name is required.' });
      return;
    }

    const rawPassword = String(password ?? '');
    if (rawPassword.length < 6) {
      res.status(400).json({ error: 'Administrator password must be at least 6 characters.' });
      return;
    }

    const passwordHash = hashPassword(rawPassword);
    const nowIso = new Date().toISOString();

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(emailCheck.normalized) as
      | { id: string }
      | undefined;

    let adminId: string;
    if (existingUser) {
      adminId = existingUser.id;
      db.prepare(
        "UPDATE users SET full_name = ?, password_hash = ?, role = 'admin', is_verified = 1, activation_status = 'Activated' WHERE id = ?"
      ).run(name, passwordHash, adminId);
    } else {
      adminId = crypto.randomUUID();
      let refCode = generateReferralCode(emailCheck.normalized);
      while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(refCode)) {
        refCode = generateReferralCode(emailCheck.normalized);
      }
      db.prepare(
        `INSERT INTO users (id, email, phone_number, full_name, password_hash, role, is_verified, activation_status, is_blocked, funds_frozen, referral_code, created_at)
         VALUES (?, ?, '+0000000000', ?, ?, 'admin', 1, 'Activated', 0, 0, ?, ?)`
      ).run(adminId, emailCheck.normalized, name, passwordHash, refCode, nowIso);
    }

    recordActivityLog({
      category: 'User Login',
      userId: adminId,
      userEmail: emailCheck.normalized,
      userName: name,
      actionTitle: 'Primary Admin Initialized & Signed In',
      details: 'Primary administrator account claimed',
      ipAddress: getClientIp(req),
      status: 'Completed',
      createdAt: nowIso,
    });

    const token = signSessionToken({ sub: adminId, email: emailCheck.normalized, role: 'admin' });
    const bundle = getUserDashboardBundle(adminId);
    res.status(201).json({ token, ...bundle });
  });

  app.post('/api/admin/login', (req, res) => {
    const { email, password, passcode } = req.body ?? {};
    const configuredPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();

    if (configuredPasscode && passcode && verifyAdminPasscode(String(passcode), configuredPasscode)) {
      const adminRow = db
        .prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
        .get() as DbUserRow | undefined;
      if (adminRow) {
        recordActivityLog({
          category: 'User Login',
          userId: adminRow.id,
          userEmail: adminRow.email,
          userName: adminRow.full_name,
          actionTitle: 'Administrator Signed In (Passcode)',
          details: 'Admin portal passcode authentication',
          ipAddress: getClientIp(req),
          status: 'Completed',
        });
        const token = signSessionToken({ sub: adminRow.id, email: adminRow.email, role: 'admin' });
        const bundle = getUserDashboardBundle(adminRow.id);
        res.json({ token, ...bundle });
        return;
      }
    }

    const emailCheck = validateEmailAddress(String(email ?? ''));
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }

    const adminRow = db
      .prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'")
      .get(emailCheck.normalized) as DbUserRow | undefined;

    if (!adminRow || !verifyPassword(String(password ?? ''), adminRow.password_hash)) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    recordActivityLog({
      category: 'User Login',
      userId: adminRow.id,
      userEmail: adminRow.email,
      userName: adminRow.full_name,
      actionTitle: 'Administrator Signed In',
      details: 'Admin portal password authentication',
      ipAddress: getClientIp(req),
      status: 'Completed',
    });

    const token = signSessionToken({ sub: adminRow.id, email: adminRow.email, role: 'admin' });
    const bundle = getUserDashboardBundle(adminRow.id);
    res.json({ token, ...bundle });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    expireDueInvestments();
    const settings = getPlatformSettings();

    const activations = (
      db
        .prepare(
          `SELECT a.*, u.email as user_email, u.phone_number as user_phone
           FROM activation_requests a
           JOIN users u ON u.id = a.user_id
           ORDER BY CASE WHEN a.status = 'Pending' THEN 0 ELSE 1 END, a.created_at DESC`
        )
        .all() as Array<{
        id: string;
        user_id: string;
        user_email: string;
        user_phone: string;
        payment_method_id: string;
        payment_method_name: string;
        amount_label: string;
        amount_usd: number;
        tx_id: string;
        sender_account: string;
        status: 'Pending' | 'Approved' | 'Rejected';
        admin_note: string;
        created_at: string;
        reviewed_at: string | null;
      }>
    ).map<ActivationRequest>((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      userPhone: r.user_phone,
      paymentMethodId: r.payment_method_id,
      paymentMethodName: r.payment_method_name,
      amountLabel: r.amount_label,
      amountUsd: roundUsd(r.amount_usd),
      txId: r.tx_id,
      senderAccount: r.sender_account,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }));

    const deposits = (
      db
        .prepare(
          `SELECT d.*, u.email as user_email
           FROM deposits d
           JOIN users u ON u.id = d.user_id
           ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END, d.created_at DESC`
        )
        .all() as Array<{
        id: string;
        user_id: string;
        user_email: string;
        plan_id: string | null;
        plan_name: string | null;
        selected_asset: SupportedAsset;
        payment_method_id: string;
        payment_method_name: string;
        amount_usd: number;
        tx_id: string;
        sender_note: string;
        status: 'Pending' | 'Approved' | 'Rejected';
        admin_note: string;
        reviewed_by: string | null;
        reviewed_at: string | null;
        created_at: string;
      }>
    ).map<DepositRecord>((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      planId: r.plan_id,
      planName: r.plan_name,
      selectedAsset: r.selected_asset,
      paymentMethodId: r.payment_method_id,
      paymentMethodName: r.payment_method_name,
      amountUsd: roundUsd(r.amount_usd),
      txId: r.tx_id,
      senderNote: r.sender_note,
      status: r.status,
      adminNote: r.admin_note,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    }));

    const withdrawals = (
      db
        .prepare(
          `SELECT w.*, u.email as user_email
           FROM withdrawals w
           JOIN users u ON u.id = w.user_id
           ORDER BY CASE WHEN w.status = 'Pending' THEN 0 ELSE 1 END, w.created_at DESC`
        )
        .all() as Array<{
        id: string;
        user_id: string;
        user_email: string;
        payment_method_name: string;
        wallet_address: string;
        amount_usd: number;
        status: 'Pending' | 'Approved' | 'Rejected';
        admin_note: string;
        created_at: string;
        reviewed_at: string | null;
      }>
    ).map<WithdrawalRecord>((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      paymentMethodName: r.payment_method_name,
      walletAddress: r.wallet_address,
      amountUsd: roundUsd(r.amount_usd),
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }));

    const plans = (
      db
        .prepare(
          'SELECT * FROM vip_plans WHERE amount_usd <= ? ORDER BY sort_order ASC, amount_usd ASC, tier_number ASC'
        )
        .all(MAX_PLAN_AMOUNT_USD) as Array<Parameters<typeof mapPlan>[0]>
    ).map(mapPlan);

    const paymentMethods = (
      db.prepare('SELECT * FROM payment_methods ORDER BY sort_order ASC').all() as Array<
        Parameters<typeof mapPaymentMethod>[0]
      >
    ).map(mapPaymentMethod);

    const ads = (
      db.prepare('SELECT * FROM ads ORDER BY created_at DESC').all() as Array<Parameters<typeof mapAd>[0]>
    ).map((row) => mapAd(row));

    const users = (
      db
        .prepare(
          'SELECT id, email, phone_number, full_name, password_enc, role, activation_status, is_blocked, funds_frozen, balance_usd, total_invested_usd, created_at FROM users ORDER BY created_at DESC'
        )
        .all() as Array<{
        id: string;
        email: string;
        phone_number: string;
        full_name: string;
        password_enc: string | null;
        role: 'user' | 'admin';
        activation_status: ActivationStatus;
        is_blocked: number;
        funds_frozen: number;
        balance_usd: number;
        total_invested_usd: number;
        created_at: string;
      }>
    ).map<AdminManagedUser>((u) => ({
      id: u.id,
      email: u.email,
      phoneNumber: u.phone_number ?? '',
      fullName: u.full_name,
      role: u.role,
      activationStatus: (u.activation_status ?? 'Unpaid') as ActivationStatus,
      isBlocked: u.is_blocked === 1,
      fundsFrozen: u.funds_frozen === 1,
      balanceUsd: roundUsd(u.balance_usd),
      totalInvestedUsd: roundUsd(u.total_invested_usd),
      savedPassword: u.role === 'admin' ? null : decryptRecoverablePassword(u.password_enc),
      createdAt: u.created_at,
    }));

    const messages = (
      db
        .prepare(
          `SELECT m.*, u.email as user_email, u.full_name as user_name
           FROM messages m
           JOIN users u ON u.id = m.user_id
           ORDER BY m.created_at DESC`
        )
        .all() as Array<{
        id: string;
        user_id: string;
        user_email: string;
        user_name: string;
        sender_role: 'user' | 'admin';
        sender_email: string;
        subject: string;
        body: string;
        is_read: number;
        created_at: string;
      }>
    ).map<DirectMessage>((m) => ({
      id: m.id,
      userId: m.user_id,
      userEmail: m.user_email,
      userName: m.user_name,
      senderRole: m.sender_role,
      senderEmail: m.sender_email,
      subject: m.subject,
      body: m.body,
      isRead: m.is_read === 1,
      createdAt: m.created_at,
    }));

    const admins = (
      db
        .prepare("SELECT id, email, full_name, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at ASC")
        .all() as Array<{
        id: string;
        email: string;
        full_name: string;
        role: 'user' | 'admin';
        created_at: string;
      }>
    ).map<AdminUserSummary>((a) => ({
      id: a.id,
      email: a.email,
      fullName: a.full_name,
      role: a.role,
      createdAt: a.created_at,
    }));

    const stats = {
      totalUsers: users.length,
      pendingActivations: activations.filter((a) => a.status === 'Pending').length,
      pendingDeposits: deposits.filter((d) => d.status === 'Pending').length,
      pendingWithdrawals: withdrawals.filter((w) => w.status === 'Pending').length,
      unreadMessages: messages.filter((m) => m.senderRole === 'user' && !m.isRead).length,
      approvedVolumeUsd: roundUsd(
        deposits.filter((d) => d.status === 'Approved').reduce((acc, d) => acc + d.amountUsd, 0)
      ),
      activePositions: (
        db.prepare("SELECT COUNT(*) as count FROM investments WHERE status = 'Active'").get() as { count: number }
      ).count,
    };

    const activityLogs = queryActivityLogs({ limit: 500 });

    res.json({
      settings,
      activations,
      deposits,
      withdrawals,
      plans,
      paymentMethods,
      ads,
      users,
      messages,
      admins,
      activityLogs,
      stats,
    });
  });

  app.get('/api/admin/activity-logs/export', requireAdmin, (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const logs = queryActivityLogs({ category, q, limit: 10000 });
    const csvContent = formatActivityLogsCsv(logs);
    const dateStamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${dateStamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csvContent);
  });

  app.post('/api/admin/activations/:id/review', requireAdmin, (req: AuthedRequest, res) => {
    const reqId = req.params.id;
    const action = String(req.body?.action ?? '').toLowerCase();
    const adminNote = String(req.body?.adminNote ?? '').trim().slice(0, 240);

    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ error: 'Action must be approve or reject.' });
      return;
    }

    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const activation = db.prepare('SELECT * FROM activation_requests WHERE id = ?').get(reqId) as
        | { id: string; user_id: string; amount_label: string; amount_usd: number; tx_id: string; status: string }
        | undefined;
      if (!activation) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Activation request not found.' });
        return;
      }
      if (activation.status !== 'Pending') {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Activation request has already been reviewed.' });
        return;
      }

      const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(activation.user_id) as {
        balance_usd: number;
      };

      if (action === 'approve') {
        db.prepare("UPDATE activation_requests SET status = 'Approved', admin_note = ?, reviewed_at = ? WHERE id = ?").run(
          adminNote || 'Account verified and manually activated.',
          nowIso,
          activation.id
        );
        db.prepare("UPDATE users SET activation_status = 'Activated' WHERE id = ?").run(activation.user_id);
        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Activation Fee', ?, 'Debit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          activation.user_id,
          `Account Activated (${activation.amount_label}) · Tx ${activation.tx_id}`,
          activation.amount_usd,
          roundUsd(userRow.balance_usd),
          nowIso
        );
      } else {
        db.prepare("UPDATE activation_requests SET status = 'Rejected', admin_note = ?, reviewed_at = ? WHERE id = ?").run(
          adminNote || 'Activation payment could not be verified.',
          nowIso,
          activation.id
        );
        db.prepare("UPDATE users SET activation_status = 'Unpaid' WHERE id = ?").run(activation.user_id);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/status', requireAdmin, (req: AuthedRequest, res) => {
    const targetId = req.params.id;
    const { isBlocked, fundsFrozen, activationStatus } = req.body ?? {};
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as
      | { id: string; role: string }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === req.auth!.sub && isBlocked === true) {
      res.status(400).json({ error: 'You cannot block your own administrator session.' });
      return;
    }

    if (typeof isBlocked === 'boolean') {
      db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(isBlocked ? 1 : 0, targetId);
    }
    if (typeof fundsFrozen === 'boolean') {
      db.prepare('UPDATE users SET funds_frozen = ? WHERE id = ?').run(fundsFrozen ? 1 : 0, targetId);
    }
    if (activationStatus === 'Activated' || activationStatus === 'Unpaid' || activationStatus === 'Pending') {
      db.prepare('UPDATE users SET activation_status = ? WHERE id = ?').run(activationStatus, targetId);
    }

    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/password', requireAdmin, (req: AuthedRequest, res) => {
    const targetId = req.params.id;
    const rawPassword = String(req.body?.newPassword ?? '');
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
      return;
    }

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId) as
      | { id: string; role: string }
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.role === 'admin' && target.id !== req.auth!.sub) {
      res.status(403).json({ error: 'Cannot change another administrator password from user recovery.' });
      return;
    }

    const passwordHash = hashPassword(rawPassword);
    const passwordEnc = target.role === 'admin' ? null : encryptRecoverablePassword(rawPassword);
    db.prepare('UPDATE users SET password_hash = ?, password_enc = ? WHERE id = ?').run(
      passwordHash,
      passwordEnc,
      targetId
    );

    res.json({ ok: true });
  });

  app.post('/api/admin/deposits/:id/review', requireAdmin, (req: AuthedRequest, res) => {
    const depositId = req.params.id;
    const action = String(req.body?.action ?? '').toLowerCase();
    const adminNote = String(req.body?.adminNote ?? '').trim().slice(0, 240);

    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ error: 'Action must be approve or reject.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const settings = getPlatformSettings();

    db.exec('BEGIN IMMEDIATE');
    try {
      const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId) as
        | {
            id: string;
            user_id: string;
            plan_id: string | null;
            plan_name: string | null;
            selected_asset: SupportedAsset;
            payment_method_name: string;
            amount_usd: number;
            tx_id: string;
            status: string;
          }
        | undefined;

      if (!deposit) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Deposit record not found.' });
        return;
      }

      if (deposit.status !== 'Pending') {
        db.exec('ROLLBACK');
        res.status(409).json({ error: `Deposit has already been ${deposit.status.toLowerCase()}.` });
        return;
      }

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(deposit.user_id) as DbUserRow | undefined;
      if (!user) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Depositing user not found.' });
        return;
      }

      if (action === 'reject') {
        db.prepare(
          "UPDATE deposits SET status = 'Rejected', admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?"
        ).run(adminNote || 'Transaction ID could not be verified.', req.auth!.email, nowIso, deposit.id);

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Deposit', ?, 'Credit', ?, ?, 'Rejected', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          `Rejected deposit Tx ${deposit.tx_id.slice(0, 12)} (${adminNote || 'Verification failed'})`,
          deposit.amount_usd,
          roundUsd(user.balance_usd),
          nowIso
        );

        db.exec('COMMIT');
        res.json({ ok: true, status: 'Rejected' });
        return;
      }

      db.prepare(
        "UPDATE deposits SET status = 'Approved', admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?"
      ).run(adminNote || 'Verified and activated.', req.auth!.email, nowIso, deposit.id);

      let updatedBalance = roundUsd(user.balance_usd);
      if (deposit.plan_id) {
        const planRow = db
          .prepare('SELECT daily_rate_per_dollar, duration_days FROM vip_plans WHERE id = ?')
          .get(deposit.plan_id) as
          | { daily_rate_per_dollar: number; duration_days?: number }
          | undefined;
        const rate = planRow?.daily_rate_per_dollar ?? 0.01;
        const durationDays = sanitizeDurationDays(planRow?.duration_days, DEFAULT_DURATION_DAYS);
        const expiresAtIso = calculatePlanExpiryIso(nowIso, durationDays);
        const dailyIncome = calculateDailyIncome(deposit.amount_usd, rate);

        db.prepare('UPDATE users SET total_invested_usd = total_invested_usd + ? WHERE id = ?').run(
          deposit.amount_usd,
          user.id
        );

        db.prepare(
          `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, source_deposit_id, status, purchased_at, duration_days, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          deposit.plan_id,
          deposit.plan_name ?? 'VIP Plan',
          deposit.selected_asset,
          deposit.amount_usd,
          dailyIncome,
          deposit.id,
          nowIso,
          durationDays,
          expiresAtIso,
          nowIso
        );

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Plan Purchase', ?, 'Credit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          `Approved & Activated ${deposit.plan_name} (${deposit.selected_asset}, ${formatDurationLabel(durationDays)}) · Tx ${deposit.tx_id.slice(0, 12)}`,
          deposit.amount_usd,
          updatedBalance,
          nowIso
        );

        recordActivityLog({
          category: 'Investment Activation',
          userId: user.id,
          userEmail: user.email,
          userName: user.full_name,
          actionTitle: `VIP Plan Activated (${deposit.plan_name ?? 'VIP Plan'})`,
          details: `${deposit.plan_name ?? 'VIP Plan'} (${deposit.selected_asset}, ${formatDurationLabel(durationDays)}) approved by ${req.auth!.email} · Tx ${deposit.tx_id}`,
          amountUsd: deposit.amount_usd,
          ipAddress: getClientIp(req),
          status: 'Active',
          createdAt: nowIso,
        });
      } else {
        updatedBalance = roundUsd(user.balance_usd + deposit.amount_usd);
        db.prepare('UPDATE users SET balance_usd = ? WHERE id = ?').run(updatedBalance, user.id);

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Deposit', ?, 'Credit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          `Approved wallet deposit via ${deposit.payment_method_name} · Tx ${deposit.tx_id.slice(0, 12)}`,
          deposit.amount_usd,
          updatedBalance,
          nowIso
        );
      }

      // 10% Referral Commission Distribution
      if (user.referred_by_user_id) {
        const referrer = db.prepare('SELECT id, balance_usd FROM users WHERE id = ?').get(user.referred_by_user_id) as
          | { id: string; balance_usd: number }
          | undefined;
        if (referrer) {
          const commission = calculateReferralCommission(deposit.amount_usd, settings.referralCommissionPct);
          if (commission > 0) {
            const refNewBalance = roundUsd(referrer.balance_usd + commission);
            db.prepare(
              `UPDATE users
               SET balance_usd = ?, total_earned_usd = total_earned_usd + ?, total_referral_earned_usd = total_referral_earned_usd + ?
               WHERE id = ?`
            ).run(refNewBalance, commission, commission, referrer.id);

            db.prepare(
              `INSERT INTO earnings_records (id, user_id, type, title, asset, amount_usd, reference_id, created_at)
               VALUES (?, ?, 'Referral Commission', ?, 'USD', ?, ?, ?)`
            ).run(
              crypto.randomUUID(),
              referrer.id,
              `${settings.referralCommissionPct}% Commission from ${maskEmail(user.email)}`,
              commission,
              deposit.id,
              nowIso
            );

            db.prepare(
              `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
               VALUES (?, ?, 'Referral Commission', ?, 'Credit', ?, ?, 'Completed', ?)`
            ).run(
              crypto.randomUUID(),
              referrer.id,
              `${settings.referralCommissionPct}% Referral Bonus from ${maskEmail(user.email)}`,
              commission,
              refNewBalance,
              nowIso
            );
          }
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true, status: 'Approved' });
  });

  app.post('/api/admin/withdrawals/:id/review', requireAdmin, (req: AuthedRequest, res) => {
    const withdrawalId = req.params.id;
    const action = String(req.body?.action ?? '').toLowerCase();
    const adminNote = String(req.body?.adminNote ?? '').trim().slice(0, 240);

    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ error: 'Action must be approve or reject.' });
      return;
    }

    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId) as
        | { id: string; user_id: string; amount_usd: number; status: string; payment_method_name: string }
        | undefined;
      if (!withdrawal) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Withdrawal not found.' });
        return;
      }
      if (withdrawal.status !== 'Pending') {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Withdrawal has already been reviewed.' });
        return;
      }

      if (action === 'approve') {
        db.prepare("UPDATE withdrawals SET status = 'Approved', admin_note = ?, reviewed_at = ? WHERE id = ?").run(
          adminNote || 'Disbursed.',
          nowIso,
          withdrawal.id
        );
      } else {
        const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(withdrawal.user_id) as {
          balance_usd: number;
        };
        const refundedBalance = roundUsd(userRow.balance_usd + withdrawal.amount_usd);
        db.prepare('UPDATE users SET balance_usd = ? WHERE id = ?').run(refundedBalance, withdrawal.user_id);
        db.prepare("UPDATE withdrawals SET status = 'Rejected', admin_note = ?, reviewed_at = ? WHERE id = ?").run(
          adminNote || 'Rejected and refunded to balance.',
          nowIso,
          withdrawal.id
        );
        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Withdrawal', ?, 'Credit', ?, ?, 'Rejected', ?)`
        ).run(
          crypto.randomUUID(),
          withdrawal.user_id,
          `Refunded rejected withdrawal (${withdrawal.payment_method_name})`,
          withdrawal.amount_usd,
          refundedBalance,
          nowIso
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const body = req.body ?? {};
    const upsert = db.prepare('INSERT OR REPLACE INTO platform_settings (key, value) VALUES (?, ?)');

    const stringFields: Array<[string, string]> = [
      ['brandName', String(body.brandName ?? '').trim()],
      ['brandTagline', String(body.brandTagline ?? '').trim()],
      ['heroHeadline', String(body.heroHeadline ?? '').trim()],
      ['heroSubheadline', String(body.heroSubheadline ?? '').trim()],
      ['announcementBanner', String(body.announcementBanner ?? '').trim()],
      ['extraBonusNotice', String(body.extraBonusNotice ?? '').trim()],
      ['supportEmail', String(body.supportEmail ?? '').trim()],
      ['telegramUrl', sanitizeExternalUrl(String(body.telegramUrl ?? ''))],
    ];

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [k, v] of stringFields) {
        if (v) upsert.run(k, v);
      }
      if (Number.isFinite(Number(body.minWithdrawalUsd)) && Number(body.minWithdrawalUsd) >= 0.1) {
        upsert.run('minWithdrawalUsd', String(roundUsd(Number(body.minWithdrawalUsd))));
      }
      if (Number.isFinite(Number(body.referralCommissionPct)) && Number(body.referralCommissionPct) >= 0) {
        upsert.run('referralCommissionPct', String(roundUsd(Number(body.referralCommissionPct))));
      }
      if (Number.isFinite(Number(body.activationFeeBdt)) && Number(body.activationFeeBdt) >= 1) {
        upsert.run('activationFeeBdt', String(roundUsd(Number(body.activationFeeBdt))));
      }
      if (Number.isFinite(Number(body.activationFeeUsd)) && Number(body.activationFeeUsd) >= 0.01) {
        upsert.run('activationFeeUsd', String(roundUsd(Number(body.activationFeeUsd))));
      }
      if (Number.isFinite(Number(body.defaultAdRewardUsd)) && Number(body.defaultAdRewardUsd) >= 0.001) {
        upsert.run('defaultAdRewardUsd', String(roundUsd(Number(body.defaultAdRewardUsd))));
      }
      if (Array.isArray(body.depositGuideSteps) && body.depositGuideSteps.length > 0) {
        upsert.run('depositGuideSteps', JSON.stringify(body.depositGuideSteps));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ settings: getPlatformSettings() });
  });

  app.post('/api/admin/payment-methods', requireAdmin, (req, res) => {
    const { name, network, walletAddress, instructions } = req.body ?? {};
    if (!String(name ?? '').trim() || !String(walletAddress ?? '').trim()) {
      res.status(400).json({ error: 'Payment method name and number/address are required.' });
      return;
    }

    const id = `pm-${crypto.randomBytes(4).toString('hex')}`;
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM payment_methods').get() as { m: number })
      .m;

    db.prepare(
      `INSERT INTO payment_methods (id, name, network, wallet_address, instructions, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      String(name).trim(),
      String(network ?? 'P2P / USDT').trim(),
      String(walletAddress).trim(),
      String(instructions ?? '').trim(),
      maxOrder + 1
    );

    res.status(201).json({ ok: true, id });
  });

  app.put('/api/admin/payment-methods/:id', requireAdmin, (req, res) => {
    const { name, network, walletAddress, instructions, isActive } = req.body ?? {};
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Payment method not found.' });
      return;
    }

    db.prepare(
      `UPDATE payment_methods
       SET name = ?, network = ?, wallet_address = ?, instructions = ?, is_active = ?
       WHERE id = ?`
    ).run(
      String(name ?? '').trim(),
      String(network ?? 'P2P / USDT').trim(),
      String(walletAddress ?? '').trim(),
      String(instructions ?? '').trim(),
      isActive === false ? 0 : 1,
      req.params.id
    );

    res.json({ ok: true });
  });

  app.delete('/api/admin/payment-methods/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/admin/plans', requireAdmin, (req, res) => {
    const {
      tierNumber,
      name,
      subtitle,
      amountUsd,
      dailyRatePerDollar,
      monthlyRatePerDollar,
      supportedAssets,
      durationDays,
      durationLabel,
    } = req.body ?? {};
    const amount = Number(amountUsd);
    const rate = Number(dailyRatePerDollar ?? 0.01);
    const monthlyRate = Number(monthlyRatePerDollar ?? 0.2);
    const rawDays = durationDays !== undefined ? Number(durationDays) : DEFAULT_DURATION_DAYS;
    if (!String(name ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid plan name and positive investment amount are required.' });
      return;
    }
    if (amount > MAX_PLAN_AMOUNT_USD) {
      res.status(400).json({ error: `Maximum VIP plan amount is $${MAX_PLAN_AMOUNT_USD.toFixed(2)}.` });
      return;
    }
    if (!Number.isFinite(rawDays) || rawDays < 0 || rawDays > 3650) {
      res.status(400).json({ error: 'Duration must be between 0 and 3650 days.' });
      return;
    }

    const sanitizedDays = sanitizeDurationDays(rawDays, DEFAULT_DURATION_DAYS);
    const resolvedDurationLabel = formatDurationLabel(sanitizedDays);
    const customLabel = String(durationLabel ?? '').trim();
    const finalLabel =
      durationDays !== undefined ? resolvedDurationLabel : customLabel || resolvedDurationLabel;

    const id = `vip-${crypto.randomBytes(3).toString('hex')}`;
    const assets =
      Array.isArray(supportedAssets) && supportedAssets.length > 0
        ? supportedAssets
        : ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

    db.prepare(
      `INSERT INTO vip_plans (id, tier_number, name, subtitle, amount_usd, daily_rate_per_dollar, monthly_rate_per_dollar, supported_assets, duration_days, duration_label, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      Number(tierNumber) || 8,
      String(name).trim(),
      String(subtitle ?? 'Custom VIP Tier').trim(),
      roundUsd(amount),
      Number.isFinite(rate) && rate >= 0 ? rate : 0.01,
      Number.isFinite(monthlyRate) && monthlyRate >= 0 ? monthlyRate : 0.2,
      JSON.stringify(assets),
      sanitizedDays,
      finalLabel,
      Number(tierNumber) || 8
    );

    res.status(201).json({ ok: true, id });
  });

  app.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
    const {
      name,
      subtitle,
      amountUsd,
      dailyRatePerDollar,
      monthlyRatePerDollar,
      supportedAssets,
      durationDays,
      durationLabel,
      isActive,
    } = req.body ?? {};
    const existing = db.prepare('SELECT id, duration_days FROM vip_plans WHERE id = ?').get(req.params.id) as
      | { id: string; duration_days?: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'VIP plan not found.' });
      return;
    }

    const amount = Number(amountUsd);
    const rate = Number(dailyRatePerDollar);
    const monthlyRate = Number(monthlyRatePerDollar ?? 0.2);
    const rawDays =
      durationDays !== undefined
        ? Number(durationDays)
        : sanitizeDurationDays(existing.duration_days, DEFAULT_DURATION_DAYS);

    if (!String(name ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid plan name and positive investment amount are required.' });
      return;
    }
    if (amount > MAX_PLAN_AMOUNT_USD) {
      res.status(400).json({ error: `Maximum VIP plan amount is $${MAX_PLAN_AMOUNT_USD.toFixed(2)}.` });
      return;
    }
    if (!Number.isFinite(rawDays) || rawDays < 0 || rawDays > 3650) {
      res.status(400).json({ error: 'Duration must be between 0 and 3650 days.' });
      return;
    }

    const sanitizedDays = sanitizeDurationDays(rawDays, DEFAULT_DURATION_DAYS);
    const resolvedDurationLabel = formatDurationLabel(sanitizedDays);
    const customLabel = String(durationLabel ?? '').trim();
    const finalLabel =
      durationDays !== undefined ? resolvedDurationLabel : customLabel || resolvedDurationLabel;

    const assets =
      Array.isArray(supportedAssets) && supportedAssets.length > 0
        ? supportedAssets
        : ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

    db.prepare(
      `UPDATE vip_plans
       SET name = ?, subtitle = ?, amount_usd = ?, daily_rate_per_dollar = ?, monthly_rate_per_dollar = ?, supported_assets = ?, duration_days = ?, duration_label = ?, is_active = ?
       WHERE id = ?`
    ).run(
      String(name).trim(),
      String(subtitle ?? '').trim(),
      roundUsd(amount),
      Number.isFinite(rate) && rate >= 0 ? rate : 0.01,
      Number.isFinite(monthlyRate) && monthlyRate >= 0 ? monthlyRate : 0.2,
      JSON.stringify(assets),
      sanitizedDays,
      finalLabel,
      isActive === false ? 0 : 1,
      req.params.id
    );

    res.json({ ok: true });
  });

  // --- ADMIN DAILY ADS CRUD ---

  function normalizeAdUrlInput(raw: unknown): string | null {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed || trimmed === '#') return '#';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      const safe = sanitizeExternalUrl(trimmed);
      return safe === '#' ? null : safe;
    }
    if (/\s/.test(trimmed)) return null;
    const safe = sanitizeExternalUrl(`https://${trimmed}`);
    return safe === '#' ? null : safe;
  }

  app.post('/api/admin/ads', requireAdmin, (req, res) => {
    const { title, description, targetUrl, rewardUsd, durationSeconds } = req.body ?? {};
    const cleanTitle = String(title ?? '').trim();
    const reward = Number(rewardUsd ?? getPlatformSettings().defaultAdRewardUsd);
    const duration = Math.max(3, Math.min(60, Number(durationSeconds ?? 5) || 5));
    const normalizedUrl = normalizeAdUrlInput(targetUrl ?? 'https://t.me/aurumcapital_official');

    if (cleanTitle.length < 2 || !Number.isFinite(reward) || reward <= 0) {
      res.status(400).json({ error: 'Ad title and positive USD reward are required.' });
      return;
    }
    if (normalizedUrl === null) {
      res.status(400).json({ error: 'Please enter a valid https:// or http:// ad link URL.' });
      return;
    }

    const id = `ad-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(
      `INSERT INTO ads (id, title, description, target_url, reward_usd, duration_seconds, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      cleanTitle,
      String(description ?? '').trim(),
      normalizedUrl,
      roundUsd(reward),
      duration,
      new Date().toISOString()
    );

    res.status(201).json({ ok: true, id });
  });

  app.post('/api/admin/ads/toggle-all', requireAdmin, (req, res) => {
    const isActive = req.body?.isActive !== false;
    db.prepare('UPDATE ads SET is_active = ?').run(isActive ? 1 : 0);
    res.json({ ok: true, isActive });
  });

  app.put('/api/admin/ads/:id', requireAdmin, (req, res) => {
    const { title, description, targetUrl, rewardUsd, durationSeconds, isActive } = req.body ?? {};
    const existing = db.prepare('SELECT id FROM ads WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Advertisement not found.' });
      return;
    }
    const reward = Number(rewardUsd);
    if (!String(title ?? '').trim() || !Number.isFinite(reward) || reward <= 0) {
      res.status(400).json({ error: 'Valid title and positive reward amount required.' });
      return;
    }
    const normalizedUrl = normalizeAdUrlInput(targetUrl ?? '');
    if (normalizedUrl === null) {
      res.status(400).json({ error: 'Please enter a valid https:// or http:// ad link URL.' });
      return;
    }

    db.prepare(
      `UPDATE ads SET title = ?, description = ?, target_url = ?, reward_usd = ?, duration_seconds = ?, is_active = ? WHERE id = ?`
    ).run(
      String(title).trim(),
      String(description ?? '').trim(),
      normalizedUrl,
      roundUsd(reward),
      Math.max(3, Math.min(60, Number(durationSeconds ?? 5) || 5)),
      isActive === false ? 0 : 1,
      req.params.id
    );

    res.json({ ok: true });
  });

  app.delete('/api/admin/ads/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM ads WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // --- ADMIN DIRECT MESSAGING ---

  app.post('/api/admin/messages/:userId/reply', requireAdmin, (req: AuthedRequest, res) => {
    const targetUserId = req.params.userId;
    const body = String(req.body?.body ?? '').trim().slice(0, 1000);
    if (body.length < 2) {
      res.status(400).json({ error: 'Reply message cannot be empty.' });
      return;
    }
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!userExists) {
      res.status(404).json({ error: 'Recipient user not found.' });
      return;
    }

    db.prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender_role = 'user'").run(targetUserId);
    db.prepare(
      `INSERT INTO messages (id, user_id, sender_role, sender_email, subject, body, is_read, created_at)
       VALUES (?, ?, 'admin', ?, 'Admin Response', ?, 1, ?)`
    ).run(crypto.randomUUID(), targetUserId, req.auth!.email, body, new Date().toISOString());

    res.status(201).json({ ok: true });
  });

  app.post('/api/admin/bonuses/distribute', requireAdmin, (req, res) => {
    const bonusPercent = Number(req.body?.bonusPercent ?? 1);
    const title = String(req.body?.title ?? 'Platform Surplus Trading Profit Bonus').trim();

    if (!Number.isFinite(bonusPercent) || bonusPercent <= 0 || bonusPercent > 100) {
      res.status(400).json({ error: 'Bonus percentage must be between 0.01% and 100%.' });
      return;
    }

    expireDueInvestments();

    const nowIso = new Date().toISOString();
    let distributedCount = 0;
    let totalDistributedUsd = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      const activePositions = db
        .prepare("SELECT * FROM investments WHERE status = 'Active'")
        .all() as Array<{
        id: string;
        user_id: string;
        plan_name: string;
        selected_asset: string;
        amount_usd: number;
      }>;

      for (const pos of activePositions) {
        const bonus = calculateExtraBonus(pos.amount_usd, bonusPercent);
        if (bonus <= 0) continue;

        const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(pos.user_id) as
          | { balance_usd: number }
          | undefined;
        if (!userRow) continue;

        const newBalance = roundUsd(userRow.balance_usd + bonus);
        db.prepare('UPDATE users SET balance_usd = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?').run(
          newBalance,
          bonus,
          pos.user_id
        );

        db.prepare(
          `INSERT INTO earnings_records (id, user_id, type, title, asset, amount_usd, reference_id, created_at)
           VALUES (?, ?, 'Extra Profit Bonus', ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          pos.user_id,
          `${title} (${bonusPercent}% on ${pos.plan_name})`,
          pos.selected_asset,
          bonus,
          pos.id,
          nowIso
        );

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Extra Bonus', ?, 'Credit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          pos.user_id,
          `${title} · ${pos.plan_name} (${pos.selected_asset})`,
          bonus,
          newBalance,
          nowIso
        );

        distributedCount += 1;
        totalDistributedUsd = roundUsd(totalDistributedUsd + bonus);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true, distributedCount, totalDistributedUsd });
  });

  app.post('/api/admin/yield/run-daily', requireAdmin, (_req, res) => {
    expireDueInvestments();
    const todayDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    let creditedCount = 0;

    db.exec('BEGIN IMMEDIATE');
    try {
      const duePositions = db
        .prepare("SELECT * FROM investments WHERE status = 'Active' AND (last_claimed_date IS NULL OR last_claimed_date != ?)")
        .all(todayDate) as Array<{
        id: string;
        user_id: string;
        plan_name: string;
        selected_asset: string;
        daily_income_usd: number;
      }>;

      for (const pos of duePositions) {
        const reward = roundUsd(pos.daily_income_usd);
        const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(pos.user_id) as
          | { balance_usd: number }
          | undefined;
        if (!userRow || reward <= 0) continue;

        const newBalance = roundUsd(userRow.balance_usd + reward);
        db.prepare('UPDATE users SET balance_usd = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?').run(
          newBalance,
          reward,
          pos.user_id
        );

        db.prepare(
          'UPDATE investments SET last_claimed_date = ?, total_earned_usd = total_earned_usd + ? WHERE id = ?'
        ).run(todayDate, reward, pos.id);

        db.prepare(
          `INSERT INTO task_records (id, user_id, investment_id, plan_name, asset, task_title, reward_usd, status, task_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)`
        ).run(
          crypto.randomUUID(),
          pos.user_id,
          pos.id,
          pos.plan_name,
          pos.selected_asset,
          `Automated Daily Yield · ${pos.plan_name} (${pos.selected_asset})`,
          reward,
          todayDate,
          nowIso
        );

        db.prepare(
          `INSERT INTO earnings_records (id, user_id, type, title, asset, amount_usd, reference_id, created_at)
           VALUES (?, ?, 'Daily Yield', ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          pos.user_id,
          `${pos.plan_name} Daily Yield`,
          pos.selected_asset,
          reward,
          pos.id,
          nowIso
        );

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Daily Yield', ?, 'Credit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          pos.user_id,
          `Automated daily yield for ${pos.plan_name} (${pos.selected_asset})`,
          reward,
          newBalance,
          nowIso
        );

        creditedCount += 1;
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true, creditedCount });
  });

  app.post('/api/admin/admins', requireAdmin, (req, res) => {
    const { fullName, email, password } = req.body ?? {};
    const emailCheck = validateEmailAddress(String(email ?? ''));
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }
    const name = String(fullName ?? '').trim();
    if (name.length < 2) {
      res.status(400).json({ error: 'Admin name must be at least 2 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(emailCheck.normalized) as
      | { id: string; role: string }
      | undefined;

    if (existing) {
      if (existing.role === 'admin') {
        res.status(409).json({ error: 'This account is already registered as an administrator.' });
        return;
      }
      db.prepare("UPDATE users SET role = 'admin', is_verified = 1, activation_status = 'Activated' WHERE id = ?").run(
        existing.id
      );
      res.status(201).json({ ok: true, promoted: true });
      return;
    }

    const rawPassword = String(password ?? '');
    if (rawPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters for a new admin account.' });
      return;
    }

    const id = crypto.randomUUID();
    let refCode = generateReferralCode(emailCheck.normalized);
    while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(refCode)) {
      refCode = generateReferralCode(emailCheck.normalized);
    }

    db.prepare(
      `INSERT INTO users (id, email, phone_number, full_name, password_hash, role, is_verified, activation_status, is_blocked, funds_frozen, referral_code, created_at)
       VALUES (?, ?, '+0000000000', ?, ?, 'admin', 1, 'Activated', 0, 0, ?, ?)`
    ).run(id, emailCheck.normalized, name, hashPassword(rawPassword), refCode, new Date().toISOString());

    res.status(201).json({ ok: true, id });
  });

  app.delete('/api/admin/admins/:id', requireAdmin, (req: AuthedRequest, res) => {
    if (req.params.id === req.auth!.sub) {
      res.status(400).json({ error: 'You cannot revoke your own active administrator session.' });
      return;
    }
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number })
      .count;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'At least one administrator must remain active.' });
      return;
    }

    db.prepare("UPDATE users SET role = 'user' WHERE id = ? AND role = 'admin'").run(req.params.id);
    res.json({ ok: true });
  });

  // Global API error middleware so unexpected runtime errors return safe JSON instead of crashing
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
    }
  });

  // Periodic background sweep every 60s to deactivate expired fixed-term plans automatically
  const expirySweepTimer = setInterval(() => {
    try {
      expireDueInvestments();
    } catch (err) {
      console.error('Background plan expiry sweep error:', err);
    }
  }, 60_000);
  expirySweepTimer.unref();

  // --- VITE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found.');
      }
    });
  }

  const port = Number(process.env.PORT ?? 3000) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
