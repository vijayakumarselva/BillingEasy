import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
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
  Home, Lock, ArrowLeftRight, Store,
} from "lucide-react";
import { STATES } from "@/pages/Parties";

const ALL_NAV = [
  { to: "/parties",  label: "Parties",           icon: Users,           tid: "nav-parties",   shortcut: "Alt+P", group: "Masters",      modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/products", label: "Products & Stock",   icon: Package,         tid: "nav-products",  shortcut: "Alt+I", group: "Masters",      modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/sales",      label: "Sales / Invoices", icon: FileText,        tid: "nav-sales",     shortcut: "Alt+S", group: "Transactions", modes: ["b2b","b2c"] },
  { to: "/purchases",  label: "Purchases",         icon: ShoppingCart,   tid: "nav-purchases", shortcut: "Alt+B", group: "Transactions", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/payments",   label: "Payments",          icon: Wallet,         tid: "nav-payments",  shortcut: "Alt+M", group: "Transactions", modes: ["b2b","b2c"] },
  { to: "/expenses",   label: "Expenses",          icon: Receipt,        tid: "nav-expenses",  shortcut: "Alt+E", group: "Transactions", modes: ["b2b","b2c","restaurant"] },
  { to: "/pos",              label: "Retail POS",          icon: Scan,             tid: "nav-pos",           badge: "New", group: "Modules", modes: ["pos","b2c"] },
  { to: "/pos/admin",        label: "POS Settings",        icon: SlidersHorizontal,tid: "nav-pos-admin",                   group: "Modules", modes: ["pos"] },
  { to: "/restaurant",       label: "Restaurant",          icon: UtensilsCrossed,  tid: "nav-restaurant",    badge: "New", group: "Modules", modes: ["restaurant"] },
  { to: "/restaurant/admin", label: "Restaurant Settings", icon: SlidersHorizontal,tid: "nav-restaurant-admin",            group: "Modules", modes: ["restaurant"] },
  { to: "/bank-statement", label: "Bank Statement",  icon: FileSpreadsheet, tid: "nav-bank-statement", group: "Accounting", modes: ["b2b","b2c"] },
  { to: "/gst",            label: "GST Returns",     icon: FileBarChart,    tid: "nav-gst",  shortcut: "Alt+G", group: "Accounting", modes: ["b2b","b2c"] },
  { to: "/tds",            label: "TDS",             icon: Landmark,        tid: "nav-tds",               group: "Accounting", modes: ["b2b"] },
  { to: "/reports",        label: "Reports & Books", icon: BookOpen,        tid: "nav-accounting", shortcut: "Alt+R", group: "Accounting", modes: ["b2b","b2c","restaurant"] },
  { to: "/ask-ai", label: "Ask AI",    icon: Bot,    tid: "nav-ai",    badge: "AI",   group: "Tools & AI", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/tools",  label: "GST Tools", icon: Wrench, tid: "nav-tools", badge: "Free", group: "Tools & AI", modes: ["b2b","b2c"] },
  { to: "/wallet",   label: "Wallet & Credits", icon: Coins,    tid: "nav-wallet",  group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/credits",  label: "Buy Credits",      icon: Zap,      tid: "nav-credits", badge: "New", group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
  { to: "/settings", label: "Settings",         icon: Settings, tid: "nav-settings", shortcut: "Alt+,", group: "Account", modes: ["b2b","b2c","restaurant","pos"] },
];

const BUSINESS_MODES = [
  { value: "b2b",        label: "B2B Billing",    emoji: "🏢", color: "bg-blue-600",   desc: "GST invoices, purchases, ledgers" },
  { value: "b2c",        label: "B2C Retail",     emoji: "🛒", color: "bg-orange-500", desc: "Sales, POS, retail billing" },
  { value: "restaurant", label: "Restaurant",     emoji: "🍽️", color: "bg-red-500",    desc: "Table orders, KOT, menus" },
  { value: "pos",        label: "POS / Counter",  emoji: "🖥️", color: "bg-indigo-600", desc: "Retail counter & quick billing" },
];

const FKEYS = [
  { key: "F2", label: "Date" }, { key: "F4", label: "Contra" },
  { key: "F5", label: "Payment" }, { key: "F6", label: "Receipt" },
  { key: "F8", label: "Sales" }, { key: "F9", label: "Purchase" },
  { key: "Alt+G", label: "GST" }, { key: "Alt+R", label: "Reports" },
  { key: "Ctrl+N", label: "New" }, { key: "Esc", label: "Back" },
];

export default function AppLayout() {
  const { user, logout, orgs, orgId, currentOrg, switchOrg, refreshOrgs, allowedModes } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [businessMode, setBusinessMode] = useState(() => localStorage.getItem(`biz_mode_${orgId}`) || "");
  const [showModeSelect, setShowModeSelect] = useState(false);

  useEffect(() => {
    if (orgId) api.get("/wallet").then(r => setWallet(r.data)).catch(() => {});
  }, [orgId, loc.pathname]);

  useEffect(() => {
    if (!orgId) return;
    if (allowedModes.length > 0) {
      const stored = localStorage.getItem(`biz_mode_${orgId}`);
      const effective = allowedModes.includes(stored) ? stored : allowedModes[0];
      setBusinessMode(effective);
      localStorage.setItem(`biz_mode_${orgId}`, effective);
      return;
    }
    const stored = localStorage.getItem(`biz_mode_${orgId}`);
    if (stored) { setBusinessMode(stored); return; }
    api.get("/business").then(r => {
      const mode = r.data?.business_mode || "";
      if (mode) { setBusinessMode(mode); localStorage.setItem(`biz_mode_${orgId}`, mode); }
      else setShowModeSelect(true);
    }).catch(() => {});
  }, [orgId, allowedModes]);

  const chooseMode = async (mode) => {
    setBusinessMode(mode);
    localStorage.setItem(`biz_mode_${orgId}`, mode);
    setShowModeSelect(false);
    setDrawerOpen(false);
    try {
      const { data: biz } = await api.get("/business");
      await api.put("/business", { ...biz, business_mode: mode });
    } catch {}
  };

  const effectiveMode = businessMode || "b2b";
  const visibleNav = allowedModes.length > 0
    ? ALL_NAV.filter(n => n.modes.some(m => allowedModes.includes(m)))
    : ALL_NAV;
  const primaryNav = visibleNav.filter(n => n.modes.includes(effectiveMode));
  const groupedPrimary = primaryNav.reduce((acc, n) => {
    if (!acc[n.group]) acc[n.group] = [];
    acc[n.group].push(n);
    return acc;
  }, {});
  const moreNav = visibleNav.filter(n => !n.modes.includes(effectiveMode));

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

  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);

  const handleLogout = async () => { await logout(); nav("/login"); };

  const currentMode = BUSINESS_MODES.find(m => m.value === effectiveMode);
  const currentPageLabel = ALL_NAV.find(n => loc.pathname === n.to)?.label || "Dashboard";

  // Mobile bottom nav — 4 items based on mode
  const mobileBottomNav = [
    { to: "/dashboard", label: "Home", icon: Home },
    ...(effectiveMode === "restaurant"
      ? [{ to: "/restaurant", label: "Orders", icon: UtensilsCrossed }]
      : effectiveMode === "pos"
      ? [{ to: "/pos", label: "POS", icon: Scan }]
      : [{ to: "/sales", label: "Sales", icon: FileText }]
    ),
    { to: "/parties", label: "Parties", icon: Users },
    { to: "/products", label: "Stock", icon: Package },
  ];

  return (
    <div className="flex min-h-screen flex-col">

      {/* ══════════ DESKTOP: Tally-style green top bar ══════════ */}
      <header className="hidden md:flex items-center justify-between px-3 py-0 h-9 shrink-0"
        style={{ background: "hsl(var(--tally-green-dark))", color: "white" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 opacity-70" />
            <span className="text-xs font-bold tracking-wide uppercase opacity-90">
              Billings<span style={{ color: "hsl(158 80% 70%)" }}>Easy</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] opacity-75">
            <ChevronRight className="h-3 w-3" />
            <span>{currentOrg?.name || "—"}</span>
          </div>
        </div>
        <div className="text-xs font-semibold tracking-widest uppercase opacity-60">{currentPageLabel}</div>
        <div className="flex items-center gap-2">
          {wallet && (
            <button onClick={() => nav("/wallet")}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
              style={{ background: "hsl(158 50% 20%)", color: "hsl(158 70% 80%)" }}>
              <Coins className="h-3 w-3" />
              <span className="font-mono font-semibold">{wallet.balance}</span>
              <span className="opacity-70">cr</span>
            </button>
          )}
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
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center justify-between">
                    <span className="truncate">{o.name}</span>
                    {o.id === orgId && <span className="text-[10px] text-primary font-bold ml-2">●</span>}
                  </button>
                ))}
                <div className="border-t border-border">
                  <button onClick={() => { setOrgOpen(false); setShowCreateOrg(true); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-1.5 text-primary font-medium">
                    <Plus className="h-3 w-3" /> New Organization
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={toggle} className="p-1 opacity-70 hover:opacity-100" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[11px] opacity-70 hover:opacity-100 px-1.5 py-0.5"
            data-testid="logout-button">
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* ══════════ MOBILE: App-style header ══════════ */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 shrink-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        {/* Hamburger */}
        <button onClick={() => setDrawerOpen(true)} className="p-1 -ml-1 text-gray-600 dark:text-gray-300">
          <Menu className="h-6 w-6" />
        </button>

        {/* Business mode badge — prominent, tappable to switch */}
        <button
          onClick={() => allowedModes.length === 0 && setShowModeSelect(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-semibold ${currentMode?.color || "bg-gray-600"}`}
        >
          <span>{currentMode?.emoji}</span>
          <span>{currentMode?.label}</span>
          {allowedModes.length === 0 && <ChevronDown className="h-3.5 w-3.5 opacity-80" />}
          {allowedModes.length > 0 && <Lock className="h-3 w-3 opacity-80" />}
        </button>

        <div className="flex-1" />

        {/* Theme toggle */}
        <button onClick={toggle} className="p-2 text-gray-500 dark:text-gray-400">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Org switcher */}
        <button onClick={() => setOrgOpen(v => !v)} className="p-1 text-gray-500 dark:text-gray-400 relative">
          <Building2 className="h-5 w-5" />
          {orgOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border shadow-xl z-50 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 overflow-hidden">
              {orgs.map(o => (
                <button key={o.id} onClick={() => { switchOrg(o.id); setOrgOpen(false); window.location.reload(); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <span className="font-medium truncate">{o.name}</span>
                  {o.id === orgId && <span className="text-[10px] text-blue-600 font-bold ml-2">● Active</span>}
                </button>
              ))}
              <button onClick={() => { setOrgOpen(false); setShowCreateOrg(true); }}
                className="w-full text-left px-4 py-3 text-sm text-blue-600 font-semibold flex items-center gap-2 border-t border-gray-100 dark:border-gray-800">
                <Plus className="h-4 w-4" /> New Business
              </button>
            </div>
          )}
        </button>
      </header>

      {/* ══════════ Body: sidebar + content ══════════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <aside className="sidebar-shell shrink-0 hidden md:flex flex-col overflow-y-auto overflow-x-hidden w-48" data-testid="app-sidebar">
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
            <div className="text-[11px] font-bold truncate" style={{ color: "hsl(var(--sidebar-fg))" }}>
              {user?.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="text-[10px] opacity-50 uppercase tracking-wider flex-1">{currentOrg?.role || "member"}</div>
              {businessMode && (
                allowedModes.length > 0
                  ? <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider bg-slate-600 text-white flex items-center gap-1">
                      <Lock className="h-2 w-2" /> {currentMode?.label}
                    </span>
                  : <button onClick={() => setShowModeSelect(true)}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                      {currentMode?.emoji} {currentMode?.label}
                    </button>
              )}
            </div>
          </div>

          <div className="px-2 pt-2">
            <NavLink to="/dashboard" data-testid="nav-dashboard"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              <span>Dashboard</span>
            </NavLink>
          </div>

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
                        n.badge === "New" ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"
                      }`}>{n.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
            {moreNav.length > 0 && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
                <div className="sidebar-section-label opacity-40">Other Modules</div>
                {moreNav.map((n) => (
                  <NavLink key={n.to} to={n.to} data-testid={n.tid} title={n.label}
                    className={({ isActive }) => `sidebar-link text-[11px] opacity-60 hover:opacity-100 ${isActive ? "active" : ""}`}>
                    <n.icon className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{n.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </nav>
        </aside>

        {/* ── Mobile full-screen drawer ── */}
        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Drawer panel */}
            <div className="w-80 max-w-[85vw] bg-white dark:bg-gray-900 h-full flex flex-col shadow-2xl overflow-hidden">

              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div>
                  <div className="font-bold text-lg text-gray-900 dark:text-white">
                    Billings<span className="text-blue-600">Easy</span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{currentOrg?.name}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User + mode */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-base">
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{user?.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{currentOrg?.role || "member"}</div>
                  </div>
                </div>

                {/* Business mode switcher */}
                {allowedModes.length === 0 ? (
                  <button
                    onClick={() => setShowModeSelect(true)}
                    className={`mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold ${currentMode?.color || "bg-gray-600"}`}
                  >
                    <span className="text-lg">{currentMode?.emoji}</span>
                    <div className="flex-1 text-left">
                      <div>{currentMode?.label}</div>
                      <div className="text-[10px] opacity-70">{currentMode?.desc}</div>
                    </div>
                    <ArrowLeftRight className="h-4 w-4 opacity-70" />
                  </button>
                ) : (
                  <div className={`mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold ${currentMode?.color || "bg-gray-600"}`}>
                    <span className="text-lg">{currentMode?.emoji}</span>
                    <div className="flex-1 text-left">
                      <div>{currentMode?.label}</div>
                      <div className="text-[10px] opacity-70">Locked by your role</div>
                    </div>
                    <Lock className="h-4 w-4 opacity-70" />
                  </div>
                )}
              </div>

              {/* Nav items */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                <Link to="/dashboard"
                  className={`flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                    loc.pathname === "/dashboard"
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}>
                  <LayoutDashboard className="h-5 w-5 shrink-0" />
                  Dashboard
                </Link>

                {Object.entries(groupedPrimary).map(([groupLabel, items]) => (
                  <div key={groupLabel}>
                    <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {groupLabel}
                    </div>
                    {items.map((n) => (
                      <Link key={n.to} to={n.to}
                        className={`flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                          loc.pathname === n.to || loc.pathname.startsWith(n.to + "/")
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                            : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}>
                        <n.icon className="h-5 w-5 shrink-0" />
                        <span className="flex-1">{n.label}</span>
                        {n.badge && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                            n.badge === "AI" ? "bg-violet-500 text-white" :
                            n.badge === "New" ? "bg-emerald-500 text-white" : "bg-gray-400 text-white"
                          }`}>{n.badge}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>

              {/* Drawer footer */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3 shrink-0 space-y-1">
                <button onClick={() => { setDrawerOpen(false); nav("/settings"); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Settings className="h-5 w-5" />
                  Settings
                </button>
                <button onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <LogOut className="h-5 w-5" />
                  Sign out
                </button>
              </div>
            </div>
            {/* Backdrop */}
            <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 mobile-main-pad">
            <Outlet />
          </div>
          {/* F-key bar (desktop only) */}
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

      {/* ══════════ Mobile bottom nav ══════════ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {mobileBottomNav.map((item) => {
          const isActive = loc.pathname === item.to || loc.pathname.startsWith(item.to + "/");
          return (
            <Link key={item.to} to={item.to}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
              }`}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
        {/* Menu (opens drawer) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
            drawerOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
          }`}>
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Menu</span>
        </button>
      </nav>

      {/* Business mode selector */}
      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Switch Business Type</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Each business type has its own data — parties, invoices, products, and accounts are kept separate.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              {BUSINESS_MODES.map(m => (
                <button key={m.value} onClick={() => chooseMode(m.value)}
                  className={`rounded-2xl border-2 p-4 text-left transition-all hover:shadow-md ${
                    businessMode === m.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 hover:border-blue-300"
                  }`}>
                  <div className={`w-10 h-10 rounded-xl ${m.color} flex items-center justify-center text-xl mb-2`}>
                    {m.emoji}
                  </div>
                  <div className="font-bold text-sm text-gray-900 dark:text-white">{m.label}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
            {businessMode && (
              <div className="px-6 pb-6 pt-0">
                <button onClick={() => setShowModeSelect(false)}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 border border-gray-200 dark:border-gray-700 rounded-xl">
                  Keep current ({currentMode?.label})
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
