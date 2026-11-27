import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { expireDueInvestments, initDatabase } from './db.ts';
import { calculatePlanExpiryIso, formatDurationLabel } from '../src/utils/investment.ts';

test('initDatabase creates fixed-duration plan columns, seeds $1-$10 plans, and enforces max $10 cap', () => {
  const memDb = new DatabaseSync(':memory:');
  initDatabase(memDb);

  const plans = memDb
    .prepare('SELECT id, amount_usd, duration_days, duration_label FROM vip_plans WHERE is_active = 1 ORDER BY tier_number ASC')
    .all() as Array<{ id: string; amount_usd: number; duration_days: number; duration_label: string }>;

  assert.deepEqual(
    plans.map((p) => p.amount_usd),
    [1, 2, 3, 4, 5, 6, 7, 10]
  );
  for (const plan of plans) {
    assert.ok(plan.amount_usd <= 10);
    assert.equal(plan.duration_days, 30);
    assert.equal(plan.duration_label, '30 Days');
  }

  memDb.close();
});

test('expireDueInvestments compares timestamps against current time and automatically deactivates expired positions', () => {
  const memDb = new DatabaseSync(':memory:');
  initDatabase(memDb);

  const userId = 'user-test-1';
  const purchasedAt = '2026-11-01T10:00:00.000Z';
  const shortExpiry = calculatePlanExpiryIso(purchasedAt, 10); // 2026-11-11T10:00:00.000Z
  const longExpiry = calculatePlanExpiryIso(purchasedAt, 30); // 2026-12-01T10:00:00.000Z

  memDb
    .prepare(
      `INSERT INTO users (id, email, phone_number, full_name, password_hash, role, is_verified, activation_status, referral_code, balance_usd, total_invested_usd, created_at)
       VALUES (?, 'investor@gmail.com', '+8801700000001', 'Investor One', 'hash', 'user', 1, 'Activated', 'INV001', 15, 6, ?)`
    )
    .run(userId, purchasedAt);

  memDb
    .prepare(
      `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, status, purchased_at, duration_days, expires_at, created_at)
       VALUES (?, ?, 'vip-1', 'VIP 1', 'Gold', 1, 0.01, 'Active', ?, 10, ?, ?)`
    )
    .run('inv-short', userId, purchasedAt, shortExpiry, purchasedAt);

  memDb
    .prepare(
      `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, status, purchased_at, duration_days, expires_at, created_at)
       VALUES (?, ?, 'vip-5', 'VIP 5', 'USD', 5, 0.05, 'Active', ?, 30, ?, ?)`
    )
    .run('inv-long', userId, purchasedAt, longExpiry, purchasedAt);

  // Before either expires (Nov 10)
  const beforeCount = expireDueInvestments(
    { userId, nowMs: Date.parse('2026-11-10T23:59:59.000Z') },
    memDb
  );
  assert.equal(beforeCount, 0);

  // At Nov 12: shortExpiry (10 days) must expire, longExpiry (30 days) remains Active
  const midNowMs = Date.parse('2026-11-12T00:00:00.000Z');
  const midCount = expireDueInvestments({ userId, nowMs: midNowMs }, memDb);
  assert.equal(midCount, 1);

  const shortRow = memDb
    .prepare('SELECT status, expired_at FROM investments WHERE id = ?')
    .get('inv-short') as { status: string; expired_at: string | null };
  const longRow = memDb
    .prepare('SELECT status, expired_at FROM investments WHERE id = ?')
    .get('inv-long') as { status: string; expired_at: string | null };
  const userAfterMid = memDb
    .prepare('SELECT total_invested_usd FROM users WHERE id = ?')
    .get(userId) as { total_invested_usd: number };

  assert.equal(shortRow.status, 'Expired');
  assert.equal(shortRow.expired_at, new Date(midNowMs).toISOString());
  assert.equal(longRow.status, 'Active');
  assert.equal(longRow.expired_at, null);
  assert.equal(userAfterMid.total_invested_usd, 5);

  // Idempotent on repeat call
  const repeatCount = expireDueInvestments({ userId, nowMs: midNowMs }, memDb);
  assert.equal(repeatCount, 0);

  // At Dec 2: longExpiry expires too -> total_invested_usd drops to 0
  const endNowMs = Date.parse('2026-12-02T00:00:00.000Z');
  const endCount = expireDueInvestments({ userId, nowMs: endNowMs }, memDb);
  assert.equal(endCount, 1);

  const userAfterEnd = memDb
    .prepare('SELECT total_invested_usd FROM users WHERE id = ?')
    .get(userId) as { total_invested_usd: number };
  assert.equal(userAfterEnd.total_invested_usd, 0);

  const expiredLedgerRows = memDb
    .prepare("SELECT category, description FROM financial_records WHERE user_id = ? AND category = 'Plan Expired'")
    .all(userId) as Array<{ category: string; description: string }>;
  assert.equal(expiredLedgerRows.length, 2);
  assert.equal(formatDurationLabel(10), '10 Days');

  memDb.close();
});
