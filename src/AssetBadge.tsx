import type { SupportedAsset } from '../types/platform';

export const ASSET_META: Record<
  SupportedAsset,
  {
    symbol: string;
    label: string;
    market: string;
    accentClass: string;
  }
> = {
  Gold: {
    symbol: 'XAU',
    label: 'Gold',
    market: 'Precious Metals',
    accentClass: 'text-[#E5C158] border-[#D4AF37]/40 bg-[#D4AF37]/10',
  },
  USD: {
    symbol: 'USD',
    label: 'USD',
    market: 'Reserve Currency',
    accentClass: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  },
  Apple: {
    symbol: 'AAPL',
    label: 'Apple',
    market: 'US Equity',
    accentClass: 'text-slate-200 border-slate-500/30 bg-slate-500/10',
  },
  Meta: {
    symbol: 'META',
    label: 'Meta',
    market: 'US Equity',
    accentClass: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  },
  Tesla: {
    symbol: 'TSLA',
    label: 'Tesla',
    market: 'US Equity',
    accentClass: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  },
};

export function AssetSelector({
  assets,
  selected,
  onSelect,
}: {
  assets: SupportedAsset[];
  selected: SupportedAsset;
  onSelect: (asset: SupportedAsset) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select target trading asset">
      {assets.map((asset) => {
        const meta = ASSET_META[asset] ?? ASSET_META.Gold;
        const active = selected === asset;
        return (
          <button
            key={asset}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(asset)}
            className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              active
                ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F7E7B4]'
                : 'border-[#242E3F] bg-[#0D1118] text-[#9AA4B5] hover:border-[#3A465C] hover:text-[#F3EFE6]'
            }`}
          >
            <span>{meta.label}</span>
            <span className="ml-1.5 font-mono text-[11px] opacity-75">{meta.symbol}</span>
          </button>
        );
      })}
    </div>
  );
}
