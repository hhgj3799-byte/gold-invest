import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, queryActivityLogs, recordActivityLog } from './db.ts';
import { formatActivityLogsCsv } from '../src/utils/csv.ts';

test('recordActivityLog and queryActivityLogs persist, filter, search, and export CSV safely', () => {
  const memDb = new DatabaseSync(':memory:');
  initDatabase(memDb);

  recordActivityLog(
    {
      category: 'User Login',
      userId: 'user-1',
      userEmail: 'alpha@gmail.com',
      userName: 'Alpha Investor',
      actionTitle: 'User Signed In',
      details: 'Account role: user',
      ipAddress: '10.0.0.12',
      status: 'Completed',
      createdAt: '2026-11-27T01:00:00.000Z',
    },
    memDb
  );

  recordActivityLog(
    {
      category: 'Deposit Submission',
      userId: 'user-1',
      userEmail: 'alpha@gmail.com',
      userName: 'Alpha Investor',
      actionTitle: 'Wallet Deposit Submitted',
      details: 'Wallet Balance (Gold) via Nagad (P2P) · Tx NAGAD998811',
      amountUsd: 10,
      ipAddress: '10.0.0.12',
      status: 'Pending',
      createdAt: '2026-11-27T02:00:00.000Z',
    },
    memDb
  );

  recordActivityLog(
    {
      category: 'Investment Activation',
      userId: 'user-2',
      userEmail: 'beta@gmail.com',
      userName: '=CMD() Beta',
      actionTitle: 'VIP Plan Activated (VIP 3)',
      details: 'VIP 3 (USD, 30 Days) via Available Balance',
      amountUsd: 3,
      ipAddress: '10.0.0.22',
      status: 'Active',
      createdAt: '2026-11-27T03:00:00.000Z',
    },
    memDb
  );

  const allLogs = queryActivityLogs({}, memDb);
  assert.equal(allLogs.length, 3);
  assert.equal(allLogs[0].category, 'Investment Activation');
  assert.equal(allLogs[1].category, 'Deposit Submission');
  assert.equal(allLogs[2].category, 'User Login');

  const depositLogs = queryActivityLogs({ category: 'Deposit Submission' }, memDb);
  assert.equal(depositLogs.length, 1);
  assert.equal(depositLogs[0].amountUsd, 10);

  const searchLogs = queryActivityLogs({ q: 'NAGAD998811' }, memDb);
  assert.equal(searchLogs.length, 1);
  assert.equal(searchLogs[0].userEmail, 'alpha@gmail.com');

  const csv = formatActivityLogsCsv(allLogs);
  assert.ok(csv.startsWith('Log ID,Timestamp (UTC),Category,User Email,User Name,User ID,Action,Details,Amount (USD),Status,IP Address\r\n'));
  assert.ok(csv.includes("'=CMD() Beta"));
  assert.ok(csv.includes('VIP Plan Activated (VIP 3)'));

  memDb.close();
});

test('initDatabase backfills historical deposits, activations, and investments when activity_logs is empty', () => {
  const memDb = new DatabaseSync(':memory:');
  initDatabase(memDb);

  const nowIso = '2026-11-20T09:00:00.000Z';
  memDb
    .prepare(
      `INSERT INTO users (id, email, phone_number, full_name, password_hash, role, is_verified, activation_status, referral_code, balance_usd, total_invested_usd, created_at)
       VALUES ('u-hist', 'hist@gmail.com', '+8801700000099', 'Historical User', 'hash', 'user', 1, 'Activated', 'HIST01', 5, 2, ?)`
    )
    .run(nowIso);

  memDb
    .prepare(
      `INSERT INTO deposits (id, user_id, plan_id, plan_name, selected_asset, payment_method_id, payment_method_name, amount_usd, tx_id, status, created_at)
       VALUES ('d-hist', 'u-hist', 'vip-2', 'VIP 2', 'Gold', 'pm-nagad-p2p', 'Nagad (P2P)', 2, 'HISTTX1234', 'Approved', ?)`
    )
    .run(nowIso);

  memDb
    .prepare(
      `INSERT INTO investments (id, user_id, plan_id, plan_name, selected_asset, amount_usd, daily_income_usd, source_deposit_id, status, purchased_at, duration_days, created_at)
       VALUES ('i-hist', 'u-hist', 'vip-2', 'VIP 2', 'Gold', 2, 0.02, 'd-hist', 'Active', ?, 30, ?)`
    )
    .run(nowIso, nowIso);

  // Re-run initDatabase on DB with empty activity_logs to trigger historical backfill
  initDatabase(memDb);

  const logs = queryActivityLogs({}, memDb);
  assert.equal(logs.length, 2);
  assert.ok(logs.some((l) => l.category === 'Deposit Submission' && l.details.includes('HISTTX1234')));
  assert.ok(logs.some((l) => l.category === 'Investment Activation' && l.details.includes('Approved Deposit')));

  // Re-running initDatabase again must remain idempotent
  initDatabase(memDb);
  assert.equal(queryActivityLogs({}, memDb).length, 2);

  memDb.close();
});
