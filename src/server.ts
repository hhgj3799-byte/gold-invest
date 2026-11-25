import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { db, getPlatformSettings, initDatabase } from './server/db.ts';
import {
  generateSixDigitOtp,
  hashOtp,
  hashPassword,
  isSmtpConfigured,
  sendOtpEmail,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type TokenPayload,
} from './server/auth.ts';
import {
  calculateDailyIncome,
  calculateExtraBonus,
  calculateReferralCommission,
  maskEmail,
  roundUsd,
  sanitizeExternalUrl,
  validateGmailAddress,
  validateTxId,
} from './src/utils/investment.ts';
import type {
  AdminUserSummary,
  DepositRecord,
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
  auth?: TokenPayload;
}

interface DbUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'user' | 'admin';
  is_verified: number;
  otp_hash: string | null;
  otp_expires_at: number | null;
  otp_attempts: number;
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
    fullName: row.full_name,
    role: row.role,
    isVerified: row.is_verified === 1,
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
  supported_assets: string;
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
  return {
    id: row.id,
    tierNumber: row.tier_number,
    name: row.name,
    subtitle: row.subtitle,
    amountUsd: roundUsd(row.amount_usd),
    dailyRatePerDollar: row.daily_rate_per_dollar,
    supportedAssets: assets,
    durationLabel: row.duration_label,
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
    .prepare('SELECT id, email, role, is_verified FROM users WHERE id = ?')
    .get(payload.sub) as { id: string; email: string; role: 'user' | 'admin'; is_verified: number } | undefined;
  if (!userRow || userRow.is_verified !== 1) {
    res.status(401).json({ error: 'Account not found or not verified.' });
    return;
  }
  req.auth = { ...payload, role: userRow.role };
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
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow | undefined;
  if (!userRow) return null;

  const settings = getPlatformSettings();

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
      status: 'Active' | 'Paused';
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

  const referredRows = db
    .prepare(
      'SELECT id, email, full_name, is_verified, total_invested_usd, created_at FROM users WHERE referred_by_user_id = ? ORDER BY created_at DESC'
    )
    .all(userId) as Array<{
    id: string;
    email: string;
    full_name: string;
    is_verified: number;
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
      isVerified: r.is_verified === 1,
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
      db.prepare('SELECT * FROM vip_plans WHERE is_active = 1 ORDER BY sort_order ASC, tier_number ASC').all() as Array<
        Parameters<typeof mapPlan>[0]
      >
    ).map(mapPlan);

    const paymentMethods = (
      db.prepare('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order ASC').all() as Array<
        Parameters<typeof mapPaymentMethod>[0]
      >
    ).map(mapPaymentMethod);

    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number })
      .count;

    res.json({
      settings,
      vipPlans,
      paymentMethods,
      adminStatus: {
        hasAdmin: adminCount > 0,
        passcodeConfigured: Boolean((process.env.ADMIN_PASSCODE ?? '').trim()),
      },
      smtpConfigured: isSmtpConfigured(),
    });
  });

  // --- AUTHENTICATION ROUTES ---

  app.post('/api/auth/register', async (req, res) => {
    const { fullName, email, password, referralCode } = req.body ?? {};
    const name = String(fullName ?? '').trim();
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }

    const gmailCheck = validateGmailAddress(String(email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }

    const rawPassword = String(password ?? '');
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | { id: string; is_verified: number }
      | undefined;

    if (existing && existing.is_verified === 1) {
      res.status(409).json({ error: 'An activated account with this Gmail already exists. Please log in.' });
      return;
    }

    let referrerId: string | null = null;
    const cleanRef = String(referralCode ?? '').trim().toUpperCase();
    if (cleanRef) {
      const refRow = db
        .prepare('SELECT id FROM users WHERE referral_code = ? AND is_verified = 1')
        .get(cleanRef) as { id: string } | undefined;
      if (!refRow) {
        res.status(400).json({ error: 'Referral code not found. Clear it or enter a valid code.' });
        return;
      }
      referrerId = refRow.id;
    }

    const otpCode = generateSixDigitOtp();
    const otpHash = hashOtp(gmailCheck.normalized, otpCode);
    const otpExpiresAt = Date.now() + 10 * 60 * 1000;
    const passwordHash = hashPassword(rawPassword);
    const nowIso = new Date().toISOString();

    if (existing) {
      db.prepare(
        `UPDATE users SET full_name = ?, password_hash = ?, otp_hash = ?, otp_expires_at = ?, otp_attempts = 0, referred_by_user_id = COALESCE(?, referred_by_user_id) WHERE id = ?`
      ).run(name, passwordHash, otpHash, otpExpiresAt, referrerId, existing.id);
    } else {
      const userId = crypto.randomUUID();
      let userRefCode = generateReferralCode(gmailCheck.normalized);
      while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(userRefCode)) {
        userRefCode = generateReferralCode(gmailCheck.normalized);
      }

      db.prepare(
        `INSERT INTO users (id, email, full_name, password_hash, role, is_verified, otp_hash, otp_expires_at, otp_attempts, referral_code, referred_by_user_id, created_at)
         VALUES (?, ?, ?, ?, 'user', 0, ?, ?, 0, ?, ?, ?)`
      ).run(userId, gmailCheck.normalized, name, passwordHash, otpHash, otpExpiresAt, userRefCode, referrerId, nowIso);
    }

    const settings = getPlatformSettings();
    let sentViaSmtp = false;
    try {
      const mailRes = await sendOtpEmail(gmailCheck.normalized, otpCode, settings.brandName);
      sentViaSmtp = mailRes.sentViaSmtp;
    } catch (err) {
      console.error('SMTP delivery error:', err);
      res.status(500).json({ error: 'Failed to send verification OTP email. Check SMTP settings.' });
      return;
    }

    res.json({
      requiresOtp: true,
      email: gmailCheck.normalized,
      sentViaSmtp,
      previewOtp: sentViaSmtp ? undefined : otpCode,
      message: sentViaSmtp
        ? `A 6-digit verification OTP has been sent to ${gmailCheck.normalized}.`
        : `Verification OTP generated for ${gmailCheck.normalized}.`,
    });
  });

  app.post('/api/auth/resend-otp', async (req, res) => {
    const gmailCheck = validateGmailAddress(String(req.body?.email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }

    const userRow = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | { id: string; is_verified: number }
      | undefined;
    if (!userRow) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (userRow.is_verified === 1) {
      res.status(400).json({ error: 'Account is already verified.' });
      return;
    }

    const otpCode = generateSixDigitOtp();
    const otpHash = hashOtp(gmailCheck.normalized, otpCode);
    const otpExpiresAt = Date.now() + 10 * 60 * 1000;

    db.prepare('UPDATE users SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?').run(
      otpHash,
      otpExpiresAt,
      userRow.id
    );

    const settings = getPlatformSettings();
    let sentViaSmtp = false;
    try {
      const mailRes = await sendOtpEmail(gmailCheck.normalized, otpCode, settings.brandName);
      sentViaSmtp = mailRes.sentViaSmtp;
    } catch (err) {
      console.error('SMTP resend error:', err);
      res.status(500).json({ error: 'Failed to resend OTP email.' });
      return;
    }

    res.json({
      requiresOtp: true,
      email: gmailCheck.normalized,
      sentViaSmtp,
      previewOtp: sentViaSmtp ? undefined : otpCode,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const gmailCheck = validateGmailAddress(String(req.body?.email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }

    const otp = String(req.body?.otp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      res.status(400).json({ error: 'Enter the 6-digit numeric OTP code.' });
      return;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | DbUserRow
      | undefined;
    if (!userRow) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (userRow.is_verified === 1) {
      res.status(400).json({ error: 'Account is already verified. Please log in.' });
      return;
    }
    if (!userRow.otp_hash || !userRow.otp_expires_at || Date.now() > userRow.otp_expires_at) {
      res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
      return;
    }
    if (userRow.otp_attempts >= 5) {
      res.status(429).json({ error: 'Too many invalid attempts. Request a new OTP code.' });
      return;
    }

    const expectedHash = hashOtp(gmailCheck.normalized, otp);
    const a = Buffer.from(expectedHash);
    const b = Buffer.from(userRow.otp_hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      db.prepare('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = ?').run(userRow.id);
      res.status(400).json({ error: 'Invalid OTP code. Please try again.' });
      return;
    }

    db.prepare('UPDATE users SET is_verified = 1, otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?').run(
      userRow.id
    );

    const token = signSessionToken({ sub: userRow.id, email: userRow.email, role: userRow.role });
    const bundle = getUserDashboardBundle(userRow.id);
    res.json({ token, ...bundle });
  });

  app.post('/api/auth/login', (req, res) => {
    const gmailCheck = validateGmailAddress(String(req.body?.email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }
    const rawPassword = String(req.body?.password ?? '');
    if (!rawPassword) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | DbUserRow
      | undefined;
    if (!userRow || !verifyPassword(rawPassword, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid Gmail address or password.' });
      return;
    }

    if (userRow.is_verified !== 1) {
      res.status(403).json({
        error: 'Email verification is required before signing in.',
        code: 'OTP_REQUIRED',
        email: userRow.email,
      });
      return;
    }

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

  // --- USER INVESTMENT, DEPOSIT, TASK & WITHDRAWAL ROUTES ---

  app.post('/api/deposits', requireAuth, (req: AuthedRequest, res) => {
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

    const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(req.auth!.sub) as {
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

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const bundle = getUserDashboardBundle(req.auth!.sub);
    res.status(201).json({ depositId, ...bundle });
  });

  app.post('/api/investments/from-balance', requireAuth, (req: AuthedRequest, res) => {
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

    db.exec('BEGIN IMMEDIATE');
    try {
      const userRow = db.prepare('SELECT balance_usd FROM users WHERE id = ?').get(req.auth!.sub) as {
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
        `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, source_deposit_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'Active', ?)`
      ).run(investmentId, req.auth!.sub, mappedPlan.id, mappedPlan.name, asset, mappedPlan.amountUsd, dailyIncome, nowIso);

      db.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Plan Purchase', ?, 'Debit', ?, ?, 'Completed', ?)`
      ).run(
        crypto.randomUUID(),
        req.auth!.sub,
        `Activated ${mappedPlan.name} (${asset}) from Available Balance`,
        mappedPlan.amountUsd,
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

  app.post('/api/tasks/claim', requireAuth, (req: AuthedRequest, res) => {
    const investmentId = String(req.body?.investmentId ?? '').trim();
    const todayDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      const inv = db
        .prepare("SELECT * FROM investments WHERE id = ? AND user_id = ? AND status = 'Active'")
        .get(investmentId, req.auth!.sub) as
        | {
            id: string;
            plan_name: string;
            selected_asset: string;
            daily_income_usd: number;
            last_claimed_date: string | null;
          }
        | undefined;

      if (!inv) {
        db.exec('ROLLBACK');
        res.status(404).json({ error: 'Active VIP investment position not found.' });
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

  app.post('/api/withdrawals', requireAuth, (req: AuthedRequest, res) => {
    const { paymentMethodName, walletAddress, amountUsd } = req.body ?? {};
    const settings = getPlatformSettings();
    const method = String(paymentMethodName ?? '').trim();
    const address = String(walletAddress ?? '').trim();
    const amount = roundUsd(Number(amountUsd));

    if (!method) {
      res.status(400).json({ error: 'Select a TRC-20 withdrawal method.' });
      return;
    }
    if (address.length < 16 || address.length > 120 || /\s/.test(address)) {
      res.status(400).json({ error: 'Enter a valid TRC-20 wallet address.' });
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
        `Withdrawal request to ${method} (${address.slice(0, 8)}...)`,
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
    if (configuredPasscode && String(passcode ?? '').trim() !== configuredPasscode) {
      res.status(403).json({ error: 'Invalid admin setup passcode.' });
      return;
    }

    const gmailCheck = validateGmailAddress(String(email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
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

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | { id: string }
      | undefined;

    let adminId: string;
    if (existingUser) {
      adminId = existingUser.id;
      db.prepare("UPDATE users SET full_name = ?, password_hash = ?, role = 'admin', is_verified = 1 WHERE id = ?").run(
        name,
        passwordHash,
        adminId
      );
    } else {
      adminId = crypto.randomUUID();
      let refCode = generateReferralCode(gmailCheck.normalized);
      while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(refCode)) {
        refCode = generateReferralCode(gmailCheck.normalized);
      }
      db.prepare(
        `INSERT INTO users (id, email, full_name, password_hash, role, is_verified, referral_code, created_at)
         VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`
      ).run(adminId, gmailCheck.normalized, name, passwordHash, refCode, nowIso);
    }

    const token = signSessionToken({ sub: adminId, email: gmailCheck.normalized, role: 'admin' });
    const bundle = getUserDashboardBundle(adminId);
    res.status(201).json({ token, ...bundle });
  });

  app.post('/api/admin/login', (req, res) => {
    const { email, password, passcode } = req.body ?? {};
    const configuredPasscode = (process.env.ADMIN_PASSCODE ?? '').trim();

    if (configuredPasscode && passcode && String(passcode).trim() === configuredPasscode) {
      const adminRow = db
        .prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
        .get() as DbUserRow | undefined;
      if (adminRow) {
        const token = signSessionToken({ sub: adminRow.id, email: adminRow.email, role: 'admin' });
        const bundle = getUserDashboardBundle(adminRow.id);
        res.json({ token, ...bundle });
        return;
      }
    }

    const gmailCheck = validateGmailAddress(String(email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }

    const adminRow = db
      .prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'")
      .get(gmailCheck.normalized) as DbUserRow | undefined;

    if (!adminRow || !verifyPassword(String(password ?? ''), adminRow.password_hash)) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const token = signSessionToken({ sub: adminRow.id, email: adminRow.email, role: 'admin' });
    const bundle = getUserDashboardBundle(adminRow.id);
    res.json({ token, ...bundle });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const settings = getPlatformSettings();

    const deposits = (
      db
        .prepare(
          `SELECT d.*, u.email as user_email
           FROM deposits d
           JOIN users u ON u.id = d.user_id
           ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END, d.created_at DESC`
        )
        .all() as Array<
        Parameters<typeof Object.assign>[0] & {
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
        }
      >
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
      db.prepare('SELECT * FROM vip_plans ORDER BY sort_order ASC, tier_number ASC').all() as Array<
        Parameters<typeof mapPlan>[0]
      >
    ).map(mapPlan);

    const paymentMethods = (
      db.prepare('SELECT * FROM payment_methods ORDER BY sort_order ASC').all() as Array<
        Parameters<typeof mapPaymentMethod>[0]
      >
    ).map(mapPaymentMethod);

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
      totalUsers: (db.prepare('SELECT COUNT(*) as count FROM users WHERE is_verified = 1').get() as { count: number })
        .count,
      pendingDeposits: deposits.filter((d) => d.status === 'Pending').length,
      approvedVolumeUsd: roundUsd(
        deposits.filter((d) => d.status === 'Approved').reduce((acc, d) => acc + d.amountUsd, 0)
      ),
      activePositions: (
        db.prepare("SELECT COUNT(*) as count FROM investments WHERE status = 'Active'").get() as { count: number }
      ).count,
    };

    res.json({
      settings,
      deposits,
      withdrawals,
      plans,
      paymentMethods,
      admins,
      stats,
    });
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

      // Approve flow
      db.prepare(
        "UPDATE deposits SET status = 'Approved', admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?"
      ).run(adminNote || 'Verified and activated.', req.auth!.email, nowIso, deposit.id);

      let updatedBalance = roundUsd(user.balance_usd);
      if (deposit.plan_id) {
        const planRow = db.prepare('SELECT daily_rate_per_dollar FROM vip_plans WHERE id = ?').get(deposit.plan_id) as
          | { daily_rate_per_dollar: number }
          | undefined;
        const rate = planRow?.daily_rate_per_dollar ?? 0.01;
        const dailyIncome = calculateDailyIncome(deposit.amount_usd, rate);

        db.prepare('UPDATE users SET total_invested_usd = total_invested_usd + ? WHERE id = ?').run(
          deposit.amount_usd,
          user.id
        );

        db.prepare(
          `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, source_deposit_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          deposit.plan_id,
          deposit.plan_name ?? 'VIP Plan',
          deposit.selected_asset,
          deposit.amount_usd,
          dailyIncome,
          deposit.id,
          nowIso
        );

        db.prepare(
          `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
           VALUES (?, ?, 'Plan Purchase', ?, 'Credit', ?, ?, 'Completed', ?)`
        ).run(
          crypto.randomUUID(),
          user.id,
          `Approved & Activated ${deposit.plan_name} (${deposit.selected_asset}) · Tx ${deposit.tx_id.slice(0, 12)}`,
          deposit.amount_usd,
          updatedBalance,
          nowIso
        );
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
          adminNote || 'Disbursed via TRC-20.',
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
      res.status(400).json({ error: 'Payment method name and wallet address are required.' });
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
      String(network ?? 'TRC-20 (Tron)').trim(),
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
      String(network ?? 'TRC-20 (Tron)').trim(),
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
    const { tierNumber, name, subtitle, amountUsd, dailyRatePerDollar, supportedAssets, durationLabel } = req.body ?? {};
    const amount = Number(amountUsd);
    const rate = Number(dailyRatePerDollar ?? 0.01);
    if (!String(name ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid plan name and positive investment amount are required.' });
      return;
    }

    const id = `vip-${crypto.randomBytes(3).toString('hex')}`;
    const assets = Array.isArray(supportedAssets) && supportedAssets.length > 0
      ? supportedAssets
      : ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

    db.prepare(
      `INSERT INTO vip_plans (id, tier_number, name, subtitle, amount_usd, daily_rate_per_dollar, supported_assets, duration_label, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      Number(tierNumber) || 6,
      String(name).trim(),
      String(subtitle ?? 'Custom VIP Tier').trim(),
      roundUsd(amount),
      Number.isFinite(rate) && rate >= 0 ? rate : 0.01,
      JSON.stringify(assets),
      String(durationLabel ?? 'No Fixed Duration').trim(),
      Number(tierNumber) || 6
    );

    res.status(201).json({ ok: true, id });
  });

  app.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
    const { name, subtitle, amountUsd, dailyRatePerDollar, supportedAssets, durationLabel, isActive } = req.body ?? {};
    const existing = db.prepare('SELECT id FROM vip_plans WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'VIP plan not found.' });
      return;
    }

    const amount = Number(amountUsd);
    const rate = Number(dailyRatePerDollar);
    if (!String(name ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid plan name and positive investment amount are required.' });
      return;
    }

    const assets = Array.isArray(supportedAssets) && supportedAssets.length > 0
      ? supportedAssets
      : ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];

    db.prepare(
      `UPDATE vip_plans
       SET name = ?, subtitle = ?, amount_usd = ?, daily_rate_per_dollar = ?, supported_assets = ?, duration_label = ?, is_active = ?
       WHERE id = ?`
    ).run(
      String(name).trim(),
      String(subtitle ?? '').trim(),
      roundUsd(amount),
      Number.isFinite(rate) && rate >= 0 ? rate : 0.01,
      JSON.stringify(assets),
      String(durationLabel ?? 'No Fixed Duration').trim(),
      isActive === false ? 0 : 1,
      req.params.id
    );

    res.json({ ok: true });
  });

  app.post('/api/admin/bonuses/distribute', requireAdmin, (req, res) => {
    const bonusPercent = Number(req.body?.bonusPercent ?? 1);
    const title = String(req.body?.title ?? 'Platform Surplus Trading Profit Bonus').trim();

    if (!Number.isFinite(bonusPercent) || bonusPercent <= 0 || bonusPercent > 100) {
      res.status(400).json({ error: 'Bonus percentage must be between 0.01% and 100%.' });
      return;
    }

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
    const gmailCheck = validateGmailAddress(String(email ?? ''));
    if (!gmailCheck.valid) {
      res.status(400).json({ error: gmailCheck.error });
      return;
    }
    const name = String(fullName ?? '').trim();
    if (name.length < 2) {
      res.status(400).json({ error: 'Admin name must be at least 2 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(gmailCheck.normalized) as
      | { id: string; role: string }
      | undefined;

    if (existing) {
      if (existing.role === 'admin') {
        res.status(409).json({ error: 'This Gmail is already registered as an administrator.' });
        return;
      }
      db.prepare("UPDATE users SET role = 'admin', is_verified = 1 WHERE id = ?").run(existing.id);
      res.status(201).json({ ok: true, promoted: true });
      return;
    }

    const rawPassword = String(password ?? '');
    if (rawPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters for a new admin account.' });
      return;
    }

    const id = crypto.randomUUID();
    let refCode = generateReferralCode(gmailCheck.normalized);
    while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(refCode)) {
      refCode = generateReferralCode(gmailCheck.normalized);
    }

    db.prepare(
      `INSERT INTO users (id, email, full_name, password_hash, role, is_verified, referral_code, created_at)
       VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`
    ).run(id, gmailCheck.normalized, name, hashPassword(rawPassword), refCode, new Date().toISOString());

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
