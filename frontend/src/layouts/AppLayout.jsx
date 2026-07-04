import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  LayoutDashboard, Users, Package, FileText, ShoppingCart, Wallet,
  Receipt, BookOpen, Landmark, Settings, LogOut, Moon, Sun, Building2,
  FileBarChart, ChevronDown, Plus, CreditCard, Sparkles, Bot, Wrench, FileSpreadsheet, Coins, Zap,
  UtensilsCrossed, Scan, SlidersHorizontal,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { STATES } from "@/pages/Parties";

const NAV = [
  { to: "/dashboard", label: "Home", subtitle: "Dashboard", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/ask-ai", label: "Ask BillingEasy AI", subtitle: "Your AI bookkeeper", icon: Bot, tid: "nav-ai", badge: "AI" },
  { to: "/tools", label: "GST Tools", subtitle: "GSTIN check, HSN finder", icon: Wrench, tid: "nav-tools", badge: "Free" },
  { to: "/parties", label: "Customers & Suppliers", subtitle: "Who you buy from / sell to", icon: Users, tid: "nav-parties" },
  { to: "/products", label: "Products & Stock", subtitle: "What you sell", icon: Package, tid: "nav-products" },
  { to: "/sales", label: "Sales / Invoices", subtitle: "Bills for your customers", icon: FileText, tid: "nav-sales" },
  { to: "/pos", label: "Retail POS", subtitle: "Quick retail billing & scanner", icon: Scan, tid: "nav-pos", badge: "New" },
  { to: "/pos/admin", label: "POS Settings", subtitle: "Store, GST, receipt config", icon: SlidersHorizontal, tid: "nav-pos-admin" },
  { to: "/restaurant", label: "Restaurant Billing", subtitle: "Tables, KOT & GST bills", icon: UtensilsCrossed, tid: "nav-restaurant", badge: "New" },
  { to: "/restaurant/admin", label: "Restaurant Settings", subtitle: "Tables, sections, KOT config", icon: SlidersHorizontal, tid: "nav-restaurant-admin" },
  { to: "/purchases", label: "Purchases / Bills", subtitle: "Bills from suppliers", icon: ShoppingCart, tid: "nav-purchases" },
  { to: "/payments", label: "Money In / Out", subtitle: "Cash, UPI, bank", icon: Wallet, tid: "nav-payments" },
  { to: "/bank-statement", label: "Bank Statement", subtitle: "Upload & auto-match", icon: FileSpreadsheet, tid: "nav-bank-statement" },
  { to: "/expenses", label: "Expenses", subtitle: "Rent, electricity, salaries", icon: Receipt, tid: "nav-expenses" },
  { to: "/gst", label: "GST Returns", subtitle: "GSTR-1 & GSTR-3B", icon: FileBarChart, tid: "nav-gst" },
  { to: "/reports", label: "Reports & Books", subtitle: "P&L, ledgers, stock", icon: BookOpen, tid: "nav-accounting" },
  { to: "/tds", label: "TDS", subtitle: "Tax deducted at source", icon: Landmark, tid: "nav-tds" },
  { to: "/credits", label: "Buy Credits", subtitle: "Credit packs & pricing", icon: Zap, tid: "nav-credits", badge: "New" },
  { to: "/wallet", label: "Wallet & Credits", subtitle: "Balance & history", icon: Coins, tid: "nav-wallet" },
  { to: "/settings", label: "Settings", subtitle: "Business, team, banks", icon: Settings, tid: "nav-settings" },
];

export default function AppLayout() {
  const { user, logout, orgs, orgId, currentOrg, switchOrg, refreshOrgs } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    if (orgId) api.get("/wallet").then(r => setWallet(r.data)).catch(() => {});
  }, [orgId, loc.pathname]);

  const handleLogout = async () => { await logout(); nav("/login"); };

  return (
    <div className="flex min-h-screen">
      <aside className="sidebar-shell w-64 hidden md:flex flex-col py-5 px-3" data-testid="app-sidebar">
        <div className="px-3 mb-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={36} />
            <div>
              <div className="text-white font-semibold tracking-tight text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                Billing<span className="text-blue-400">Easy</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">GST · Billing · Books</div>
            </div>
          </div>
        </div>

        {/* Org switcher */}
        <div className="px-2 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-left" data-testid="org-switcher">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-slate-400">Organization</div>
                  <div className="text-sm text-white truncate" data-testid="current-org-name">{currentOrg?.name || "—"}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start" data-testid="org-switcher-menu">
              <DropdownMenuLabel className="text-xs">Your organizations</DropdownMenuLabel>
              {orgs.map(o => (
                <DropdownMenuItem key={o.id} onClick={() => { switchOrg(o.id); window.location.reload(); }}
                  data-testid={`org-option-${o.name}`}>
                  <div className="flex items-center justify-between w-full">
                    <span>{o.name}</span>
                    {o.id === orgId && <Badge variant="secondary" className="ml-2">Current</Badge>}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreateOrg(true)} data-testid="create-org-button">
                <Plus className="h-4 w-4 mr-2" /> Create new org
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} data-testid={n.tid}
              title={n.subtitle}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{n.label}</span>
              {n.badge && (
                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-semibold tracking-wider ${
                  n.badge === "AI" ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" :
                  "bg-emerald-500/20 text-emerald-300"
                }`}>{n.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-2 pt-4 border-t border-white/5 mt-4 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-600 text-white text-xs">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm text-white truncate" data-testid="current-user-name">{user?.name}</div>
              <div className="text-[10px] uppercase text-slate-400">{currentOrg?.role}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-white hover:bg-white/5"
            data-testid="logout-button" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 bg-background/80 backdrop-blur">
          <div className="md:hidden flex items-center gap-2">
            <LogoMark size={26} />
            <span className="font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>BillingEasy</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Welcome back, <span className="text-foreground font-medium">{user?.name?.split(" ")[0]}</span>
            </span>
            {wallet && (
              <Badge variant="secondary" className="gap-1 text-blue-700 bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300">
                <Coins className="h-3 w-3" /> {wallet.balance} credits
              </Badge>
            )}
            {wallet && wallet.balance < 10 && (
              <Button size="sm" variant="destructive" onClick={() => nav("/credits")} data-testid="upgrade-button">
                Top up credits
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>

      <CreateOrgDialog open={showCreateOrg} onClose={() => setShowCreateOrg(false)} onCreated={async (id) => {
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
        <DialogHeader><DialogTitle>Create new organization</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Business name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Enterprises" data-testid="new-org-name" />
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
          <div className="rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300 mb-1">
              <Sparkles className="h-3.5 w-3.5" /> 50 free credits included
            </div>
            <div className="text-blue-700/80 dark:text-blue-300/80">
              Credits power every feature. Top up anytime from the Wallet page.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="new-org-save">
            {saving ? "Creating…" : "Create org"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
