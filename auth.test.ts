import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptRecoverablePassword,
  encryptRecoverablePassword,
  normalizeSmtpHost,
  sendOtpEmail,
  verifyAdminPasscode,
} from './auth';

test('verifyAdminPasscode uses constant-time comparison and handles whitespace/empty inputs', () => {
  assert.equal(verifyAdminPasscode('sample-pass-123', 'sample-pass-123'), true);
  assert.equal(verifyAdminPasscode('  sample-pass-123  ', 'sample-pass-123'), true);
  assert.equal(verifyAdminPasscode('wrong-pass', 'sample-pass-123'), false);
  assert.equal(verifyAdminPasscode('', 'sample-pass-123'), false);
  assert.equal(verifyAdminPasscode('sample-pass-123', ''), false);
});

test('normalizeSmtpHost corrects smtp.@gmail.com typo and rejects malformed hosts', () => {
  assert.equal(normalizeSmtpHost('smtp.@gmail.com'), 'smtp.gmail.com');
  assert.equal(normalizeSmtpHost('  SMTP.GMAIL.COM  '), 'smtp.gmail.com');
  assert.equal(normalizeSmtpHost('user@gmail.com'), '');
  assert.equal(normalizeSmtpHost('bad host'), '');
  assert.equal(normalizeSmtpHost(''), '');
});

test('encryptRecoverablePassword and decryptRecoverablePassword round-trip safely and reject tampering', () => {
  const secret = 'InvestorPass#2026!';
  const encrypted = encryptRecoverablePassword(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptRecoverablePassword(encrypted), secret);
  assert.equal(decryptRecoverablePassword('tampered:value'), null);
  assert.equal(decryptRecoverablePassword(null), null);
});

test('sendOtpEmail falls back gracefully without throwing when SMTP host is unreachable', async () => {
  const prevHost = process.env.SMTP_HOST;
  const prevUser = process.env.SMTP_USER;
  const prevPass = process.env.SMTP_PASS;

  try {
    process.env.SMTP_HOST = 'nonexistent.invalid.local';
    process.env.SMTP_USER = 'sender@gmail.com';
    process.env.SMTP_PASS = 'app-password';

    const result = await sendOtpEmail('investor@gmail.com', '123456', 'Aurum Capital');
    assert.equal(result.sentViaSmtp, false);
    assert.ok(result.fallbackReason && result.fallbackReason.length > 0);
  } finally {
    if (prevHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prevHost;
    if (prevUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = prevUser;
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
  }
});

