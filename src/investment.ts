export interface GmailValidationResult {
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
 * Format USD amount with exact 2-decimal display (or up to 4 if sub-cent).
 */
export function formatUsd(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `$${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Strictly requires a valid @gmail.com email address for platform registration.
 */
export function validateGmailAddress(email: string): GmailValidationResult {
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
 * Validates external TRC-20 / exchange Transaction ID / TxHash inputs.
 */
export function validateTxId(txId: string): TxIdValidationResult {
  const normalized = (txId ?? '').trim();
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Transaction ID is required.' };
  }
  if (normalized.length < 8 || normalized.length > 128) {
    return {
      valid: false,
      normalized,
      error: 'Transaction ID must be between 8 and 128 characters.',
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
 * Daily income is fixed at $0.01 per $1 invested by default.
 */
export function calculateDailyIncome(amountUsd: number, ratePerDollar = 0.01): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  if (!Number.isFinite(ratePerDollar) || ratePerDollar < 0) return 0;
  return roundUsd(amountUsd * ratePerDollar);
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

/**
 * Aggregates multi-purchase VIP positions into total invested capital,
 * total daily income, and per-tier purchase counts.
 */
export function summarizePortfolio(
  positions: ReadonlyArray<{
    planId: string;
    planName: string;
    amountUsd: number;
    dailyIncomeUsd: number;
    status: string;
  }>
): PortfolioSummary {
  const tierCounts: Record<string, number> = {};
  let activePositionsCount = 0;
  let totalInvestedUsd = 0;
  let dailyIncomeUsd = 0;

  for (const pos of positions) {
    if (pos.status !== 'Active') continue;
    activePositionsCount += 1;
    totalInvestedUsd = roundUsd(totalInvestedUsd + pos.amountUsd);
    dailyIncomeUsd = roundUsd(dailyIncomeUsd + pos.dailyIncomeUsd);
    tierCounts[pos.planId] = (tierCounts[pos.planId] ?? 0) + 1;
  }

  return {
    activePositionsCount,
    totalInvestedUsd,
    dailyIncomeUsd,
    tierCounts,
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
