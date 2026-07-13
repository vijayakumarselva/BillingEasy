// Centralized API client with auth + active org + refresh-token retry
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("be_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  const orgId = localStorage.getItem("be_org_id");
  if (orgId) {
    config.headers["X-Org-Id"] = orgId;
    const bizType = localStorage.getItem(`biz_mode_${orgId}`);
    if (bizType) config.headers["X-Biz-Type"] = bizType;
  }
  return config;
});

let refreshing = null;
async function tryRefresh() {
  if (refreshing) return refreshing;
  const refresh = localStorage.getItem("be_refresh");
  if (!refresh) return null;
  refreshing = axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refresh })
    .then(r => { localStorage.setItem("be_token", r.data.token); return r.data.token; })
    .catch(() => null)
    .finally(() => { refreshing = null; });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status;
    const original = err.config || {};
    if (status === 401 && !original._retried && !(original.url || "").includes("/auth/")) {
      original._retried = true;
      const newTok = await tryRefresh();
      if (newTok) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newTok}`;
        return api.request(original);
      }
      localStorage.removeItem("be_token");
      localStorage.removeItem("be_refresh");
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    }
    if (status === 402 && !window.location.pathname.startsWith("/billing")) {
      window.location.href = "/billing";
    }
    return Promise.reject(err);
  }
);

export default api;

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
