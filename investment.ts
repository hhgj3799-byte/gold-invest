export interface EmailValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface TxIdValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface PortfolioSummary {
  activePositionsCount: number;
  totalInvestedUsd: number;
  dailyIncomeUsd: number;
  estimatedMonthlyUsd: number;
  tierCounts: Record<string, number>;
}

/**
 * Round currency cleanly to 4 decimal places for internal accrual precision,
 * preventing binary floating-point drift on $0.01 daily yields.
 */
export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Format USD amount with exact 2-decimal display.
 */
export function formatUsd(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `$${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Validates standard email addresses (supports Gmail and other valid domains).
 */
export function validateEmailAddress(email: string): EmailValidationResult {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Email address is required.' };
  }
  if (/\s/.test(normalized)) {
    return { valid: false, normalized, error: 'Email address cannot contain spaces.' };
  }
  const emailRegex = /^[a-z0-9](?:[a-z0-9.+_-]{0,62}[a-z0-9])?@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
  if (!emailRegex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid email address.',
    };
  }
  return { valid: true, normalized };
}

/**
 * Strictly requires a valid @gmail.com email address when Gmail-only validation is needed.
 */
export function validateGmailAddress(email: string): EmailValidationResult {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Gmail address is required.' };
  }
  if (/\s/.test(normalized)) {
    return { valid: false, normalized, error: 'Email address cannot contain spaces.' };
  }
  const gmailRegex = /^[a-z0-9](?:[a-z0-9.+_-]{0,62}[a-z0-9])?@gmail\.com$/;
  if (!gmailRegex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Registration requires a valid @gmail.com address.',
    };
  }
  return { valid: true, normalized };
}

/**
 * Validates international and local phone numbers (7 to 18 digits, optional leading +).
 */
export function validatePhoneNumber(phone: string): PhoneValidationResult {
  const cleaned = (phone ?? '').trim().replace(/[\s()-]/g, '');
  if (!cleaned) {
    return { valid: false, normalized: '', error: 'Phone number is required.' };
  }
  if (!/^\+?[0-9]{7,18}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      error: 'Enter a valid phone number (7–18 digits, optional + country code).',
    };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Validates external TRC-20 / BEP-20 / P2P Transaction ID / TxHash inputs.
 */
export function validateTxId(txId: string): TxIdValidationResult {
  const normalized = (txId ?? '').trim();
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Transaction ID is required.' };
  }
  if (normalized.length < 6 || normalized.length > 128) {
    return {
      valid: false,
      normalized,
      error: 'Transaction ID must be between 6 and 128 characters.',
    };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Transaction ID may only contain letters, numbers, hyphens, and underscores.',
    };
  }
  return { valid: true, normalized };
}

/**
 * Daily income is fixed at $0.01 (1 cent) per $1 invested by default.
 */
export function calculateDailyIncome(amountUsd: number, ratePerDollar = 0.01): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  if (!Number.isFinite(ratePerDollar) || ratePerDollar < 0) return 0;
  return roundUsd(amountUsd * ratePerDollar);
}

/**
 * Estimated monthly return is $0.20 (20 cents) per $1 invested by default.
 */
export function calculateEstimatedMonthlyReturn(amountUsd: number, monthlyRatePerDollar = 0.2): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  if (!Number.isFinite(monthlyRatePerDollar) || monthlyRatePerDollar < 0) return 0;
  return roundUsd(amountUsd * monthlyRatePerDollar);
}

/**
 * Referral commission defaults to 10% of the approved deposit amount.
 */
export function calculateReferralCommission(depositAmountUsd: number, commissionPct = 10): number {
  if (!Number.isFinite(depositAmountUsd) || depositAmountUsd <= 0) return 0;
  if (!Number.isFinite(commissionPct) || commissionPct <= 0) return 0;
  return roundUsd((depositAmountUsd * commissionPct) / 100);
}

/**
 * Computes extra profit trading bonus for an active position based on bonus percentage.
 */
export function calculateExtraBonus(investedAmountUsd: number, bonusPercent: number): number {
  if (!Number.isFinite(investedAmountUsd) || investedAmountUsd <= 0) return 0;
  if (!Number.isFinite(bonusPercent) || bonusPercent <= 0) return 0;
  return roundUsd((investedAmountUsd * bonusPercent) / 100);
}

export const MS_PER_DAY = 86_400_000;
export const DEFAULT_DURATION_DAYS = 30;
export const MAX_DURATION_DAYS = 3650;
export const MAX_PLAN_AMOUNT_USD = 10;

export interface RemainingTermSummary {
  hasExpiry: boolean;
  expired: boolean;
  remainingDays: number;
  remainingHours: number;
  label: string;
}

/**
 * Normalizes a plan duration in days safely (0 = unlimited, 1..3650 = fixed days).
 */
export function sanitizeDurationDays(value: unknown, fallback = DEFAULT_DURATION_DAYS): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return fallback;
  }
  return Math.min(MAX_DURATION_DAYS, Math.floor(num));
}

/**
 * Formats a duration in days into a consistent human-readable label.
 */
export function formatDurationLabel(durationDays: number): string {
  const safeDays = sanitizeDurationDays(durationDays, DEFAULT_DURATION_DAYS);
  if (safeDays <= 0) return 'No Fixed Duration';
  if (safeDays === 1) return '1 Day';
  return `${safeDays} Days`;
}

/**
 * Calculates the ISO expiration timestamp from a purchase timestamp and duration in days.
 * Returns null if durationDays <= 0 or purchasedAtIso is invalid.
 */
export function calculatePlanExpiryIso(purchasedAtIso: string, durationDays: number): string | null {
  const safeDays = sanitizeDurationDays(durationDays, 0);
  if (safeDays <= 0) return null;

  const purchasedMs = Date.parse(purchasedAtIso);
  if (Number.isNaN(purchasedMs) || !Number.isFinite(purchasedMs)) {
    return null;
  }

  const expiryMs = purchasedMs + safeDays * MS_PER_DAY;
  if (!Number.isFinite(expiryMs)) {
    return null;
  }

  return new Date(expiryMs).toISOString();
}

/**
 * Compares an ISO expiration timestamp against current time (nowMs).
 * Returns true only when expiresAtIso is valid and nowMs >= expiresMs.
 */
export function isPlanExpired(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAtIso || !Number.isFinite(nowMs)) return false;
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs) || !Number.isFinite(expiresMs)) return false;
  return nowMs >= expiresMs;
}

/**
 * Computes human-readable remaining duration until a fixed-term plan expires.
 */
export function getRemainingTermSummary(
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now()
): RemainingTermSummary {
  if (!expiresAtIso || !Number.isFinite(nowMs)) {
    return {
      hasExpiry: false,
      expired: false,
      remainingDays: 0,
      remainingHours: 0,
      label: 'No Fixed Expiry',
    };
  }

  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs) || !Number.isFinite(expiresMs)) {
    return {
      hasExpiry: false,
      expired: false,
      remainingDays: 0,
      remainingHours: 0,
      label: 'No Fixed Expiry',
    };
  }

  const diffMs = expiresMs - nowMs;
  if (diffMs <= 0) {
    return {
      hasExpiry: true,
      expired: true,
      remainingDays: 0,
      remainingHours: 0,
      label: 'Expired',
    };
  }

  const totalHours = Math.ceil(diffMs / 3_600_000);
  const remainingDays = Math.floor(diffMs / MS_PER_DAY);
  const remainingHours = Math.max(0, Math.ceil((diffMs % MS_PER_DAY) / 3_600_000));

  let label: string;
  if (remainingDays >= 1) {
    label = `${remainingDays}d ${remainingHours % 24}h left`;
  } else {
    label = `${Math.max(1, totalHours)}h left`;
  }

  return {
    hasExpiry: true,
    expired: false,
    remainingDays,
    remainingHours: remainingHours % 24,
    label,
  };
}

/**
 * Safely formats an ISO date/time string for UI display without throwing on null or invalid values.
 */
export function formatDisplayDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Aggregates multi-purchase VIP positions into total invested capital,
 * total daily income, estimated monthly return, and per-tier purchase counts.
 * Excludes paused, expired, or past-expiry positions.
 */
export function summarizePortfolio(
  positions: ReadonlyArray<{
    planId: string;
    planName: string;
    amountUsd: number;
    dailyIncomeUsd: number;
    status: string;
    expiresAt?: string | null;
  }>,
  nowMs: number = Date.now()
): PortfolioSummary {
  const tierCounts: Record<string, number> = {};
  let activePositionsCount = 0;
  let totalInvestedUsd = 0;
  let dailyIncomeUsd = 0;

  for (const pos of positions) {
    if (pos.status !== 'Active') continue;
    if (isPlanExpired(pos.expiresAt, nowMs)) continue;
    activePositionsCount += 1;
    totalInvestedUsd = roundUsd(totalInvestedUsd + pos.amountUsd);
    dailyIncomeUsd = roundUsd(dailyIncomeUsd + pos.dailyIncomeUsd);
    tierCounts[pos.planId] = (tierCounts[pos.planId] ?? 0) + 1;
  }

  return {
    activePositionsCount,
    totalInvestedUsd,
    dailyIncomeUsd,
    estimatedMonthlyUsd: calculateEstimatedMonthlyReturn(totalInvestedUsd),
    tierCounts,
  };
}

/**
 * Computes the user's highest active VIP level (0-7) and progress toward the next tier.
 */
export function computeVipProgress(
  totalInvestedUsd: number,
  plans: ReadonlyArray<{ tierNumber: number; name: string; amountUsd: number }>
): {
  currentTierNumber: number;
  currentTierLabel: string;
  nextTierLabel: string | null;
  progressPct: number;
} {
  const sorted = [...plans].sort((a, b) => a.tierNumber - b.tierNumber);
  if (sorted.length === 0) {
    return { currentTierNumber: 0, currentTierLabel: 'Starter', nextTierLabel: 'VIP 1', progressPct: 0 };
  }

  let currentTier = 0;
  let currentLabel = 'Starter';
  let nextTier = sorted[0];

  for (let i = 0; i < sorted.length; i += 1) {
    if (totalInvestedUsd >= sorted[i].amountUsd) {
      currentTier = sorted[i].tierNumber;
      currentLabel = sorted[i].name;
      nextTier = sorted[i + 1] ?? null;
    }
  }

  if (!nextTier) {
    return {
      currentTierNumber: currentTier,
      currentTierLabel: currentLabel,
      nextTierLabel: null,
      progressPct: 100,
    };
  }

  const pct = Math.min(100, Math.max(0, Math.round((totalInvestedUsd / nextTier.amountUsd) * 100)));
  return {
    currentTierNumber: currentTier,
    currentTierLabel: currentLabel,
    nextTierLabel: nextTier.name,
    progressPct: pct,
  };
}

/**
 * Blocks unsafe javascript: or data: URLs in dynamic admin-configured links.
 */
export function sanitizeExternalUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return '#';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return parsed.toString();
    }
    return '#';
  } catch {
    return '#';
  }
}

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] ?? '*'}*@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}
