// Two things a web page can get away with and an app cannot: forgetting you
// were signed in, and showing nothing when the train goes into a tunnel.
//
// 1. WKWebView may evict localStorage under storage pressure, which on a web
//    page means a re-login and in an app means "it logged me out again".
//    Session keys are mirrored into Preferences, which iOS keeps, and restored
//    before React renders.
// 2. The last good answer to a GET is kept, and served when the network is not
//    there — with a flag so the page can say the figures are from earlier.
import { isCapacitor } from "@/lib/mobile";

const SESSION_KEYS = ["be_token", "be_refresh", "be_org_id", "be_user"];
const CACHE_PREFIX = "be_cache:";
const CACHE_MAX = 60;                 // newest N responses, oldest dropped

let Prefs = null;
async function prefs() {
  if (!isCapacitor) return null;
  if (!Prefs) ({ Preferences: Prefs } = await import("@capacitor/preferences"));
  return Prefs;
}

/** Put the session back before anything reads localStorage. */
export async function restoreSession() {
  const p = await prefs();
  if (!p) return;
  for (const key of SESSION_KEYS) {
    if (localStorage.getItem(key)) continue;        // the webview still has it
    const { value } = await p.get({ key });
    if (value) localStorage.setItem(key, value);
  }
}

/** Keep the durable copy in step with localStorage. */
export async function rememberSession() {
  const p = await prefs();
  if (!p) return;
  for (const key of SESSION_KEYS) {
    const value = localStorage.getItem(key);
    if (value) await p.set({ key, value });
    else await p.remove({ key });
  }
}

export async function forgetSession() {
  const p = await prefs();
  if (!p) return;
  for (const key of SESSION_KEYS) await p.remove({ key });
}

const cacheKey = (url, orgId) => `${CACHE_PREFIX}${orgId || "-"}:${url}`;

export function cacheResponse(url, orgId, data) {
  if (!isCapacitor) return;
  try {
    localStorage.setItem(cacheKey(url, orgId),
      JSON.stringify({ at: Date.now(), data }));
    trim();
  } catch { /* out of room: the cache is a convenience, not a promise */ }
}

export function cachedResponse(url, orgId) {
  if (!isCapacitor) return null;
  try {
    const raw = localStorage.getItem(cacheKey(url, orgId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function trim() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length <= CACHE_MAX) return;
  const aged = keys
    .map((k) => {
      try { return [k, JSON.parse(localStorage.getItem(k)).at || 0]; }
      catch { return [k, 0]; }
    })
    .sort((a, b) => a[1] - b[1]);
  for (const [k] of aged.slice(0, keys.length - CACHE_MAX)) localStorage.removeItem(k);
}

export function clearCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
