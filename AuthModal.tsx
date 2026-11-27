import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Mail, Phone, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../api/client';
import { t } from '../i18n/translations';
import type { SupportedLanguage } from '../types/platform';
import { validateEmailAddress, validatePhoneNumber } from '../utils/investment';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  initialReferralCode?: string;
  brandName: string;
  lang: SupportedLanguage;
  onClose: () => void;
  onAuthenticated: (token: string, payload: unknown) => void;
}

export function AuthModal({
  isOpen,
  initialMode = 'login',
  initialReferralCode = '',
  brandName,
  lang,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      if (initialReferralCode) {
        setReferralCode(initialReferralCode);
      }
    }
  }, [isOpen, initialMode, initialReferralCode]);

  if (!isOpen) return null;

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const emailCheck = validateEmailAddress(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error ?? 'Valid email address required.');
      return;
    }

    const phoneCheck = validatePhoneNumber(phoneNumber);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error ?? 'Valid phone number required.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: emailCheck.normalized,
          phoneNumber: phoneCheck.normalized,
          password,
          referralCode: referralCode.trim(),
        },
      });
      onAuthenticated(res.token, res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const emailCheck = validateEmailAddress(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error ?? 'Valid email address required.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ token: string } & Record<string, unknown>>('/api/auth/login', {
        method: 'POST',
        body: {
          email: emailCheck.normalized,
          password,
        },
      });
      onAuthenticated(res.token, res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
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
              {mode === 'login' ? t(lang, 'signIn') : t(lang, 'register')}
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
            {t(lang, 'signIn')}
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
            {t(lang, 'register')}
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
            {error}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7C8698] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investor@example.com"
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
              {loading ? 'Signing In...' : t(lang, 'signIn')}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
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
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investor@example.com"
                className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                Phone Number (Required for P2P & Account Activation)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#7C8698] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-phone"
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+8801700000000"
                  className="w-full min-h-[44px] rounded-xl border border-[#242E3F] bg-[#090C11] pl-10 pr-3.5 font-mono text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
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
              <span>{loading ? 'Creating Account...' : t(lang, 'register')}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
