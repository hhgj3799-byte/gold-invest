import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeCsvCell, formatActivityLogsCsv } from './csv.ts';

test('escapeCsvCell handles quotes, commas, newlines, and null values cleanly', () => {
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
  assert.equal(escapeCsvCell('User Login'), 'User Login');
  assert.equal(escapeCsvCell('VIP 1, Gold'), '"VIP 1, Gold"');
  assert.equal(escapeCsvCell('Note "verified"'), '"Note ""verified"""');
  assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
});

test('escapeCsvCell neutralizes spreadsheet formula injection prefixes', () => {
  assert.equal(escapeCsvCell('=CMD|"/C calc"!A0'), '"\'=CMD|""/C calc""!A0"');
  assert.equal(escapeCsvCell('+1+1'), "'+1+1");
  assert.equal(escapeCsvCell('-2+3'), "'-2+3");
  assert.equal(escapeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
});

test('formatActivityLogsCsv renders headers and all log fields in RFC-4180 format', () => {
  const csv = formatActivityLogsCsv([
    {
      id: 'log-1',
      category: 'User Login',
      userId: 'user-1',
      userEmail: 'investor@gmail.com',
      userName: 'Alex Morgan',
      actionTitle: 'Account Sign In',
      details: 'Signed in via web portal',
      amountUsd: null,
      ipAddress: '127.0.0.1',
      status: 'Success',
      createdAt: '2026-11-27T10:00:00.000Z',
    },
    {
      id: 'log-2',
      category: 'Deposit Submission',
      userId: 'user-1',
      userEmail: 'investor@gmail.com',
      userName: 'Alex Morgan',
      actionTitle: 'VIP 2 Deposit Submitted',
      details: 'Nagad P2P, TxID: TRX9988',
      amountUsd: 2,
      ipAddress: '127.0.0.1',
      status: 'Pending',
      createdAt: '2026-11-27T10:05:00.000Z',
    },
  ]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Log ID,Timestamp (UTC),Category,User Email'));
  assert.equal(
    lines[1],
    'log-1,2026-11-27T10:00:00.000Z,User Login,investor@gmail.com,Alex Morgan,user-1,Account Sign In,Signed in via web portal,,Success,127.0.0.1'
  );
  assert.equal(
    lines[2],
    'log-2,2026-11-27T10:05:00.000Z,Deposit Submission,investor@gmail.com,Alex Morgan,user-1,VIP 2 Deposit Submitted,"Nagad P2P, TxID: TRX9988",2.00,Pending,127.0.0.1'
  );
});
