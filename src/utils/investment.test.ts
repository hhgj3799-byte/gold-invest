import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailyIncome,
  calculateEstimatedMonthlyReturn,
  calculateExtraBonus,
  calculatePlanExpiryIso,
  calculateReferralCommission,
  computeVipProgress,
  formatDisplayDateTime,
  formatDurationLabel,
  getRemainingTermSummary,
  isPlanExpired,
  sanitizeDurationDays,
  sanitizeExternalUrl,
  summarizePortfolio,
  validateEmailAddress,
  validateGmailAddress,
  validatePhoneNumber,
  validateTxId,
} from './investment';

test('validateEmailAddress and validatePhoneNumber validate registration inputs accurately', () => {
  assert.equal(validateEmailAddress('Investor@gmail.com').valid, true);
  assert.equal(validateEmailAddress('member@company.org').valid, true);
  assert.equal(validateEmailAddress('invalid-email').valid, false);

  assert.equal(validateGmailAddress('trader@gmail.com').valid, true);
  assert.equal(validateGmailAddress('trader@yahoo.com').valid, false);

  const phoneOk = validatePhoneNumber('+880 1711-000111');
  assert.equal(phoneOk.valid, true);
  assert.equal(phoneOk.normalized, '+8801711000111');
  assert.equal(validatePhoneNumber('123').valid, false);
});

test('validateTxId enforces transaction ID format', () => {
  assert.equal(validateTxId('9f8a7b6c5d4e3f2a').valid, true);
  assert.equal(validateTxId('NGD12345').valid, true);
  assert.equal(validateTxId('short').valid, false);
  assert.equal(validateTxId('bad tx id').valid, false);
});

test('daily return is $0.01/day per $1 and estimated monthly return is $0.20/mo per $1 across VIP 1-7', () => {
  assert.equal(calculateDailyIncome(1), 0.01);
  assert.equal(calculateDailyIncome(10), 0.1);
  assert.equal(calculateDailyIncome(20), 0.2);

  assert.equal(calculateEstimatedMonthlyReturn(1), 0.2);
  assert.equal(calculateEstimatedMonthlyReturn(5), 1);
  assert.equal(calculateEstimatedMonthlyReturn(10), 2);
  assert.equal(calculateEstimatedMonthlyReturn(20), 4);
});

test('calculateReferralCommission computes exact 10% commission', () => {
  assert.equal(calculateReferralCommission(1), 0.1);
  assert.equal(calculateReferralCommission(10), 1);
  assert.equal(calculateReferralCommission(20), 2);
});

test('calculateExtraBonus computes extra profit trading bonus accurately', () => {
  assert.equal(calculateExtraBonus(10, 5), 0.5);
});

test('summarizePortfolio and computeVipProgress track VIP 1 to VIP 7 accurately and exclude expired plans', () => {
  const now = Date.parse('2026-11-27T12:00:00.000Z');
  const summary = summarizePortfolio(
    [
      {
        planId: 'vip-1',
        planName: 'VIP 1',
        amountUsd: 1,
        dailyIncomeUsd: 0.01,
        status: 'Active',
        expiresAt: '2026-12-27T12:00:00.000Z',
      },
      {
        planId: 'vip-6',
        planName: 'VIP 6',
        amountUsd: 10,
        dailyIncomeUsd: 0.1,
        status: 'Active',
        expiresAt: '2026-12-10T12:00:00.000Z',
      },
      {
        planId: 'vip-7',
        planName: 'VIP 7',
        amountUsd: 20,
        dailyIncomeUsd: 0.2,
        status: 'Expired',
        expiresAt: '2026-11-20T12:00:00.000Z',
      },
      {
        planId: 'vip-5',
        planName: 'VIP 5',
        amountUsd: 5,
        dailyIncomeUsd: 0.05,
        status: 'Active',
        expiresAt: '2026-11-27T11:59:59.000Z',
      },
    ],
    now
  );

  assert.equal(summary.activePositionsCount, 2);
  assert.equal(summary.totalInvestedUsd, 11);
  assert.equal(summary.dailyIncomeUsd, 0.11);
  assert.equal(summary.estimatedMonthlyUsd, 2.2);

  const progress = computeVipProgress(11, [
    { tierNumber: 1, name: 'VIP 1', amountUsd: 1 },
    { tierNumber: 6, name: 'VIP 6', amountUsd: 10 },
    { tierNumber: 7, name: 'VIP 7', amountUsd: 20 },
  ]);
  assert.equal(progress.currentTierNumber, 6);
  assert.equal(progress.currentTierLabel, 'VIP 6');
  assert.equal(progress.nextTierLabel, 'VIP 7');
  assert.equal(progress.progressPct, 55);
});

test('fixed-duration expiry calculations handle boundaries and malformed inputs safely', () => {
  const purchased = '2026-11-01T00:00:00.000Z';
  const expiry = calculatePlanExpiryIso(purchased, 30);
  assert.equal(expiry, '2026-12-01T00:00:00.000Z');

  // Before, exact boundary, and after
  assert.equal(isPlanExpired(expiry, Date.parse('2026-11-30T23:59:59.999Z')), false);
  assert.equal(isPlanExpired(expiry, Date.parse('2026-12-01T00:00:00.000Z')), true);
  assert.equal(isPlanExpired(expiry, Date.parse('2026-12-02T00:00:00.000Z')), true);

  // Remaining term summary
  const remaining = getRemainingTermSummary(expiry, Date.parse('2026-11-29T12:00:00.000Z'));
  assert.equal(remaining.expired, false);
  assert.equal(remaining.remainingDays, 1);
  assert.equal(remaining.label, '1d 12h left');

  const expiredSummary = getRemainingTermSummary(expiry, Date.parse('2026-12-01T00:00:01.000Z'));
  assert.equal(expiredSummary.expired, true);
  assert.equal(expiredSummary.label, 'Expired');

  // Safe guards against invalid inputs / NaN / extreme values
  assert.equal(calculatePlanExpiryIso('not-a-date', 30), null);
  assert.equal(calculatePlanExpiryIso(purchased, 0), null);
  assert.equal(sanitizeDurationDays(-5, 30), 30);
  assert.equal(sanitizeDurationDays('abc', 30), 30);
  assert.equal(sanitizeDurationDays(99999, 30), 3650);
  assert.equal(formatDurationLabel(30), '30 Days');
  assert.equal(formatDurationLabel(1), '1 Day');
  assert.equal(formatDurationLabel(0), 'No Fixed Duration');
  assert.equal(isPlanExpired(null), false);
  assert.equal(isPlanExpired('invalid-iso'), false);
  assert.equal(formatDisplayDateTime(null), '—');
  assert.equal(formatDisplayDateTime('bad-date'), '—');
});

test('sanitizeExternalUrl blocks javascript and data schemes', () => {
  assert.equal(sanitizeExternalUrl('https://t.me/aurumcapital'), 'https://t.me/aurumcapital');
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), '#');
  assert.equal(sanitizeExternalUrl('data:text/html,hi'), '#');
});
