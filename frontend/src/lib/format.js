// Indian formatting helpers
export function inr(n, opts = {}) {
  const v = Number(n || 0);
  const formatted = v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (opts.noSymbol ? "" : "₹") + formatted;
}

export function inrShort(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// Local calendar date (YYYY-MM-DD). toISOString() is UTC, which in India returns
// yesterday's date between midnight and 5:30 AM.
function localYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO() {
  return localYMD(new Date());
}

export function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localYMD(d);
}
