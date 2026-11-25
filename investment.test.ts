import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailyIncome,
  calculateExtraBonus,
  calculateReferralCommission,
  sanitizeExternalUrl,
  summarizePortfolio,
  validateGmailAddress,
  validateTxId,
} from './investment';

test('validateGmailAddress accepts valid gmail.com emails and rejects other domains', () => {
  const valid = validateGmailAddress('  Investor.One+vip@Gmail.com ');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'investor.one+vip@gmail.com');

  assert.equal(validateGmailAddress('trader@yahoo.com').valid, false);
  assert.equal(validateGmailAddress('trader@outlook.com').valid, false);
  assert.equal(validateGmailAddress('not-an-email').valid, false);
  assert.equal(validateGmailAddress('').valid, false);
});

test('validateTxId enforces realistic TRC-20 transaction ID format', () => {
  assert.equal(validateTxId('9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c').valid, true);
  assert.equal(validateTxId('short').valid, false);
  assert.equal(validateTxId('bad tx id with spaces').valid, false);
});

test('calculateDailyIncome returns $0.01 per $1 invested across VIP 1 to VIP 5', () => {
  assert.equal(calculateDailyIncome(1), 0.01);
  assert.equal(calculateDailyIncome(2), 0.02);
  assert.equal(calculateDailyIncome(3), 0.03);
  assert.equal(calculateDailyIncome(4), 0.04);
  assert.equal(calculateDailyIncome(5), 0.05);
  assert.equal(calculateDailyIncome(0), 0);
});

test('calculateReferralCommission computes exact 10% commission', () => {
  assert.equal(calculateReferralCommission(1), 0.1);
  assert.equal(calculateReferralCommission(5), 0.5);
  assert.equal(calculateReferralCommission(10), 1);
});

test('calculateExtraBonus computes extra profit trading bonus accurately', () => {
  assert.equal(calculateExtraBonus(5, 2), 0.1);
  assert.equal(calculateExtraBonus(2, 5), 0.1);
});

test('summarizePortfolio aggregates multi-purchase VIP tiers accurately', () => {
  const summary = summarizePortfolio([
    { planId: 'vip-1', planName: 'VIP 1', amountUsd: 1, dailyIncomeUsd: 0.01, status: 'Active' },
    { planId: 'vip-1', planName: 'VIP 1', amountUsd: 1, dailyIncomeUsd: 0.01, status: 'Active' },
    { planId: 'vip-5', planName: 'VIP 5', amountUsd: 5, dailyIncomeUsd: 0.05, status: 'Active' },
    { planId: 'vip-2', planName: 'VIP 2', amountUsd: 2, dailyIncomeUsd: 0.02, status: 'Paused' },
  ]);

  assert.equal(summary.activePositionsCount, 3);
  assert.equal(summary.totalInvestedUsd, 7);
  assert.equal(summary.dailyIncomeUsd, 0.07);
  assert.equal(summary.tierCounts['vip-1'], 2);
  assert.equal(summary.tierCounts['vip-5'], 1);
  assert.equal(summary.tierCounts['vip-2'], undefined);
});

test('sanitizeExternalUrl blocks javascript and data schemes', () => {
  assert.equal(sanitizeExternalUrl('https://t.me/aurumcapital'), 'https://t.me/aurumcapital');
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), '#');
  assert.equal(sanitizeExternalUrl('data:text/html,hi'), '#');
});
