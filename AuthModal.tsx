import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Mail, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiFetch, ApiError } from '../api/client';
import { validateGmailAddress } from '../utils/investment';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  initialReferralCode?: string;
  brandName: string;
  onClose: () => void;
  onAuthenticated: (token: string, payload: unknown) => void;
}

export function AuthModal({
  isOpen,
  initialMode = 'login',
  initialReferralCode = '',
  brandName,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'otp'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [sentViaSmtp, setSentViaSmtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setInfo(null);
      if (initialReferralCode) {
        setReferralCode(initialReferralCode);
      }
    }
  }, [isOpen, initialMode, initialReferralCode]);

  if (!isOpen) return null;

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const check = validateGmailAddress(email);
    if (!check.valid) {
      setError(check.error ?? 'Valid @gmail.com address required.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{
        requiresOtp: boolean;
        email: string;
        sentViaSmtp: boolean;
        previewOtp?: string;
        message: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: check.normalized,
          password,
          referralCode: referralCode.trim(),
        },
      });
      setOtpEmail(res.email);
      setSentViaSmtp(res.sentViaSmtp);
      setPreviewOtp(res.previewOtp ?? null);
      setInfo(res.message);
      setMode('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/auth/verify-otp', {
        method: 'POST',
        body: {
          email: otpEmail,
          otp: otp.trim(),
        },
      });
      onAuthenticated(res.token, res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ sentViaSmtp: boolean; previewOtp?: string }>('/api/auth/resend-otp', {
        method: 'POST',
        body: { email: otpEmail },
      });
      setSentViaSmtp(res.sentViaSmtp);
      setPreviewOtp(res.previewOtp ?? null);
      setInfo(`A fresh 6-digit OTP was issued for ${otpEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend OTP.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const check = validateGmailAddress(email);
    if (!check.valid) {
      setError(check.error ?? 'Valid @gmail.com address required.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/auth/login', {
        method: 'POST',
        body: {
          email: check.normalized,
          password,
        },
      });
      onAuthenticated(res.token, res);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_REQUIRED' && err.email) {
        setOtpEmail(err.email);
        setMode('otp');
        setError('Your Gmail account is not activated yet. Enter or resend your 6-digit OTP.');
      } else {
        setError(err instanceof Error ? err.message : 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#252F42] bg-[#10151E] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-medium text-[#D4AF37]">{brandName}</p>
            <h2 id="auth-modal-title" className="text-xl font-semibold text-[#F3EFE6] mt-0.5">
              {mode === 'login' && 'Investor Sign In'}
              {mode === 'register' && 'Create Gmail Account'}
              {mode === 'otp' && 'Verify Gmail OTP'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#232D3E] text-[#9AA4B5] hover:text-[#F3EFE6] hover:border-[#3A465C] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode !== 'otp' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090C11] border border-[#1E2736] mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#D4AF37] text-[#090C11]'
                  : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#D4AF37] text-[#090C11]'
                  : 'text-[#9AA4B5] hover:text-[#F3EFE6]'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-200">
            {info}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Gmail Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7C8698] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] pl-10 pr-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#7C8698] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] pl-10 pr-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Gmail Address (@gmail.com required)
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investor@gmail.com"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Password (min 6 characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label htmlFor="reg-ref" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Referral Code (Optional — 10% partner reward)
              </label>
              <input
                id="reg-ref"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="e.g. ALEX4A1B"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 font-mono text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Sending OTP...' : 'Send Verification OTP'}</span>
            </button>
          </form>
        )}

        {mode === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="rounded-xl border border-[#242E3F] bg-[#090C11] p-3.5 text-xs text-[#A6AEBD] space-y-1.5">
              <div className="flex items-center gap-2 text-[#F3EFE6] font-medium">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span>Verifying {otpEmail}</span>
              </div>
              <p>
                {sentViaSmtp
                  ? 'Enter the 6-digit OTP delivered to your Gmail inbox.'
                  : 'SMTP mail is in preview mode. Use the verification OTP delivered below to activate your account.'}
              </p>
              {previewOtp && (
                <div className="pt-1 flex items-center justify-between border-t border-[#1D2533]">
                  <span className="text-[#9AA4B5]">Gmail OTP Delivery:</span>
                  <span
                    data-testid="preview-otp-code"
                    className="font-mono text-base font-semibold tracking-widest text-[#E5C158]"
                  >
                    {previewOtp}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="otp-input" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                6-Digit OTP Code
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full min-h-[48px] rounded-xl border border-[#242E3F] bg-[#090C11] px-4 font-mono text-lg tracking-[0.35em] text-center text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] font-semibold text-sm transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Activating Account...' : 'Verify & Activate Account'}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-[#D4AF37] hover:underline cursor-pointer"
              >
                Resend OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="text-[#9AA4B5] hover:text-[#F3EFE6] cursor-pointer"
              >
                Change Gmail
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
