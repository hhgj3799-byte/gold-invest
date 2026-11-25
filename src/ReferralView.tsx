import { useState } from 'react';
import { Check, Copy, Share2, ShieldCheck, Users } from 'lucide-react';
import type { PlatformSettings, ReferralSummary, UserProfile } from '../types/platform';
import { formatUsd } from '../utils/investment';

interface ReferralViewProps {
  settings: PlatformSettings;
  user: UserProfile | null;
  referralSummary: ReferralSummary | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export function ReferralView({
  settings,
  user,
  referralSummary,
  onOpenAuth,
}: ReferralViewProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!user || !referralSummary) {
    return (
      <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-8 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-[#D4AF37] mx-auto" />
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-[#F3EFE6]">
            {settings.referralCommissionPct}% Partner Referral Program
          </h1>
          <p className="text-sm text-[#9AA4B5]">
            Create or sign in to your verified Gmail account to unlock your personal referral link and earn{' '}
            {settings.referralCommissionPct}% commission on approved deposits.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenAuth('register')}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#D4AF37] text-[#090C11] text-sm font-semibold cursor-pointer"
        >
          Get My Referral Code
        </button>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(referralSummary.referralCode)}`;

  async function copyText(text: string, which: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      // Clipboard fallback omitted intentionally
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1E2736] pb-5">
        <h1 className="text-2xl font-bold text-[#F3EFE6]">
          Referral Program ({referralSummary.commissionPct}% Commission)
        </h1>
        <p className="text-sm text-[#9AA4B5] mt-1">
          Earn {referralSummary.commissionPct}% instant balance commission whenever your invited members receive deposit approval.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5">
          <p className="text-xs text-[#9AA4B5]">Commission Rate</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#E5C158] mt-1">
            {referralSummary.commissionPct}%
          </p>
        </div>
        <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5">
          <p className="text-xs text-[#9AA4B5]">Invited Partners</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#F3EFE6] mt-1">
            {referralSummary.totalReferrals}
          </p>
        </div>
        <div className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-5">
          <p className="text-xs text-[#9AA4B5]">Total Referral Earnings</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1">
            {formatUsd(referralSummary.totalCommissionUsd)}
          </p>
        </div>
      </div>

      {/* Share Controls */}
      <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] p-6 space-y-5">
        <h2 className="text-base font-semibold text-[#F3EFE6]">Your Referral Credentials</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 space-y-2.5">
            <p className="text-xs text-[#9AA4B5]">Referral Code</p>
            <div className="flex items-center justify-between gap-3">
              <span
                data-testid="my-referral-code"
                className="font-mono text-lg font-bold tracking-wider text-[#E5C158]"
              >
                {referralSummary.referralCode}
              </span>
              <button
                type="button"
                onClick={() => copyText(referralSummary.referralCode, 'code')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-[#344157] hover:border-[#D4AF37] text-xs font-medium text-[#F3EFE6] inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#1E2736] bg-[#0B0F17] p-4 space-y-2.5">
            <p className="text-xs text-[#9AA4B5]">Direct Invite Link</p>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-[#D8DEE9] truncate">{shareUrl}</span>
              <button
                type="button"
                onClick={() => copyText(shareUrl, 'link')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] text-xs font-semibold text-[#090C11] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Team Table */}
      <section className="rounded-2xl border border-[#232D3E] bg-[#10151E] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2736] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-base font-semibold text-[#F3EFE6]">Referred Members</h2>
          </div>
          <span className="text-xs text-[#9AA4B5]">{referralSummary.referredUsers.length} members</span>
        </div>

        {referralSummary.referredUsers.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#9AA4B5]">
            No referred members yet. Share your code above to start earning {referralSummary.commissionPct}% commissions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F17] text-[#8D97A8] border-b border-[#1E2736]">
                <tr>
                  <th className="px-5 py-3 font-medium">Partner</th>
                  <th className="px-5 py-3 font-medium">Gmail</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Invested Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B2331]">
                {referralSummary.referredUsers.map((member) => (
                  <tr key={member.id} className="hover:bg-[#141A25]">
                    <td className="px-5 py-3.5 text-[#F3EFE6] font-medium">{member.fullName}</td>
                    <td className="px-5 py-3.5 font-mono text-[#A6AEBD]">{member.maskedEmail}</td>
                    <td className="px-5 py-3.5">
                      <span className={member.isVerified ? 'text-emerald-300' : 'text-amber-300'}>
                        {member.isVerified ? 'OTP Verified' : 'Pending OTP'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#E5C158] font-semibold">
                      {formatUsd(member.totalInvestedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
