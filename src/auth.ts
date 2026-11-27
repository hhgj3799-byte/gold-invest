import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
let cachedVaultKey: Buffer | null = null;

function getSessionSecret(): string {
  const configured = (process.env.SESSION_SECRET ?? '').trim();
  return configured.length >= 16 ? configured : EPHEMERAL_SECRET;
}

function getCredentialKey(): Buffer {
  const envSecret =
    (process.env.CREDENTIAL_ENCRYPTION_KEY ?? '').trim() ||
    (process.env.SESSION_SECRET ?? '').trim();
  if (envSecret.length >= 12) {
    return crypto.createHash('sha256').update(envSecret).digest();
  }
  if (cachedVaultKey) return cachedVaultKey;

  const dataDir = path.resolve(process.cwd(), 'data');
  const keyFile = path.join(dataDir, '.vault.key');
  try {
    if (fs.existsSync(keyFile)) {
      const existingHex = fs.readFileSync(keyFile, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(existingHex)) {
        cachedVaultKey = Buffer.from(existingHex, 'hex');
        return cachedVaultKey;
      }
    }
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, generated.toString('hex'), { mode: 0o600 });
    cachedVaultKey = generated;
    return cachedVaultKey;
  } catch {
    cachedVaultKey = crypto.createHash('sha256').update(EPHEMERAL_SECRET).digest();
    return cachedVaultKey;
  }
}

export function encryptRecoverablePassword(plainPassword: string): string {
  const key = getCredentialKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainPassword, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptRecoverablePassword(payload: string | null | undefined): string | null {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, encHex] = parts;
  if (!ivHex || !tagHex || !encHex) return null;
  try {
    const key = getCredentialKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function verifyAdminPasscode(providedPasscode: string, configuredPasscode: string): boolean {
  const provided = String(providedPasscode ?? '').trim();
  const configured = String(configuredPasscode ?? '').trim();
  if (!provided || !configured) return false;
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const configuredDigest = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(providedDigest, configuredDigest);
}

export function hashOtp(email: string, otp: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${email.toLowerCase()}:${otp}`)
    .digest('hex');
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  exp: number;
}

export function signSessionToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.sub || !parsed.email || !parsed.role || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeSmtpHost(rawHost: string): string {
  const trimmed = (rawHost ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const fixed = trimmed === 'smtp.@gmail.com' ? 'smtp.gmail.com' : trimmed;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(fixed)) {
    return '';
  }
  return fixed;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    normalizeSmtpHost(process.env.SMTP_HOST ?? '') &&
      (process.env.SMTP_USER ?? '').trim() &&
      (process.env.SMTP_PASS ?? '').trim()
  );
}

export async function sendOtpEmail(
  recipientGmail: string,
  otpCode: string,
  brandName: string
): Promise<{ sentViaSmtp: boolean; fallbackReason?: string }> {
  const host = normalizeSmtpHost(process.env.SMTP_HOST ?? '');
  const user = (process.env.SMTP_USER ?? '').trim();
  const pass = (process.env.SMTP_PASS ?? '').trim();

  if (!host || !user || !pass) {
    return { sentViaSmtp: false };
  }

  const port = Number(process.env.SMTP_PORT ?? '587') || 587;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
    auth: {
      user,
      pass,
    },
  });

  const fromAddress = (process.env.SMTP_FROM ?? user).trim();

  try {
    await transporter.sendMail({
      from: `"${brandName}" <${fromAddress}>`,
      to: recipientGmail,
      subject: `${brandName} — Your Gmail Verification OTP`,
      text: `Your ${brandName} verification code is ${otpCode}. It expires in 10 minutes.`,
      html: `
        <div style="font-family: sans-serif; background: #090C11; color: #F3EFE6; padding: 24px; border-radius: 12px;">
          <h2 style="color: #D4AF37; margin-top: 0;">${brandName} Verification</h2>
          <p>Use the 6-digit One-Time Password below to activate your Gmail account:</p>
          <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #E5C158; margin: 20px 0;">
            ${otpCode}
          </div>
          <p style="color: #9CA3AF; font-size: 13px;">This verification code expires in 10 minutes.</p>
        </div>
      `,
    });
    return { sentViaSmtp: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'SMTP connection failed';
    console.warn('SMTP delivery unavailable, using in-app OTP fallback:', reason);
    return { sentViaSmtp: false, fallbackReason: reason };
  }
}

