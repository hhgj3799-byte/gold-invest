import { useState, type FormEvent } from 'react';
import { ExternalLink, Mail, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { t } from '../i18n/translations';
import type { DirectMessage, PlatformSettings, SupportedLanguage, UserProfile } from '../types/platform';
import { sanitizeExternalUrl } from '../utils/investment';

interface MessagesSupportViewProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  messages: DirectMessage[];
  lang: SupportedLanguage;
  onSendMessage: (payload: { subject: string; body: string }) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export function MessagesSupportView({
  settings,
  user,
  messages,
  lang,
  onSendMessage,
  onOpenAuth,
}: MessagesSupportViewProps) {
  const [subject, setSubject] = useState('Account & Payment Support');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const safeTelegram = sanitizeExternalUrl(settings.telegramUrl);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      onOpenAuth('login');
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      await onSendMessage({ subject: subject.trim(), body: body.trim() });
      setBody('');
      setFeedback({ type: 'success', text: 'Your message has been delivered directly to the Admin desk.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send message.',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5">
        <h1 className="text-2xl font-bold text-[#F3EFE6]">{t(lang, 'supportTitle')}</h1>
        <p className="text-sm text-[#9AA4B5] mt-1">{t(lang, 'supportSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Direct Message Inbox & Composer */}
        <section className="lg:col-span-7 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-[#1E2736] pb-3">
            <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-base font-semibold text-[#F3EFE6]">{t(lang, 'sendMessage')}</h2>
          </div>

          {!user ? (
            <div className="py-6 text-center space-y-3">
              <ShieldCheck className="w-9 h-9 text-[#D4AF37] mx-auto" />
              <p className="text-sm text-[#B8C0CE]">
                Sign in or register to message the administration team directly.
              </p>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
              >
                {t(lang, 'signInRegister')}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <p className="text-xs text-[#9AA4B5] py-4 text-center">
                    No direct messages yet. Send a message below and an admin will reply here.
                  </p>
                ) : (
                  messages.map((msg) => {
                    const fromAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-3.5 text-xs space-y-1 ${
                          fromAdmin
                            ? 'border-[#D4AF37]/40 bg-[#D4AF37]/10'
                            : 'border-[#222B3A] bg-[#0B0F17]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className={fromAdmin ? 'font-semibold text-[#E5C158]' : 'font-semibold text-[#F3EFE6]'}>
                            {fromAdmin ? 'Administrator' : user.fullName} · {msg.subject}
                          </span>
                          <span className="text-[#8D97A8]">
                            {new Date(msg.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[#D8DEE9] leading-relaxed">{msg.body}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {feedback && (
                <div
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    feedback.type === 'error'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5 pt-2 border-t border-[#1E2736]">
                <div>
                  <label htmlFor="msg-subject" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                    Subject
                  </label>
                  <input
                    id="msg-subject"
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[#242E3F] bg-[#090C11] px-3.5 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label htmlFor="msg-body" className="block text-xs font-medium text-[#B8C0CE] mb-1.5">
                    Message
                  </label>
                  <textarea
                    id="msg-body"
                    rows={3}
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Ask about account activation, deposits, or VIP plans..."
                    className="w-full rounded-xl border border-[#242E3F] bg-[#090C11] p-3.5 text-sm text-[#F3EFE6] placeholder-[#616B7D] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{sending ? 'Sending...' : t(lang, 'sendMessage')}</span>
                </button>
              </form>
            </>
          )}
        </section>

        {/* Right: Official Telegram Group & Support Email */}
        <section className="lg:col-span-5 rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#F3EFE6]">Community & Desk Channels</h2>
          <p className="text-xs text-[#A6AEBD] leading-relaxed">
            Join our official Telegram group for real-time announcements, P2P verification updates, and surplus trading bonus notices.
          </p>
          <div className="space-y-3 pt-1">
            <a
              href={safeTelegram}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[46px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t(lang, 'joinTelegram')}</span>
            </a>
            <a
              href={`mailto:${settings.supportEmail}`}
              className="w-full min-h-[44px] px-4 rounded-xl border border-[#2D384B] hover:border-[#D4AF37] text-xs font-medium text-[#F3EFE6] flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4 text-[#D4AF37]" />
              <span>{settings.supportEmail}</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
