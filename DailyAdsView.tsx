import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, Play, ShieldAlert } from 'lucide-react';
import { t } from '../i18n/translations';
import type { ActiveTab, DailyAdItem, SupportedLanguage, UserProfile } from '../types/platform';
import { formatUsd, sanitizeExternalUrl } from '../utils/investment';

interface DailyAdsViewProps {
  ads: DailyAdItem[];
  user: UserProfile | null;
  lang: SupportedLanguage;
  onClaimAd: (adId: string) => Promise<void>;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onNavigate: (tab: ActiveTab) => void;
}

export function DailyAdsView({
  ads,
  user,
  lang,
  onClaimAd,
  onOpenAuth,
  onNavigate,
}: DailyAdsViewProps) {
  const [watchingAdId, setWatchingAdId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!watchingAdId || secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [watchingAdId, secondsLeft]);

  function startWatch(ad: DailyAdItem) {
    if (!user) {
      onOpenAuth('register');
      return;
    }
    if (user.activationStatus !== 'Activated' && user.role !== 'admin') {
      setFeedback({
        type: 'error',
        text: t(lang, 'activationRequiredDesc'),
      });
      return;
    }
    setFeedback(null);
    setWatchingAdId(ad.id);
    setSecondsLeft(Math.max(3, ad.durationSeconds || 5));
  }

  async function finishAndClaim(adId: string) {
    setClaimingId(adId);
    setFeedback(null);
    try {
      await onClaimAd(adId);
      setWatchingAdId(null);
      setSecondsLeft(0);
      setFeedback({
        type: 'success',
        text: 'Daily ad viewing reward credited to your balance.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to claim ad reward.',
      });
    } finally {
      setClaimingId(null);
    }
  }

  const needsActivation = Boolean(user && user.role !== 'admin' && user.activationStatus !== 'Activated');

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F3EFE6]">{t(lang, 'dailyAdsTitle')}</h1>
          <p className="text-sm text-[#9AA4B5] mt-1">{t(lang, 'dailyAdsSubtitle')}</p>
        </div>
        {user && (
          <div className="text-xs text-[#E5C158] font-mono tabular-nums whitespace-nowrap">
            {t(lang, 'availableBalance')}: {formatUsd(user.balanceUsd)}
          </div>
        )}
      </div>

      {needsActivation && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#F3EFE6]">
                {user?.activationStatus === 'Pending'
                  ? t(lang, 'activationPendingTitle')
                  : t(lang, 'activationRequiredTitle')}
              </p>
              <p className="text-xs text-[#D8DEE9] mt-1">
                {user?.activationStatus === 'Pending'
                  ? t(lang, 'activationPendingDesc')
                  : t(lang, 'activationRequiredDesc')}
              </p>
            </div>
          </div>
          {user?.activationStatus !== 'Pending' && (
            <button
              type="button"
              onClick={() => onNavigate('deposit')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(lang, 'activateNowBtn')}
            </button>
          )}
        </div>
      )}

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

      {ads.length === 0 ? (
        <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-8 text-center text-sm text-[#9AA4B5]">
          {t(lang, 'noActiveAds')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ads.map((ad) => {
            const isWatching = watchingAdId === ad.id;
            const readyToClaim = isWatching && secondsLeft <= 0;
            const safeUrl = sanitizeExternalUrl(ad.targetUrl);
            const canOpenExternalLink = Boolean(
              user &&
                (user.activationStatus === 'Activated' || user.role === 'admin') &&
                safeUrl !== '#'
            );

            return (
              <article
                key={ad.id}
                data-testid={`daily-ad-card-${ad.id}`}
                className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5 flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[#9AA4B5]">
                    <span className="font-mono text-[#E5C158] font-semibold">
                      +{formatUsd(ad.rewardUsd)}
                    </span>
                    <span>{ad.durationSeconds}s view</span>
                  </div>
                  <h2 className="text-base font-semibold text-[#F3EFE6]">{ad.title}</h2>
                  <p className="text-xs text-[#A6AEBD] leading-relaxed">{ad.description}</p>
                  {safeUrl !== '#' && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (canOpenExternalLink && !ad.claimedToday && !isWatching) {
                          startWatch(ad);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-[#D4AF37] hover:underline pt-1 break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[230px]">{safeUrl}</span>
                    </a>
                  )}
                </div>

                {ad.claimedToday ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-[44px] rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t(lang, 'claimedToday')}</span>
                  </button>
                ) : readyToClaim ? (
                  <button
                    type="button"
                    disabled={claimingId === ad.id}
                    onClick={() => finishAndClaim(ad.id)}
                    className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#090C11] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {claimingId === ad.id ? 'Crediting...' : `Claim +${formatUsd(ad.rewardUsd)}`}
                    </span>
                  </button>
                ) : isWatching ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-[44px] rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#E5C158] text-xs font-mono tabular-nums font-semibold flex items-center justify-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    <span>
                      {t(lang, 'watchingWait')} ({secondsLeft}s)
                    </span>
                  </button>
                ) : canOpenExternalLink ? (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => startWatch(ad)}
                    className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>{t(lang, 'watchAndEarn')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => startWatch(ad)}
                    className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#090C11] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>{t(lang, 'watchAndEarn')}</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
