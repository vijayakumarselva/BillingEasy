import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  LayoutDashboard, Users, Package, FileText, ShoppingCart, Wallet,
  Receipt, BookOpen, Landmark, Settings, LogOut, Moon, Sun, Building2,
  FileBarChart, ChevronDown, Plus, Bot, Wrench, FileSpreadsheet, Coins, Zap,
  UtensilsCrossed, Scan, SlidersHorizontal, Sparkles, Menu, X, ChevronRight,
} from "lucide-react";
import { STATES } from "@/pages/Parties";

// All nav items with a `modes` array — which business modes show this item by default
// Items not in the current mode go under "More"
const ALL_NAV = [
  // Masters
  { to: "/parties",  label: "Parties",           icon: Users,           tid: "nav-parties",   shortcut: "Alt+P", group: "Masters",      modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/products", label: "Products & Stock",   icon: Package,         tid: "nav-products",  shortcut: "Alt+I", group: "Masters",      modes: ["b2b","b2c","restaurant","pos"] },
  // Transactions
  { to: "/sales",      label: "Sales / Invoices", icon: FileText,        tid: "nav-sales",     shortcut: "Alt+S", group: "Transactions", modes: ["b2b","b2c"] },
  { to: "/purchases",  label: "Purchases",         icon: ShoppingCart,   tid: "nav-purchases", shortcut: "Alt+B", group: "Transactions", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/payments",   label: "Payments",          icon: Wallet,         tid: "nav-payments",  shortcut: "Alt+M", group: "Transactions", modes: ["b2b","b2c"] },
  { to: "/expenses",   label: "Expenses",          icon: Receipt,        tid: "nav-expenses",  shortcut: "Alt+E", group: "Transactions", modes: ["b2b","b2c","restaurant"] },
  // Modules
  { to: "/pos",              label: "Retail POS",          icon: Scan,             tid: "nav-pos",           badge: "New", group: "Modules", modes: ["pos","b2c"] },
  { to: "/pos/admin",        label: "POS Settings",        icon: SlidersHorizontal,tid: "nav-pos-admin",                   group: "Modules", modes: ["pos"] },
  { to: "/restaurant",       label: "Restaurant",          icon: UtensilsCrossed,  tid: "nav-restaurant",    badge: "New", group: "Modules", modes: ["restaurant"] },
  { to: "/restaurant/admin", label: "Restaurant Settings", icon: SlidersHorizontal,tid: "nav-restaurant-admin",            group: "Modules", modes: ["restaurant"] },
  // Accounting
  { to: "/bank-statement", label: "Bank Statement",  icon: FileSpreadsheet, tid: "nav-bank-statement", group: "Accounting", modes: ["b2b","b2c"] },
  { to: "/gst",            label: "GST Returns",     icon: FileBarChart,    tid: "nav-gst",  shortcut: "Alt+G", group: "Accounting", modes: ["b2b","b2c"] },
  { to: "/tds",            label: "TDS",             icon: Landmark,        tid: "nav-tds",               group: "Accounting", modes: ["b2b"] },
  { to: "/reports",        label: "Reports & Books", icon: BookOpen,        tid: "nav-accounting", shortcut: "Alt+R", group: "Accounting", modes: ["b2b","b2c","restaurant"] },
  // Tools & AI
  { to: "/ask-ai", label: "Ask AI",    icon: Bot,    tid: "nav-ai",    badge: "AI",   group: "Tools & AI", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/tools",  label: "GST Tools", icon: Wrench, tid: "nav-tools", badge: "Free", group: "Tools & AI", modes: ["b2b","b2c"] },
  // Account
  { to: "/wallet",   label: "Wallet & Credits", icon: Coins,    tid: "nav-wallet",  group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/credits",  label: "Buy Credits",      icon: Zap,      tid: "nav-credits", badge: "New", group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/settings", label: "Settings",         icon: Settings, tid: "nav-settings", shortcut: "Alt+,", group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
];

const BUSINESS_MODES = [
  { value: "b2b",        label: "B2B Billing",  emoji: "🏢", desc: "GST invoices, purchases, ledgers" },
  { value: "b2c",        label: "B2C Retail",   emoji: "🛒", desc: "Sales, POS, retail billing" },
  { value: "restaurant", label: "Restaurant",   emoji: "🍽️", desc: "Table orders, KOT, menus" },
  { value: "pos",        label: "POS / Counter", emoji: "🖥️", desc: "Retail counter & quick billing" },
];

const FKEYS = [
  { key: "F2", label: "Date" },
  { key: "F4", label: "Contra" },
  { key: "F5", label: "Payment" },
  { key: "F6", label: "Receipt" },
  { key: "F8", label: "Sales" },
  { key: "F9", label: "Purchase" },
  { key: "Alt+G", label: "GST" },
  { key: "Alt+R", label: "Reports" },
  { key: "Ctrl+N", label: "New" },
  { key: "Esc", label: "Back" },
];

export default function AppLayout() {
  const { user, logout, orgs, orgId, currentOrg, switchOrg, refreshOrgs } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [businessMode, setBusinessMode] = useState(() => localStorage.getItem(`biz_mode_${orgId}`) || "");
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (orgId) api.get("/wallet").then(r => setWallet(r.data)).catch(() => {});
  }, [orgId, loc.pathname]);

  // Load business mode from backend org settings when org changes
  useEffect(() => {
    const stored = localStorage.getItem(`biz_mode_${orgId}`);
    if (stored) { setBusinessMode(stored); return; }
    if (orgId) {
      api.get("/business").then(r => {
        const mode = r.data?.business_mode || "";
        if (mode) { setBusinessMode(mode); localStorage.setItem(`biz_mode_${orgId}`, mode); }
        else setShowModeSelect(true);
      }).catch(() => {});
    }
  }, [orgId]);

  const chooseMode = async (mode) => {
    setBusinessMode(mode);
    localStorage.setItem(`biz_mode_${orgId}`, mode);
    setShowModeSelect(false);
    try {
      const { data: biz } = await api.get("/business");
      await api.put("/business", { ...biz, business_mode: mode });
    } catch {}
  };

  // Split nav into primary (matches mode) and secondary (more)
  const effectiveMode = businessMode || "b2b";
  const primaryNav = ALL_NAV.filter(n => n.modes.includes(effectiveMode));
  const moreNav = ALL_NAV.filter(n => !n.modes.includes(effectiveMode));

  // Group primary nav by group label
  const groupedPrimary = primaryNav.reduce((acc, n) => {
    if (!acc[n.group]) acc[n.group] = [];
    acc[n.group].push(n);
    return acc;
  }, {});

  // Keyboard shortcut navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.altKey && e.key === "s") { e.preventDefault(); nav("/sales"); }
      if (e.altKey && e.key === "b") { e.preventDefault(); nav("/purchases"); }
      if (e.altKey && e.key === "p") { e.preventDefault(); nav("/parties"); }
      if (e.altKey && e.key === "i") { e.preventDefault(); nav("/products"); }
      if (e.altKey && e.key === "g") { e.preventDefault(); nav("/gst"); }
      if (e.altKey && e.key === "r") { e.preventDefault(); nav("/reports"); }
      if (e.altKey && e.key === "m") { e.preventDefault(); nav("/payments"); }
      if (e.altKey && e.key === "e") { e.preventDefault(); nav("/expenses"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav]);

  const handleLogout = async () => { await logout(); nav("/login"); };

  const currentPageLabel = ALL_NAV.find(n => loc.pathname === n.to)?.label || "Dashboard";

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top titlebar (Tally-style green bar) ── */}
      <header className="flex items-center justify-between px-3 py-0 h-9 shrink-0"
        style={{ background: "hsl(var(--tally-green-dark))", color: "white" }}>
        {/* Left: logo + company */}
        <div className="flex items-center gap-3">
          <button className="md:hidden p-1" onClick={() => setSidebarOpen(v => !v)}>
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 opacity-70" />
            <span className="text-xs font-bold tracking-wide uppercase opacity-90" style={{ fontFamily: "Inter, sans-serif" }}>
              Billings<span style={{ color: "hsl(158 80% 70%)" }}>Easy</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-[11px] opacity-75">
            <ChevronRight className="h-3 w-3" />
            <span>{currentOrg?.name || "—"}</span>
          </div>
        </div>

        {/* Center: current page name */}
        <div className="hidden md:block text-xs font-semibold tracking-widest uppercase opacity-60">
          {currentPageLabel}
        </div>

        {/* Right: company switcher + credits + theme */}
        <div className="flex items-center gap-2">
          {wallet && (
            <button onClick={() => nav("/wallet")}
              className="hidden md:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
              style={{ background: "hsl(158 50% 20%)", color: "hsl(158 70% 80%)" }}>
              <Coins className="h-3 w-3" />
              <span className="font-mono font-semibold">{wallet.balance}</span>
              <span className="opacity-70">cr</span>
            </button>
          )}
          {/* Org switcher */}
          <div className="relative">
            <button onClick={() => setOrgOpen(v => !v)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded opacity-80 hover:opacity-100"
              style={{ background: "hsl(158 50% 20%)" }}
              data-testid="org-switcher">
              <span className="max-w-[100px] truncate">{currentOrg?.name || "Switch Org"}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {orgOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded border shadow-lg z-50 text-foreground bg-card border-border"
                onMouseLeave={() => setOrgOpen(false)}>
                {orgs.map(o => (
                  <button key={o.id} onClick={() => { switchOrg(o.id); setOrgOpen(false); window.location.reload(); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center justify-between"
                    data-testid={`org-option-${o.name}`}>
                    <span className="truncate">{o.name}</span>
                    {o.id === orgId && <span className="text-[10px] text-primary font-bold ml-2">●</span>}
                  </button>
                ))}
                <div className="border-t border-border">
                  <button onClick={() => { setOrgOpen(false); setShowCreateOrg(true); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-1.5 text-primary font-medium"
                    data-testid="create-org-button">
                    <Plus className="h-3 w-3" /> New Organization
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={toggle} className="p-1 opacity-70 hover:opacity-100" data-testid="theme-toggle" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-1 text-[11px] opacity-70 hover:opacity-100 px-1.5 py-0.5"
            data-testid="logout-button">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`sidebar-shell shrink-0 flex flex-col overflow-y-auto overflow-x-hidden transition-all duration-200
            ${sidebarOpen ? "w-52 fixed inset-y-9 left-0 z-40" : "hidden"} md:flex md:static md:w-48`}
          data-testid="app-sidebar">

          {/* User info strip + business mode */}
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
            <div className="text-[11px] font-bold truncate" style={{ color: "hsl(var(--sidebar-fg))" }}>
              {user?.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="text-[10px] opacity-50 uppercase tracking-wider flex-1">{currentOrg?.role || "member"}</div>
              {businessMode && (
                <button onClick={() => setShowModeSelect(true)}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  title="Change business mode">
                  {BUSINESS_MODES.find(m => m.value === businessMode)?.emoji} {BUSINESS_MODES.find(m => m.value === businessMode)?.label}
                </button>
              )}
            </div>
          </div>

          {/* Dashboard shortcut */}
          <div className="px-2 pt-2">
            <NavLink to="/dashboard" data-testid="nav-dashboard"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              <span>Dashboard</span>
            </NavLink>
          </div>

          {/* Grouped primary nav (mode-filtered) */}
          <nav className="flex-1 px-2 pb-2 overflow-y-auto">
            {Object.entries(groupedPrimary).map(([groupLabel, items]) => (
              <div key={groupLabel}>
                <div className="sidebar-section-label">{groupLabel}</div>
                {items.map((n) => (
                  <NavLink key={n.to} to={n.to} data-testid={n.tid} title={n.shortcut || n.label}
                    className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                    <n.icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span className="truncate flex-1">{n.label}</span>
                    {n.badge && (
                      <span className={`text-[9px] px-1 py-0.5 rounded font-bold tracking-wider ${
                        n.badge === "AI" ? "bg-violet-500 text-white" :
                        n.badge === "New" ? "bg-emerald-600 text-white" :
                        "bg-slate-500 text-white"
                      }`}>{n.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}

            {/* "More" collapsible for non-primary nav items */}
            {moreNav.length > 0 && (
              <div>
                <button onClick={() => setMoreOpen(v => !v)}
                  className="sidebar-link w-full text-left opacity-60 hover:opacity-100 mt-1">
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                  <span className="flex-1">More</span>
                  <span className="text-[9px] opacity-60">{moreNav.length}</span>
                </button>
                {moreOpen && (
                  <div className="ml-2 border-l pl-2" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
                    {moreNav.map((n) => (
                      <NavLink key={n.to} to={n.to} data-testid={n.tid} title={n.label}
                        className={({ isActive }) => `sidebar-link text-[11px] ${isActive ? "active" : ""}`}>
                        <n.icon className="h-3 w-3 shrink-0 opacity-60" />
                        <span className="truncate flex-1">{n.label}</span>
                        {n.badge && (
                          <span className={`text-[9px] px-1 py-0.5 rounded font-bold tracking-wider ${
                            n.badge === "AI" ? "bg-violet-500 text-white" :
                            n.badge === "New" ? "bg-emerald-600 text-white" :
                            "bg-slate-500 text-white"
                          }`}>{n.badge}</span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 md:p-4">
            <Outlet />
          </div>

          {/* ── F-key bar (Tally-style) ── */}
          <div className="fkey-bar shrink-0 hidden md:flex">
            {FKEYS.map((f) => (
              <div key={f.key} className="fkey-item">
                <span className="fkey-label">{f.key}</span>
                <span className="opacity-60">:{f.label}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1 opacity-50 text-[10px]">
              <span>BillingsEasy v2.0</span>
              <span>·</span>
              <span>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </main>
      </div>

      {/* Business mode selector */}
      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-bold">How do you use BillingsEasy?</h2>
              <p className="text-sm text-muted-foreground mt-1">Choose your business type — the sidebar will show only what you need. You can change this anytime.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              {BUSINESS_MODES.map(m => (
                <button key={m.value} onClick={() => chooseMode(m.value)}
                  className={`rounded-xl border-2 p-4 text-left transition-all hover:border-blue-500 hover:shadow-md ${businessMode === m.value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border bg-card"}`}>
                  <div className="text-2xl mb-1">{m.emoji}</div>
                  <div className="font-semibold text-sm">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
            {businessMode && (
              <div className="px-6 pb-4">
                <button onClick={() => setShowModeSelect(false)} className="w-full text-sm text-muted-foreground hover:text-foreground py-1">
                  Keep current ({BUSINESS_MODES.find(m => m.value === businessMode)?.label})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateOrgDialog open={showCreateOrg} onClose={() => setShowCreateOrg(false)}
        onCreated={async (id) => {
          await refreshOrgs(); switchOrg(id); setShowCreateOrg(false); nav("/dashboard");
        }} />
    </div>
  );
}

function CreateOrgDialog({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [stateCode, setStateCode] = useState("33");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name) { toast.error("Org name required"); return; }
    setSaving(true);
    try {
      const st = STATES.find(s => s.code === stateCode);
      const { data } = await api.post("/orgs", { name, state: st.name, state_code: stateCode });
      toast.success(`${data.name} created — 50 free credits added!`);
      onCreated(data.id);
      setName("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="create-org-dialog">
        <DialogHeader><DialogTitle>Create New Organization</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Business name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sharma Enterprises" data-testid="new-org-name" />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Select value={stateCode} onValueChange={setStateCode}>
              <SelectTrigger data-testid="new-org-state"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded border p-3 text-xs" style={{ background: "hsl(var(--tally-green-light))", borderColor: "hsl(var(--tally-green) / 0.3)" }}>
            <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: "hsl(var(--tally-green))" }}>
              <Sparkles className="h-3.5 w-3.5" /> 50 free credits included
            </div>
            <div className="opacity-70">Credits power every feature. Top up anytime from the Wallet page.</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="new-org-save"
            style={{ background: "hsl(var(--tally-green))", color: "white" }}>
            {saving ? "Creating…" : "Create Organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
