// A figure worth looking at.
//
// The old cards were a pastel block, an icon in a coloured square, and a
// number. Six of them side by side, each a different colour, none of them
// saying whether the number was good. Colour was doing decoration; nothing
// was doing information.
//
// This one follows the stat-tile contract: a label, the value, an optional
// comparison against a named period, and an optional sparkline. Surfaces stay
// neutral so the eye goes to the numbers; colour is reserved for direction
// and status, where it means something.
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/** Compact Indian-format money: ₹12.9L, ₹4.2Cr — full precision on hover. */
export function compactInr(n) {
  const v = Math.abs(Number(n) || 0);
  const sign = (Number(n) || 0) < 0 ? "-" : "";
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 2)}Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 2)}L`;
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return `${sign}₹${v.toFixed(0)}`;
}

const fullInr = (n) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A 12-point sparkline. No axes, no labels — shape only.
 *
 *  Deliberately one hue whatever the direction. Green-against-red fails
 *  colour-vision separation badly (ΔE 5.8 deuteranopia, well under the floor),
 *  and direction is already carried by the arrow and the signed percentage
 *  below. The line's job here is shape, not polarity. */
function Sparkline({ points = [] }) {
  const vals = points.filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  const w = 96, h = 28;
  const step = w / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const last = vals[vals.length - 1];
  const lastY = h - ((last - min) / span) * h;
  const stroke = "var(--spark)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible shrink-0"
         aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      {/* the current period, ringed in the surface colour so it stays legible */}
      <circle cx={w} cy={lastY} r="4" fill={stroke} stroke="var(--tile-surface)" strokeWidth="2" />
    </svg>
  );
}

/**
 * @param label      what the figure is — sentence case, no colon
 * @param value      the number itself
 * @param period     the window it covers ("This month", "Outstanding")
 * @param previous   the same figure last period, for the comparison
 * @param prevLabel  what to call that period ("Sep")
 * @param upIsGood   whether a rise is good news — false for payables, expenses
 * @param series     points for the sparkline
 * @param tone       "default" | "good" | "warn" | "danger" — status, used sparingly
 */
export default function StatTile({
  label, value, period, previous, prevLabel = "last month",
  upIsGood = true, series, tone = "default", icon: Icon, onClick, loading,
}) {
  const hasPrev = Number.isFinite(previous) && previous !== 0;
  const delta = hasPrev ? ((value - previous) / Math.abs(previous)) * 100 : null;
  const rose = delta !== null && delta > 0.5;
  const fell = delta !== null && delta < -0.5;
  const good = rose ? upIsGood : fell ? !upIsGood : null;

  const toneRing = {
    default: "border-border",
    good: "border-emerald-500/30",
    warn: "border-amber-500/40",
    danger: "border-rose-500/40",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={Number.isFinite(value) ? fullInr(value) : undefined}
      className={`group text-left w-full rounded-xl border ${toneRing} bg-card
                  px-4 py-3.5 transition-shadow hover:shadow-md
                  disabled:cursor-default focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-blue-500/40`}
      style={{ "--tile-surface": "var(--card-surface, #fff)" }}
      data-testid={`tile-${String(label).toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground truncate">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
      </div>

      {loading ? (
        <div className="h-8 w-24 mt-2 rounded bg-muted animate-pulse" />
      ) : (
        <div className="mt-1.5 flex items-end justify-between gap-3">
          {/* Proportional figures: a big number with tabular-nums reads loose. */}
          <span className="text-[26px] leading-none font-semibold tracking-tight text-foreground">
            {compactInr(value)}
          </span>
          {series?.length > 1 && <Sparkline points={series} />}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-xs min-h-[18px]">
        {delta !== null ? (
          <>
            <span className={`inline-flex items-center gap-0.5 font-semibold ${
              good === null ? "text-muted-foreground"
              : good ? "text-emerald-600 dark:text-emerald-400"
                     : "text-rose-600 dark:text-rose-400"}`}>
              {rose ? <TrendingUp className="h-3.5 w-3.5" />
                    : fell ? <TrendingDown className="h-3.5 w-3.5" />
                           : <Minus className="h-3.5 w-3.5" />}
              {Math.abs(delta) >= 1000 ? ">999" : Math.abs(delta).toFixed(0)}%
            </span>
            <span className="text-muted-foreground truncate">vs {prevLabel}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{period}</span>
        )}
      </div>
    </button>
  );
}
