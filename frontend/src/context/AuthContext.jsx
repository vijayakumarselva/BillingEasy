import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgIdState] = useState(() => localStorage.getItem("be_org_id") || null);
  const [loading, setLoading] = useState(true);

  const setOrgId = useCallback((id) => {
    if (id) localStorage.setItem("be_org_id", id); else localStorage.removeItem("be_org_id");
    setOrgIdState(id);
  }, []);

  const loadOrgs = useCallback(async () => {
    const { data } = await api.get("/orgs");
    setOrgs(data);
    if (data.length) {
      const stored = localStorage.getItem("be_org_id");
      const valid = data.find(o => o.id === stored);
      const next = (valid || data[0]).id;
      if (next !== stored) setOrgId(next); else setOrgIdState(next);
    } else {
      setOrgId(null);
    }
    return data;
  }, [setOrgId]);

  useEffect(() => {
    const t = localStorage.getItem("be_token");
    if (!t) { setLoading(false); return; }
    (async () => {
      try {
        const me = await api.get("/auth/me");
        setUser(me.data);
        await loadOrgs();
      } catch {
        localStorage.removeItem("be_token");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadOrgs]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("be_token", data.token);
    if (data.refresh_token) localStorage.setItem("be_refresh", data.refresh_token);
    setUser({ id: data.id, email: data.email, name: data.name });
    if (data.org_id) setOrgId(data.org_id);
    await loadOrgs();
    return data;
  };
  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("be_token", data.token);
    if (data.refresh_token) localStorage.setItem("be_refresh", data.refresh_token);
    setUser({ id: data.id, email: data.email, name: data.name });
    if (data.org_id) setOrgId(data.org_id);
    await loadOrgs();
    return data;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("be_token");
    localStorage.removeItem("be_refresh");
    localStorage.removeItem("be_org_id");
    setUser(null); setOrgs([]); setOrgIdState(null);
  };
  const switchOrg = (id) => setOrgId(id);

  const currentOrg = orgs.find(o => o.id === orgId);
  const currentRole = currentOrg?.role;
  // allowed_modes: empty = unrestricted (owner/accountant); non-empty = locked to those modes
  const allowedModes = currentOrg?.allowed_modes || [];
  // The server is the authority on permissions; this only decides what to draw.
  // The owner carries "*", so every check passes without listing them all.
  const permissions = currentOrg?.permissions || [];
  const can = (perm) =>
    !perm || permissions.includes("*") || permissions.includes(perm) || currentRole === "owner";
  // Where this role belongs when it signs in — a kitchen login opens on the
  // kitchen, not on a dashboard full of invoices it cannot read.
  const home = currentOrg?.home || "/dashboard";

  return (
    <AuthCtx.Provider value={{
      user, loading, login, register, logout,
      orgs, orgId, currentOrg, currentRole, allowedModes, permissions, can, home,
      switchOrg, refreshOrgs: loadOrgs, setUser,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
