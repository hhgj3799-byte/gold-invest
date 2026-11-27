import type { PlatformSettings } from '../types/platform';

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
  depositGuideSteps: [
    {
      step: 1,
      title: 'Select Payment Method',
      description: 'Choose Nagad (P2P), Binance (P2P), or Trust Wallet USDT (TRC20 / BEP20).',
    },
    {
      step: 2,
      title: 'Send Exact Payment',
      description: 'Transfer the 40 BDT ($0.40) activation fee or exact VIP plan amount ($1–$10).',
    },
    {
      step: 3,
      title: 'Save Transaction ID',
      description: 'Copy the Transaction ID / TxHash from Nagad, Binance, or Trust Wallet.',
    },
    {
      step: 4,
      title: 'Submit Proof',
      description: 'Submit your TxID so the administrator receives an instant approval notification.',
    },
    {
      step: 5,
      title: 'Admin Activation',
      description: 'Admin verifies and activates your account or VIP position promptly.',
    },
  ],
};
