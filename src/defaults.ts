import type { PlatformSettings } from '../types/platform';

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
  depositGuideSteps: [
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
  ],
};
