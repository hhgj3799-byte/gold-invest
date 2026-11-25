import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DepositGuideStep, PlatformSettings, SupportedAsset } from '../src/types/platform.ts';

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
    description: 'Choose Binance (USDT TRC-20) or Trust Wallet (USDT TRC-20) and copy the verified deposit address.',
  },
  {
    step: 2,
    title: 'Send Exact TRC-20 Transfer',
    description: 'Transfer the exact VIP plan amount via the Tron (TRC-20) network from your external wallet.',
  },
  {
    step: 3,
    title: 'Save Transaction ID (TxID)',
    description: 'Copy the blockchain Transaction Hash / TxID shown on your Binance or Trust Wallet receipt.',
  },
  {
    step: 4,
    title: 'Submit Proof for Review',
    description: 'Paste your Transaction ID and select your target asset (Gold, USD, Apple, Meta, or Tesla).',
  },
  {
    step: 5,
    title: 'Admin Verification',
    description: 'Your deposit remains Pending until verified by an administrator, typically within 5 to 15 minutes.',
  },
];

export const DEFAULT_SETTINGS: PlatformSettings = {
  brandName: 'Aurum Capital',
  brandTagline: 'Institutional Multi-Asset & Precious Metals Yield Platform',
  heroHeadline: 'Disciplined Daily Yield Across Gold, USD & Global Equities',
  heroSubheadline:
    'Allocate into VIP 1 to VIP 5 tiers starting from $1 with fixed $0.01 daily income per $1 invested and zero lock-in duration.',
  announcementBanner:
    'Platform surplus profit bonuses are distributed directly to active VIP investors whenever trading operations exceed benchmark yield.',
  extraBonusNotice:
    'Additional trading bonuses may be distributed to active VIP holders if the platform generates extra trading profit.',
  supportEmail: 'support@aurumcapital.example',
  telegramUrl: 'https://t.me/aurumcapital_official',
  minWithdrawalUsd: 1,
  referralCommissionPct: 10,
  depositGuideSteps: DEFAULT_DEPOSIT_STEPS,
};

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_verified INTEGER NOT NULL DEFAULT 0,
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
      supported_assets TEXT NOT NULL,
      duration_label TEXT NOT NULL DEFAULT 'No Fixed Duration',
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
  `);

  seedDefaults();
}

function seedDefaults(): void {
  const planCountRow = db.prepare('SELECT COUNT(*) as count FROM vip_plans').get() as { count: number };
  if (planCountRow.count === 0) {
    const defaultAssets: SupportedAsset[] = ['Gold', 'USD', 'Apple', 'Meta', 'Tesla'];
    const insertPlan = db.prepare(`
      INSERT INTO vip_plans (id, tier_number, name, subtitle, amount_usd, daily_rate_per_dollar, supported_assets, duration_label, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const tiers = [
      { id: 'vip-1', tier: 1, name: 'VIP 1', subtitle: 'Starter Reserve Allocation', amount: 1 },
      { id: 'vip-2', tier: 2, name: 'VIP 2', subtitle: 'Core Multi-Asset Position', amount: 2 },
      { id: 'vip-3', tier: 3, name: 'VIP 3', subtitle: 'Balanced Equity & Gold Tier', amount: 3 },
      { id: 'vip-4', tier: 4, name: 'VIP 4', subtitle: 'Growth Portfolio Allocation', amount: 4 },
      { id: 'vip-5', tier: 5, name: 'VIP 5', subtitle: 'Premier Executive Reserve', amount: 5 },
    ];

    for (const t of tiers) {
      insertPlan.run(
        t.id,
        t.tier,
        t.name,
        t.subtitle,
        t.amount,
        0.01,
        JSON.stringify(defaultAssets),
        'No Fixed Duration',
        t.tier
      );
    }
  }

  const pmCountRow = db.prepare('SELECT COUNT(*) as count FROM payment_methods').get() as { count: number };
  if (pmCountRow.count === 0) {
    const insertPm = db.prepare(`
      INSERT INTO payment_methods (id, name, network, wallet_address, instructions, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    insertPm.run(
      'pm-binance-trc20',
      'Binance (USDT TRC-20)',
      'TRC-20 (Tron)',
      'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
      'Open Binance Withdraw -> Select USDT -> Choose Tron (TRC20) network -> Transfer exact plan amount and copy TxID.',
      1
    );
    insertPm.run(
      'pm-trustwallet-trc20',
      'Trust Wallet (USDT TRC-20)',
      'TRC-20 (Tron)',
      'TVj7RNVHy6thbM7BWdSe9G6gHkKhj5h6eF',
      'Open Trust Wallet -> Select USDT (TRC20 / Tron) -> Send exact plan amount -> Paste the resulting Transaction Hash.',
      2
    );
  }

  const upsertSetting = db.prepare(`
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
  upsertSetting.run('depositGuideSteps', JSON.stringify(DEFAULT_SETTINGS.depositGuideSteps));
}

export function getPlatformSettings(): PlatformSettings {
  const rows = db.prepare('SELECT key, value FROM platform_settings').all() as Array<{
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
    depositGuideSteps: steps,
  };
}
