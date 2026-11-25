import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = (process.env.SESSION_SECRET ?? '').trim();
  return configured.length >= 16 ? configured : EPHEMERAL_SECRET;
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

export function isSmtpConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST ?? '').trim() &&
      (process.env.SMTP_USER ?? '').trim() &&
      (process.env.SMTP_PASS ?? '').trim()
  );
}

export async function sendOtpEmail(
  recipientGmail: string,
  otpCode: string,
  brandName: string
): Promise<{ sentViaSmtp: boolean }> {
  if (!isSmtpConfigured()) {
    return { sentViaSmtp: false };
  }

  const port = Number(process.env.SMTP_PORT ?? '587') || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });

  const fromAddress = (process.env.SMTP_FROM ?? process.env.SMTP_USER!).trim();

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
}
