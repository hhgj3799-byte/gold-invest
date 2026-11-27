import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ActivityLogCategory,
  ActivityLogRecord,
  DepositGuideStep,
  PlatformSettings,
  SupportedAsset,
} from '../src/types/platform.ts';
import {
  DEFAULT_DURATION_DAYS,
  calculatePlanExpiryIso,
  formatDurationLabel,
  isPlanExpired,
  roundUsd,
  sanitizeDurationDays,
} from '../src/utils/investment.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'platform.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export const DEFAULT_DEPOSIT_STEPS: DepositGuideStep[] = [
  {
    step: 1,
    title: 'Select Payment Method',
    description: 'Choose Nagad (P2P), Binance (P2P), or Trust Wallet USDT (TRC-20 / BEP-20).',
  },
  {
    step: 2,
    title: 'Send Activation or Plan Amount',
    description: 'Transfer 40 BDT ($0.40) for Account Activation or the exact VIP plan amount ($1–$10).',
  },
  {
    step: 3,
    title: 'Save Transaction ID',
    description: 'Copy the Transaction ID / TxHash from your Nagad, Binance, or Trust Wallet receipt.',
  },
  {
    step: 4,
    title: 'Submit Proof for Verification',
    description: 'Submit your TxID so the administrator receives an instant approval notification.',
  },
  {
    step: 5,
    title: 'Manual Admin Activation',
    description: 'An administrator reviews your proof and activates your account or VIP tier promptly.',
  },
];

export const DEFAULT_SETTINGS: PlatformSettings = {
  brandName: 'Aurum Global Investments',
  brandTagline: 'Multi-Asset & Precious Metals Yield Platform',
  heroHeadline: 'VIP ($1–$10) Multi-Asset Investment & Daily Ad Rewards',
  heroSubheadline:
    'Earn $0.01 daily ($0.20 estimated monthly) per $1 invested across fixed-term VIP plans ($1, $2, $3, $4, $5, $6, $7, $10), plus daily ad viewing rewards and 10% referral commissions.',
  announcementBanner:
    'Account activation requires a one-time 40 BDT ($0.40) verification fee via Nagad, Binance P2P, or Trust Wallet (TRC20 / BEP20).',
  extraBonusNotice:
    'Additional trading bonuses may be distributed to active VIP holders whenever platform trading generates surplus profit.',
  supportEmail: 'support@aurumcapital.example',
  telegramUrl: 'https://t.me/aurumcapital_official',
  minWithdrawalUsd: 1,
  referralCommissionPct: 10,
  activationFeeBdt: 40,
  activationFeeUsd: 0.4,
  defaultAdRewardUsd: 0.02,
  depositGuideSteps: DEFAULT_DEPOSIT_STEPS,
};

function ensureColumn(
  targetDb: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = targetDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === columnName)) {
    targetDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

export function initDatabase(targetDb: DatabaseSync = db): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      phone_number TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_enc TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      is_verified INTEGER NOT NULL DEFAULT 1,
      activation_status TEXT NOT NULL DEFAULT 'Unpaid',
      is_blocked INTEGER NOT NULL DEFAULT 0,
      funds_frozen INTEGER NOT NULL DEFAULT 0,
      otp_hash TEXT,
      otp_expires_at INTEGER,
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by_user_id TEXT,
      balance_usd REAL NOT NULL DEFAULT 0,
      total_invested_usd REAL NOT NULL DEFAULT 0,
      total_earned_usd REAL NOT NULL DEFAULT 0,
      total_referral_earned_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vip_plans (
      id TEXT PRIMARY KEY,
      tier_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      daily_rate_per_dollar REAL NOT NULL DEFAULT 0.01,
      monthly_rate_per_dollar REAL NOT NULL DEFAULT 0.20,
      supported_assets TEXT NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      duration_label TEXT NOT NULL DEFAULT '30 Days',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      network TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      instructions TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activation_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      payment_method_name TEXT NOT NULL,
      amount_label TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      tx_id TEXT NOT NULL,
      sender_account TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT,
      plan_name TEXT,
      selected_asset TEXT NOT NULL,
      payment_method_id TEXT NOT NULL,
      payment_method_name TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      tx_id TEXT NOT NULL,
      sender_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      selected_asset TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      daily_income_usd REAL NOT NULL,
      source_deposit_id TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      purchased_at TEXT,
      duration_days INTEGER NOT NULL DEFAULT 30,
      expires_at TEXT,
      expired_at TEXT,
      last_claimed_date TEXT,
      total_earned_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS earnings_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      asset TEXT NOT NULL DEFAULT '',
      amount_usd REAL NOT NULL,
      reference_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      investment_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      asset TEXT NOT NULL,
      task_title TEXT NOT NULL,
      reward_usd REAL NOT NULL,
      status TEXT NOT NULL,
      task_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      balance_after_usd REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payment_method_name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      target_url TEXT NOT NULL,
      reward_usd REAL NOT NULL DEFAULT 0.02,
      duration_seconds INTEGER NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ad_claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      reward_usd REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, ad_id, claim_date)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      user_id TEXT,
      user_email TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      action_title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      amount_usd REAL,
      ip_address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Completed',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
  `);

  // Safe schema migrations for existing persisted SQLite DBs
  ensureColumn(targetDb, 'users', 'phone_number', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(targetDb, 'users', 'activation_status', "TEXT NOT NULL DEFAULT 'Unpaid'");
  ensureColumn(targetDb, 'users', 'is_blocked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(targetDb, 'users', 'funds_frozen', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(targetDb, 'users', 'password_enc', 'TEXT');
  ensureColumn(targetDb, 'vip_plans', 'monthly_rate_per_dollar', 'REAL NOT NULL DEFAULT 0.20');
  ensureColumn(targetDb, 'vip_plans', 'duration_days', 'INTEGER NOT NULL DEFAULT 30');
  ensureColumn(targetDb, 'investments', 'purchased_at', 'TEXT');
  ensureColumn(targetDb, 'investments', 'duration_days', 'INTEGER NOT NULL DEFAULT 30');
  ensureColumn(targetDb, 'investments', 'expires_at', 'TEXT');
  ensureColumn(targetDb, 'investments', 'expired_at', 'TEXT');

  // Migrate legacy plans that had "No Fixed Duration" before duration_days existed
  targetDb
    .prepare(
      "UPDATE vip_plans SET duration_label = '30 Days' WHERE duration_label = 'No Fixed Duration' AND duration_days = 30"
    )
    .run();

  // Backfill purchase and expiry timestamps for any pre-existing investment rows safely
  targetDb
    .prepare("UPDATE investments SET purchased_at = created_at WHERE purchased_at IS NULL OR purchased_at = ''")
    .run();

  const missingExpiryRows = targetDb
    .prepare(
      "SELECT id, plan_id, purchased_at, created_at, duration_days FROM investments WHERE expires_at IS NULL AND status = 'Active'"
    )
    .all() as Array<{
    id: string;
    plan_id: string;
    purchased_at: string | null;
    created_at: string;
    duration_days: number | null;
  }>;

  if (missingExpiryRows.length > 0) {
    const planLookup = targetDb.prepare('SELECT duration_days FROM vip_plans WHERE id = ?');
    const updateExpiry = targetDb.prepare(
      'UPDATE investments SET duration_days = ?, expires_at = ? WHERE id = ?'
    );
    for (const row of missingExpiryRows) {
      const planRow = planLookup.get(row.plan_id) as { duration_days: number } | undefined;
      const days = sanitizeDurationDays(row.duration_days ?? planRow?.duration_days, DEFAULT_DURATION_DAYS);
      if (days > 0) {
        const anchor = row.purchased_at || row.created_at;
        const expiryIso = calculatePlanExpiryIso(anchor, days);
        updateExpiry.run(days, expiryIso, row.id);
      }
    }
  }

  seedDefaults(targetDb);
  backfillHistoricalActivityLogs(targetDb);
}

function backfillHistoricalActivityLogs(targetDb: DatabaseSync): void {
  const countRow = targetDb.prepare('SELECT COUNT(*) AS count FROM activity_logs').get() as {
    count: number;
  };
  if (countRow.count > 0) {
    return;
  }

  const insertLog = targetDb.prepare(
    `INSERT INTO activity_logs (id, category, user_id, user_email, user_name, action_title, details, amount_usd, ip_address, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  );

  const depositRows = targetDb
    .prepare(
      `SELECT d.id, d.user_id, u.email AS user_email, u.full_name AS user_name,
              d.plan_name, d.selected_asset, d.payment_method_name, d.amount_usd, d.tx_id, d.status, d.created_at
       FROM deposits d
       LEFT JOIN users u ON u.id = d.user_id`
    )
    .all() as Array<{
    id: string;
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    plan_name: string | null;
    selected_asset: string;
    payment_method_name: string;
    amount_usd: number;
    tx_id: string;
    status: string;
    created_at: string;
  }>;

  for (const dep of depositRows) {
    const targetLabel = dep.plan_name
      ? `${dep.plan_name} (${dep.selected_asset})`
      : `Wallet Balance (${dep.selected_asset})`;
    insertLog.run(
      crypto.randomUUID(),
      'Deposit Submission',
      dep.user_id,
      dep.user_email ?? '',
      dep.user_name ?? 'Investor',
      dep.plan_name ? `Plan Deposit Submitted (${dep.plan_name})` : 'Wallet Deposit Submitted',
      `${targetLabel} via ${dep.payment_method_name} · Tx ${dep.tx_id}`,
      roundUsd(dep.amount_usd),
      dep.status,
      dep.created_at
    );
  }

  const activationRows = targetDb
    .prepare(
      `SELECT a.id, a.user_id, u.email AS user_email, u.full_name AS user_name,
              a.payment_method_name, a.amount_label, a.amount_usd, a.tx_id, a.status, a.created_at
       FROM activation_requests a
       LEFT JOIN users u ON u.id = a.user_id`
    )
    .all() as Array<{
    id: string;
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    payment_method_name: string;
    amount_label: string;
    amount_usd: number;
    tx_id: string;
    status: string;
    created_at: string;
  }>;

  for (const act of activationRows) {
    insertLog.run(
      crypto.randomUUID(),
      'Deposit Submission',
      act.user_id,
      act.user_email ?? '',
      act.user_name ?? 'Investor',
      'Account Activation Fee Submitted',
      `${act.amount_label} via ${act.payment_method_name} · Tx ${act.tx_id}`,
      roundUsd(act.amount_usd),
      act.status,
      act.created_at
    );
  }

  const investmentRows = targetDb
    .prepare(
      `SELECT i.id, i.user_id, u.email AS user_email, u.full_name AS user_name,
              i.plan_name, i.selected_asset, i.amount_usd, i.duration_days, i.source_deposit_id, i.status, i.purchased_at, i.created_at
       FROM investments i
       LEFT JOIN users u ON u.id = i.user_id`
    )
    .all() as Array<{
    id: string;
    user_id: string;
    user_email: string | null;
    user_name: string | null;
    plan_name: string;
    selected_asset: string;
    amount_usd: number;
    duration_days: number;
    source_deposit_id: string | null;
    status: string;
    purchased_at: string | null;
    created_at: string;
  }>;

  for (const inv of investmentRows) {
    const sourceLabel = inv.source_deposit_id ? 'Approved Deposit' : 'Available Balance';
    insertLog.run(
      crypto.randomUUID(),
      'Investment Activation',
      inv.user_id,
      inv.user_email ?? '',
      inv.user_name ?? 'Investor',
      `VIP Plan Activated (${inv.plan_name})`,
      `${inv.plan_name} (${inv.selected_asset}, ${formatDurationLabel(inv.duration_days)}) via ${sourceLabel}`,
      roundUsd(inv.amount_usd),
      inv.status,
      inv.purchased_at || inv.created_at
    );
  }
}

function seedDefaults(targetDb: DatabaseSync = db): void {
  const defaultAssets: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];
  const upsertPlan = targetDb.prepare(`
    INSERT OR IGNORE INTO vip_plans (id, tier_number, name, subtitle, amount_usd, daily_rate_per_dollar, monthly_rate_per_dollar, supported_assets, duration_days, duration_label, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const tiers = [
    { id: 'vip-1', tier: 1, name: 'VIP 1', subtitle: 'Starter Reserve Allocation', amount: 1, days: 30 },
    { id: 'vip-2', tier: 2, name: 'VIP 2', subtitle: 'Core Multi-Asset Position', amount: 2, days: 30 },
    { id: 'vip-3', tier: 3, name: 'VIP 3', subtitle: 'Balanced Equity & Gold Tier', amount: 3, days: 30 },
    { id: 'vip-4', tier: 4, name: 'VIP 4', subtitle: 'Growth Portfolio Allocation', amount: 4, days: 30 },
    { id: 'vip-5', tier: 5, name: 'VIP 5', subtitle: 'Premier Executive Reserve', amount: 5, days: 30 },
    { id: 'vip-6', tier: 6, name: 'VIP 6', subtitle: 'Silver Desk Allocation', amount: 6, days: 30 },
    { id: 'vip-7', tier: 7, name: 'VIP 7', subtitle: 'Institutional Gold Desk', amount: 7, days: 30 },
    { id: 'vip-8', tier: 8, name: 'VIP 8', subtitle: 'Apex $10 Bullion Reserve', amount: 10, days: 30 },
  ];

  // Migrate legacy default $10 (vip-6) / $20 (vip-7) tiers down to strict $1–$10 schedule
  targetDb
    .prepare("UPDATE vip_plans SET amount_usd = 6, subtitle = 'Silver Desk Allocation' WHERE id = 'vip-6' AND amount_usd = 10")
    .run();
  targetDb
    .prepare("UPDATE vip_plans SET amount_usd = 7, subtitle = 'Institutional Gold Desk' WHERE id = 'vip-7' AND amount_usd = 20")
    .run();

  for (const t of tiers) {
    upsertPlan.run(
      t.id,
      t.tier,
      t.name,
      t.subtitle,
      t.amount,
      0.01,
      0.2,
      JSON.stringify(defaultAssets),
      t.days,
      formatDurationLabel(t.days),
      t.tier
    );
  }

  // Enforce strict maximum $10 cap across any pre-existing custom plans
  targetDb
    .prepare(
      `DELETE FROM vip_plans
       WHERE amount_usd > 10
         AND id NOT IN (SELECT DISTINCT plan_id FROM investments)
         AND id NOT IN (SELECT DISTINCT plan_id FROM deposits WHERE plan_id IS NOT NULL)`
    )
    .run();
  targetDb.prepare('UPDATE vip_plans SET is_active = 0 WHERE amount_usd > 10').run();

  // Strictly configure Nagad (P2P), Binance (P2P), Trust Wallet (TRC20), and Trust Wallet (BEP20)
  const pmRows = targetDb.prepare('SELECT id FROM payment_methods').all() as Array<{ id: string }>;
  const existingIds = new Set(pmRows.map((r) => r.id));
  const hasOnlyLegacyDefaults =
    pmRows.length > 0 &&
    pmRows.every((r) => r.id === 'pm-binance-trc20' || r.id === 'pm-trustwallet-trc20');

  if (pmRows.length === 0 || hasOnlyLegacyDefaults) {
    if (hasOnlyLegacyDefaults) {
      targetDb.exec('DELETE FROM payment_methods;');
    }
    const insertPm = targetDb.prepare(`
      INSERT INTO payment_methods (id, name, network, wallet_address, instructions, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    insertPm.run(
      'pm-nagad-p2p',
      'Nagad (P2P)',
      'Nagad Personal / P2P (BDT)',
      '+8801700000400',
      'Open Nagad App -> Send Money to this P2P number -> Transfer 40 BDT for activation or VIP amount (1 USD ≈ 120 BDT) -> Paste Nagad TrxID.',
      1
    );
    insertPm.run(
      'pm-binance-p2p',
      'Binance (P2P)',
      'Binance Pay / P2P UID',
      'BINANCE-P2P-84920144',
      'Open Binance App -> Pay / P2P Transfer -> Send USDT to this Binance Pay ID / P2P UID -> Paste the Binance Order / TxID.',
      2
    );
    insertPm.run(
      'pm-trustwallet-trc20',
      'Trust Wallet (USDT TRC-20)',
      'TRC-20 (Tron)',
      'TVj7RNVHy6thbM7BWdSe9G6gHkKhj5h6eF',
      'Open Trust Wallet -> Select USDT (TRC20 / Tron) -> Send exact USD amount -> Paste the TRC-20 Transaction Hash.',
      3
    );
    insertPm.run(
      'pm-trustwallet-bep20',
      'Trust Wallet (USDT BEP-20)',
      'BEP-20 (BNB Smart Chain)',
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'Open Trust Wallet -> Select USDT (BEP20 / BSC) -> Send exact USD amount -> Paste the BEP-20 Transaction Hash.',
      4
    );
  } else if (!existingIds.has('pm-nagad-p2p') && pmRows.length < 4) {
    // Ensure missing strict methods exist if only partial set is present
    const insertMissing = targetDb.prepare(`
      INSERT OR IGNORE INTO payment_methods (id, name, network, wallet_address, instructions, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    insertMissing.run(
      'pm-nagad-p2p',
      'Nagad (P2P)',
      'Nagad Personal / P2P (BDT)',
      '+8801700000400',
      'Send Money via Nagad P2P and submit your Transaction ID.',
      1
    );
    insertMissing.run(
      'pm-binance-p2p',
      'Binance (P2P)',
      'Binance Pay / P2P UID',
      'BINANCE-P2P-84920144',
      'Transfer via Binance P2P / Pay ID and submit your Order / TxID.',
      2
    );
    insertMissing.run(
      'pm-trustwallet-bep20',
      'Trust Wallet (USDT BEP-20)',
      'BEP-20 (BNB Smart Chain)',
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      'Send USDT on BEP-20 (BSC) via Trust Wallet and submit your TxHash.',
      4
    );
  }

  // Seed default daily ads if empty
  const adsCount = (targetDb.prepare('SELECT COUNT(*) as count FROM ads').get() as { count: number }).count;
  if (adsCount === 0) {
    const insertAd = targetDb.prepare(`
      INSERT INTO ads (id, title, description, target_url, reward_usd, duration_seconds, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const nowIso = new Date().toISOString();
    insertAd.run(
      'ad-gold-desk',
      '24K Bullion Liquidity Briefing',
      'Review today’s global gold reserve liquidity update and earn an instant ad reward.',
      'https://t.me/aurumcapital_official',
      0.02,
      5,
      nowIso
    );
    insertAd.run(
      'ad-equities-pulse',
      'Apple, Meta & Tesla Market Dispatch',
      'Explore daily US blue-chip equity yield insights for VIP 1–7 portfolio holders.',
      'https://t.me/aurumcapital_official',
      0.02,
      5,
      nowIso
    );
    insertAd.run(
      'ad-partner-community',
      'Official Telegram Community Spotlight',
      'Stay updated on platform trading bonuses and P2P settlement windows.',
      'https://t.me/aurumcapital_official',
      0.03,
      5,
      nowIso
    );
  }

  const upsertSetting = targetDb.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)
  `);
  upsertSetting.run('brandName', DEFAULT_SETTINGS.brandName);
  upsertSetting.run('brandTagline', DEFAULT_SETTINGS.brandTagline);
  upsertSetting.run('heroHeadline', DEFAULT_SETTINGS.heroHeadline);
  upsertSetting.run('heroSubheadline', DEFAULT_SETTINGS.heroSubheadline);
  upsertSetting.run('announcementBanner', DEFAULT_SETTINGS.announcementBanner);
  upsertSetting.run('extraBonusNotice', DEFAULT_SETTINGS.extraBonusNotice);
  upsertSetting.run('supportEmail', DEFAULT_SETTINGS.supportEmail);
  upsertSetting.run('telegramUrl', DEFAULT_SETTINGS.telegramUrl);
  upsertSetting.run('minWithdrawalUsd', String(DEFAULT_SETTINGS.minWithdrawalUsd));
  upsertSetting.run('referralCommissionPct', String(DEFAULT_SETTINGS.referralCommissionPct));
  upsertSetting.run('activationFeeBdt', String(DEFAULT_SETTINGS.activationFeeBdt));
  upsertSetting.run('activationFeeUsd', String(DEFAULT_SETTINGS.activationFeeUsd));
  upsertSetting.run('defaultAdRewardUsd', String(DEFAULT_SETTINGS.defaultAdRewardUsd));
  upsertSetting.run('depositGuideSteps', JSON.stringify(DEFAULT_SETTINGS.depositGuideSteps));

  // Migrate old VIP 1-5 / VIP 1-7 default copy if it still references old tiers
  const heroSubRow = targetDb
    .prepare("SELECT value FROM platform_settings WHERE key = 'heroSubheadline'")
    .get() as { value: string } | undefined;
  if (
    heroSubRow &&
    (heroSubRow.value.includes('VIP 1 to VIP 5') || heroSubRow.value.includes('VIP Levels 1 to 7'))
  ) {
    targetDb.prepare("UPDATE platform_settings SET value = ? WHERE key = 'heroSubheadline'").run(
      DEFAULT_SETTINGS.heroSubheadline
    );
    targetDb.prepare("UPDATE platform_settings SET value = ? WHERE key = 'brandName'").run(
      DEFAULT_SETTINGS.brandName
    );
    targetDb.prepare("UPDATE platform_settings SET value = ? WHERE key = 'heroHeadline'").run(
      DEFAULT_SETTINGS.heroHeadline
    );
    targetDb.prepare("UPDATE platform_settings SET value = ? WHERE key = 'announcementBanner'").run(
      DEFAULT_SETTINGS.announcementBanner
    );
    targetDb.prepare("UPDATE platform_settings SET value = ? WHERE key = 'depositGuideSteps'").run(
      JSON.stringify(DEFAULT_SETTINGS.depositGuideSteps)
    );
  }
}

/**
 * Compares stored fixed-term expiration timestamps against current time (nowMs)
 * and automatically deactivates any expired Active investments.
 * Uses idempotent active-sum recalculation so user totals never drift or go negative.
 */
export function expireDueInvestments(
  options?: { userId?: string; nowMs?: number; skipTransaction?: boolean },
  targetDb: DatabaseSync = db
): number {
  const nowMs =
    typeof options?.nowMs === 'number' && Number.isFinite(options.nowMs)
      ? options.nowMs
      : Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const candidateRows = (
    options?.userId
      ? targetDb
          .prepare(
            "SELECT id, user_id, plan_name, selected_asset, amount_usd, expires_at FROM investments WHERE user_id = ? AND status = 'Active' AND expires_at IS NOT NULL AND expires_at != ''"
          )
          .all(options.userId)
      : targetDb
          .prepare(
            "SELECT id, user_id, plan_name, selected_asset, amount_usd, expires_at FROM investments WHERE status = 'Active' AND expires_at IS NOT NULL AND expires_at != ''"
          )
          .all()
  ) as Array<{
    id: string;
    user_id: string;
    plan_name: string;
    selected_asset: string;
    amount_usd: number;
    expires_at: string;
  }>;

  const dueRows = candidateRows.filter((row) => isPlanExpired(row.expires_at, nowMs));
  if (dueRows.length === 0) {
    return 0;
  }

  const manageTx = !options?.skipTransaction;
  if (manageTx) {
    targetDb.exec('BEGIN IMMEDIATE');
  }

  let expiredCount = 0;
  try {
    const updateInvestment = targetDb.prepare(
      "UPDATE investments SET status = 'Expired', expired_at = ? WHERE id = ? AND status = 'Active'"
    );
    const affectedUserIds = new Set<string>();
    const expiredForLedger: typeof dueRows = [];

    for (const row of dueRows) {
      const result = updateInvestment.run(nowIso, row.id);
      if (Number(result.changes ?? 0) > 0) {
        expiredCount += 1;
        affectedUserIds.add(row.user_id);
        expiredForLedger.push(row);
      }
    }

    if (affectedUserIds.size > 0) {
      const sumStmt = targetDb.prepare(
        "SELECT COALESCE(SUM(amount_usd), 0) AS active_sum FROM investments WHERE user_id = ? AND status = 'Active'"
      );
      const userBalStmt = targetDb.prepare('SELECT balance_usd FROM users WHERE id = ?');
      const updateUserInvested = targetDb.prepare(
        'UPDATE users SET total_invested_usd = ? WHERE id = ?'
      );
      const insertFinancial = targetDb.prepare(
        `INSERT INTO financial_records (id, user_id, category, description, direction, amount_usd, balance_after_usd, status, created_at)
         VALUES (?, ?, 'Plan Expired', ?, 'Debit', ?, ?, 'Completed', ?)`
      );

      const userBalanceMap = new Map<string, number>();
      for (const uid of affectedUserIds) {
        const sumRow = sumStmt.get(uid) as { active_sum: number } | undefined;
        const activeTotal = roundUsd(Math.max(0, Number(sumRow?.active_sum ?? 0)));
        updateUserInvested.run(activeTotal, uid);

        const userRow = userBalStmt.get(uid) as { balance_usd: number } | undefined;
        userBalanceMap.set(uid, roundUsd(Number(userRow?.balance_usd ?? 0)));
      }

      for (const row of expiredForLedger) {
        insertFinancial.run(
          crypto.randomUUID(),
          row.user_id,
          `Fixed-term plan expired & auto-deactivated: ${row.plan_name} (${row.selected_asset})`,
          roundUsd(row.amount_usd),
          userBalanceMap.get(row.user_id) ?? 0,
          nowIso
        );
      }
    }

    if (manageTx) {
      targetDb.exec('COMMIT');
    }
  } catch (err) {
    if (manageTx) {
      try {
        targetDb.exec('ROLLBACK');
      } catch {
        // Ignore secondary rollback error if transaction was already closed
      }
    }
    throw err;
  }

  return expiredCount;
}

export function getPlatformSettings(targetDb: DatabaseSync = db): PlatformSettings {
  const rows = targetDb.prepare('SELECT key, value FROM platform_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));

  let steps = DEFAULT_DEPOSIT_STEPS;
  try {
    const rawSteps = map.get('depositGuideSteps');
    if (rawSteps) {
      const parsed = JSON.parse(rawSteps);
      if (Array.isArray(parsed) && parsed.length > 0) steps = parsed;
    }
  } catch {
    steps = DEFAULT_DEPOSIT_STEPS;
  }

  return {
    brandName: map.get('brandName') ?? DEFAULT_SETTINGS.brandName,
    brandTagline: map.get('brandTagline') ?? DEFAULT_SETTINGS.brandTagline,
    heroHeadline: map.get('heroHeadline') ?? DEFAULT_SETTINGS.heroHeadline,
    heroSubheadline: map.get('heroSubheadline') ?? DEFAULT_SETTINGS.heroSubheadline,
    announcementBanner: map.get('announcementBanner') ?? DEFAULT_SETTINGS.announcementBanner,
    extraBonusNotice: map.get('extraBonusNotice') ?? DEFAULT_SETTINGS.extraBonusNotice,
    supportEmail: map.get('supportEmail') ?? DEFAULT_SETTINGS.supportEmail,
    telegramUrl: map.get('telegramUrl') ?? DEFAULT_SETTINGS.telegramUrl,
    minWithdrawalUsd: Number(map.get('minWithdrawalUsd') ?? DEFAULT_SETTINGS.minWithdrawalUsd) || 1,
    referralCommissionPct:
      Number(map.get('referralCommissionPct') ?? DEFAULT_SETTINGS.referralCommissionPct) || 10,
    activationFeeBdt: Number(map.get('activationFeeBdt') ?? DEFAULT_SETTINGS.activationFeeBdt) || 40,
    activationFeeUsd: Number(map.get('activationFeeUsd') ?? DEFAULT_SETTINGS.activationFeeUsd) || 0.4,
    defaultAdRewardUsd:
      Number(map.get('defaultAdRewardUsd') ?? DEFAULT_SETTINGS.defaultAdRewardUsd) || 0.02,
    depositGuideSteps: steps,
  };
}

export interface RecordActivityLogInput {
  category: ActivityLogCategory;
  userId?: string | null;
  userEmail?: string;
  userName?: string;
  actionTitle: string;
  details?: string;
  amountUsd?: number | null;
  ipAddress?: string;
  status?: string;
  createdAt?: string;
}

export function recordActivityLog(
  input: RecordActivityLogInput,
  targetDb: DatabaseSync = db
): string {
  const id = crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const cleanAmount =
    input.amountUsd !== undefined && input.amountUsd !== null && Number.isFinite(input.amountUsd)
      ? roundUsd(input.amountUsd)
      : null;

  targetDb
    .prepare(
      `INSERT INTO activity_logs (id, category, user_id, user_email, user_name, action_title, details, amount_usd, ip_address, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.category,
      input.userId ?? null,
      String(input.userEmail ?? '').slice(0, 160),
      String(input.userName ?? '').slice(0, 120),
      String(input.actionTitle).slice(0, 160),
      String(input.details ?? '').slice(0, 400),
      cleanAmount,
      String(input.ipAddress ?? '').slice(0, 80),
      String(input.status ?? 'Completed').slice(0, 40),
      createdAt
    );

  return id;
}

export function queryActivityLogs(
  options?: {
    category?: ActivityLogCategory | 'All' | string;
    q?: string;
    limit?: number;
  },
  targetDb: DatabaseSync = db
): ActivityLogRecord[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  const category = String(options?.category ?? '').trim();
  if (
    category === 'User Login' ||
    category === 'Investment Activation' ||
    category === 'Deposit Submission'
  ) {
    conditions.push('category = ?');
    params.push(category);
  }

  const search = String(options?.q ?? '').trim().toLowerCase();
  if (search) {
    const likePattern = `%${search}%`;
    conditions.push(
      '(LOWER(user_email) LIKE ? OR LOWER(user_name) LIKE ? OR LOWER(COALESCE(user_id, \'\')) LIKE ? OR LOWER(action_title) LIKE ? OR LOWER(details) LIKE ? OR LOWER(status) LIKE ? OR LOWER(ip_address) LIKE ?)'
    );
    params.push(
      likePattern,
      likePattern,
      likePattern,
      likePattern,
      likePattern,
      likePattern,
      likePattern
    );
  }

  const rawLimit = Number(options?.limit ?? 500);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 10000) : 500;
  params.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = targetDb
    .prepare(
      `SELECT id, category, user_id, user_email, user_name, action_title, details, amount_usd, ip_address, status, created_at
       FROM activity_logs
       ${whereClause}
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`
    )
    .all(...params) as Array<{
    id: string;
    category: ActivityLogCategory;
    user_id: string | null;
    user_email: string;
    user_name: string;
    action_title: string;
    details: string;
    amount_usd: number | null;
    ip_address: string;
    status: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    actionTitle: row.action_title,
    details: row.details,
    amountUsd: row.amount_usd !== null ? roundUsd(row.amount_usd) : null,
    ipAddress: row.ip_address,
    status: row.status,
    createdAt: row.created_at,
  }));
}
