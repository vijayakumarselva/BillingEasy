import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Ban, Eye, FileDown, Share2, ChevronRight, FileText, Pencil, ChevronDown, IndianRupee, Truck, Upload, Copy, MoreHorizontal } from "lucide-react";
import EwayBillDialog from "@/components/EwayBillDialog";
import { PaymentDialog } from "@/pages/Payments";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr, fmtDate } from "@/lib/format";
import { openExternalUrl, downloadFile } from "@/lib/mobile";

const STATUS_COLOR = {
  finalized:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  dispatched: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  delivered:  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  paid:       "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  draft:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  void:      "bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 line-through",
  cancelled: "bg-rose-50 text-rose-500 dark:bg-rose-950/30 dark:text-rose-400",
};

/** Everything you can do to an invoice, as words rather than coloured squares.
 *
 *  It is the mobile counterpart of the desktop row's action column, and it
 *  carries the same set — the old mobile card offered four of the nine. Each
 *  row closes the sheet first, so a dialog opened from here (receive payment,
 *  e-way bill) is not stacked underneath it. */
const SHEET_STATUSES = [
  { value: "draft",      label: "Draft" },
  { value: "finalized",  label: "Finalized" },
  { value: "dispatched", label: "Dispatched", saleOnly: true },
  { value: "delivered",  label: "Delivered",  saleOnly: true },
];

function SheetRow({ icon: Icon, label, hint, tone = "", onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm
                  active:bg-muted disabled:opacity-40 ${tone}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}

function InvoiceActionsSheet({
  inv, onClose, zohoOn, pushing, canReceive,
  onView, onEdit, onClone, onReceive, onEwb, onZoho, onPdf, onShare, onStatus, onCancel,
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!inv) return null;
  const dead = inv.status === "cancelled" || inv.status === "void";
  const act = (fn) => () => { onClose(); setTimeout(() => fn(inv), 10); };

  return (
    <Dialog open={!!inv} onOpenChange={(o) => { if (!o) { setConfirmCancel(false); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono-fin text-blue-600">{inv.invoice_no}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-2">{inv.party_name || "Walk-in"}</p>
        </DialogHeader>

        {confirmCancel ? (
          <div className="space-y-3">
            <p className="text-sm">
              Cancel <span className="font-semibold">{inv.invoice_no}</span>? It stays in your
              records but cannot be edited or paid against.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="destructive" onClick={() => { onClose(); setConfirmCancel(false); onCancel(inv.id); }}>
                Yes, cancel this invoice
              </Button>
              <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep it</Button>
            </div>
          </div>
        ) : (
          <div className="-mx-1 space-y-0.5">
            {canReceive(inv) && (
              <SheetRow icon={IndianRupee} label="Receive payment" hint={inr(inv.due)}
                tone="text-emerald-700 dark:text-emerald-400" onClick={act(onReceive)} />
            )}
            <SheetRow icon={Eye} label="View invoice" onClick={act(onView)} />
            {!dead && <SheetRow icon={Pencil} label="Edit" onClick={act(onEdit)} />}
            <SheetRow icon={Copy} label="Duplicate" hint="new invoice from this one" onClick={act(onClone)} />
            <SheetRow icon={FileDown} label="Download PDF" onClick={act(onPdf)} />
            <SheetRow icon={Share2} label="Share on WhatsApp" onClick={act(onShare)} />
            {inv.type === "sale" && !["cancelled", "void", "draft"].includes(inv.status) && (
              <SheetRow icon={Truck} label="Generate e-way bill" onClick={act(onEwb)} />
            )}
            {zohoOn && inv.type === "sale" && !["cancelled", "void", "draft"].includes(inv.status) && (
              <SheetRow icon={Upload} label={inv.zoho_invoice_id ? "Already in Zoho" : "Send to Zoho"}
                disabled={pushing === inv.id || !!inv.zoho_invoice_id} onClick={act(onZoho)} />
            )}

            {!dead && (
              <>
                <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </div>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {SHEET_STATUSES
                    .filter(st => !(st.saleOnly && inv.type !== "sale") && st.value !== inv.status)
                    .map(st => (
                      <button key={st.value} type="button"
                        onClick={() => { onClose(); onStatus(inv.id, st.value); }}
                        className="rounded-full border px-3 py-1.5 text-xs font-medium active:bg-muted">
                        {st.label}
                      </button>
                    ))}
                </div>
                <SheetRow icon={Ban} label="Cancel invoice" tone="text-rose-600 dark:text-rose-400"
                  onClick={() => setConfirmCancel(true)} />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Sales() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  // Which registration or warehouse the invoice was billed from.
  const [locFilter, setLocFilter] = useState("all");
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [receiveTarget, setReceiveTarget] = useState(null); // invoice to record a receipt against
  const [ewbTarget, setEwbTarget] = useState(null);
  const [sheetInv, setSheetInv] = useState(null);          // invoice whose actions sheet is open
  const [cancelTarget, setCancelTarget] = useState(null);  // invoice awaiting a cancel confirmation        // invoice to raise an e-way bill for
  const [pushing, setPushing] = useState("");              // invoice id currently going to Zoho
  const [zohoOn, setZohoOn] = useState(false);             // is the Zoho mirror switched on
  const canReceive = (inv) => inv.type === "sale" && inv.due > 0.5 && !["cancelled", "void", "draft"].includes(inv.status);
  const nav = useNavigate();

  // Mirror one sale into Zoho Inventory/Books by hand — for bills raised before
  // the integration was switched on, or when an earlier push failed.
  const pushToZoho = async (inv) => {
    setPushing(inv.id);
    try {
      const { data } = await api.post(`/integrations/zoho/push/${inv.id}`);
      toast.success(data.already ? `${inv.invoice_no} is already in Zoho`
                                 : `${inv.invoice_no} sent to Zoho`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send to Zoho");
    } finally {
      setPushing("");
    }
  };

  const load = async () => {
    setLoading(true);
    const p = {};
    if (statusFilter !== "all") p.status = statusFilter;
    if (typeFilter !== "all") p.type = typeFilter;
    if (locFilter.startsWith("b:")) p.branch_id = locFilter.slice(2);
    else if (locFilter.startsWith("w:")) p.warehouse_id = locFilter.slice(2);
    const { data } = await api.get("/invoices", { params: p });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter, typeFilter, locFilter]); // eslint-disable-line
  useEffect(() => {
    api.get("/orgs/current/branches")
      .then(r => setBranches((r.data || []).filter(b => b.active !== false))).catch(() => {});
    api.get("/warehouses")
      .then(r => setWarehouses((r.data || []).filter(w => w.active !== false))).catch(() => {});
    api.get("/integrations/zoho")
      .then(r => setZohoOn(!!r.data?.enabled)).catch(() => {});
  }, []);

  const filtered = list.filter(i =>
    !search ||
    i.invoice_no?.toLowerCase().includes(search.toLowerCase()) ||
    (i.party_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const cancel = async (id) => {
    try {
      await api.patch(`/invoices/${id}/cancel`);
      toast.success("Invoice cancelled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to cancel");
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/invoices/${id}/status`, { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update status");
    }
  };

  const downloadPdf = async (inv) => {
    try {
      const res = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.invoice_no}.pdf`;
      downloadFile(url, `${inv.invoice_no}.pdf`);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch { toast.error("PDF download failed"); }
  };

  const shareWhatsApp = (inv) => {
    const phone = (inv.party_snapshot?.phone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${inv.party_name}, your invoice ${inv.invoice_no} for ₹${inv.totals?.grand_total?.toFixed(2)} is ready. Thank you!`);
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    openExternalUrl(url);
  };

  return (
    <div className="space-y-0 md:space-y-6" data-testid="sales-page">

      {/* ── Mobile header ── */}
      <div className="mobile-page-header mobile-only">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h2>Sales / Invoices</h2>
        </div>
        <Button size="sm" onClick={() => nav("/sales/new")} className="bg-blue-600 hover:bg-blue-700 h-9 px-3">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      {/* ── Desktop header ── */}
      <div className="desktop-only flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales / Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Create GST invoices, download PDF, and share on WhatsApp in one click.</p>
        </div>
        <Button onClick={() => nav("/sales/new")} className="bg-blue-600 hover:bg-blue-700" data-testid="invoice-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="mobile-search md:px-0 flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-2.5 top-3 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invoice # or party…" value={search}
            onChange={(e) => setSearch(e.target.value)} data-testid="invoice-search-input" />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 md:w-44" data-testid="invoice-type-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="sale">Sale Invoice</SelectItem>
              <SelectItem value="quotation">Quotation</SelectItem>
              <SelectItem value="credit_note">Credit Note</SelectItem>
            </SelectContent>
          </Select>
          {(branches.length > 0 || warehouses.length > 0) && (
            <Select value={locFilter} onValueChange={setLocFilter}>
              <SelectTrigger className="w-40 md:w-52" data-testid="invoice-location-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                <SelectItem value="b:head">Head Office only</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={`b:${b.id}`}>
                    {b.name}{b.state ? ` · ${b.state}` : ""}
                  </SelectItem>
                ))}
                {warehouses.length > 0 && branches.length > 0 && (
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Warehouses
                  </div>
                )}
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={`w:${w.id}`}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 md:w-36" data-testid="invoice-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="void">Void</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Mobile card list ──
           The old card was a flex row ending in four unlabelled icon buttons
           stacked vertically. Mobile CSS gives every button a 44px target, so
           that stack alone was ~190px tall and dragged the whole card to that
           height — hence a screen that showed one and a half invoices and a
           lot of white space, with four coloured squares to guess between.

           Now: the invoice reads as one block, and the actions are three
           labelled full-width targets along the bottom. Everything else —
           edit, duplicate, e-way bill, Zoho, cancel, status — is behind More,
           which opens as a bottom sheet with words on it. The mobile card has
           the full desktop action set for the first time. */}
      <div className="mobile-only flex flex-col gap-2.5 px-1 pb-4">
        {loading
          ? [1,2,3,4].map(i => (
              <div key={i} className="rounded-xl border bg-card p-3.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-4 w-48" />
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
            ))
          : filtered.length === 0
            ? <div className="text-center text-muted-foreground py-12 text-sm">No invoices yet.</div>
            : filtered.map(inv => {
              const dead = inv.status === "cancelled" || inv.status === "void";
              return (
              <div key={inv.id} data-testid={`invoice-card-${inv.invoice_no}`}
                className="rounded-xl border bg-card overflow-hidden transition-colors active:bg-muted/60">
                <div className="px-3.5 py-3" onClick={() => nav(`/sales/${inv.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono-fin text-[13px] font-semibold text-blue-600">
                          {inv.invoice_no}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLOR[inv.status] || "bg-muted text-muted-foreground"}`}>
                          {inv.status}
                        </span>
                      </div>
                      {/* Two lines before it truncates: a company name cut to
                          "63IDEAS INFOLABS PRIVA…" identifies nothing. */}
                      <p className="mt-1 text-[15px] font-medium leading-snug line-clamp-2">
                        {inv.party_name || "Walk-in"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDate(inv.invoice_date)}
                        {inv.location_label && inv.location_label !== "Head Office" && ` · ${inv.location_label}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mobile-amount text-foreground">{inr(inv.totals?.grand_total)}</p>
                      {inv.due > 0
                        ? <p className="mt-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">Due {inr(inv.due)}</p>
                        : <p className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Paid</p>}
                    </div>
                  </div>
                </div>

                {/* The things you do to an invoice from a phone, in words. */}
                <div className="flex border-t divide-x divide-border text-xs font-medium">
                  {canReceive(inv) && (
                    <button onClick={() => setReceiveTarget(inv)}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-emerald-700 dark:text-emerald-400 active:bg-emerald-50 dark:active:bg-emerald-950/40">
                      <IndianRupee className="h-3.5 w-3.5" /> Receive
                    </button>
                  )}
                  {!dead && (
                    <button onClick={() => shareWhatsApp(inv)}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-green-700 dark:text-green-400 active:bg-green-50 dark:active:bg-green-950/40">
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                  )}
                  <button onClick={() => setSheetInv(inv)} data-testid={`invoice-more-${inv.invoice_no}`}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-muted-foreground active:bg-muted">
                    <MoreHorizontal className="h-4 w-4" /> More
                  </button>
                </div>
              </div>
            );})
        }
      </div>

      {/* ── Desktop table ── */}
      <Card className="desktop-only">
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr>
              <th>Invoice #</th><th>Type</th><th>Customer</th><th>Billed from</th><th>Date</th><th>Due</th>
              <th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={11}><Skeleton className="h-8 w-full" /></td></tr>) :
                filtered.length === 0 ? <tr><td colSpan={11} className="text-center text-muted-foreground py-8">No invoices.</td></tr> :
                filtered.map(inv => {
                 const dead = inv.status === "cancelled" || inv.status === "void";
                 return (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.invoice_no}`}>
                    <td className="font-mono-fin text-blue-600 font-medium">{inv.invoice_no}</td>
                    <td><Badge variant="secondary">{inv.type}</Badge></td>
                    <td className="font-medium">{inv.party_name}</td>
                    <td className="text-xs">
                      <div className="text-foreground">{inv.location_label || "Head Office"}</div>
                      {inv.location_gstin && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {inv.location_gstin}
                        </div>
                      )}
                      {inv.warehouse_label && (
                        <div className="text-[10px] text-muted-foreground">
                          {inv.warehouse_label}
                        </div>
                      )}
                    </td>
                    <td className="text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                    <td className="text-muted-foreground">{fmtDate(inv.due_date)}</td>
                    <td className="num">{inr(inv.totals?.grand_total)}</td>
                    <td className="num">{inr(inv.paid)}</td>
                                        {/* The balance column states the balance. Whether it is
                        settled is the status column's job, one cell along. */}
                    <td className="num">
                      {inv.due > 0
                        ? <span className="font-medium text-rose-600 dark:text-rose-400">{inr(inv.due)}</span>
                        : <span className="text-muted-foreground">{inr(0)}</span>}
                    </td>
                    <td>
                      {/* Two stacked pills per row — "Unpaid" above
                          "finalized" — read as a wall of colour. Payment
                          state is a dot and a word; the document status stays
                          the thing you can change. */}
                      <div className="flex items-center gap-2">
                        {!["cancelled", "void", "draft"].includes(inv.status) && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              inv.due <= 0 ? "bg-emerald-500" : inv.paid > 0 ? "bg-amber-500" : "bg-rose-500"
                            }`} />
                            {inv.due <= 0 ? "Paid" : inv.paid > 0 ? "Partial" : "Unpaid"}
                          </span>
                        )}
                        {dead ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status] || "bg-muted text-muted-foreground"}`}>
                            {inv.status}
                          </span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium
                                                 border border-border text-foreground/80 hover:bg-muted transition-colors">
                                {inv.status} <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="text-sm min-w-[150px]">
                              {inv.status !== "draft" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "draft")}>Draft</DropdownMenuItem>}
                              {inv.status !== "finalized" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "finalized")}>Finalized</DropdownMenuItem>}
                              {inv.type === "sale" && inv.status !== "dispatched" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "dispatched")}>Dispatched</DropdownMenuItem>}
                              {inv.type === "sale" && inv.status !== "delivered" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "delivered")}>Delivered</DropdownMenuItem>}
                              <DropdownMenuSeparator />
                              {inv.status !== "void" && <DropdownMenuItem className="text-muted-foreground" onClick={() => changeStatus(inv.id, "void")}>Void</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {/* Ten coloured icons on every row made the action column
                          the loudest thing on the page and still left you
                          hovering each one to learn what it did. Two actions
                          stay out — the one you came to do, and the one you do
                          most — and the rest are a named menu. The column is
                          also quiet until the row is under the cursor. */}
                      <div className="row-actions inline-flex items-center justify-end gap-0.5">
                        {canReceive(inv) && (
                          <Button size="icon" variant="ghost" title={`Receive payment — balance ${inr(inv.due)}`}
                            onClick={() => setReceiveTarget(inv)}
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                            <IndianRupee className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => nav(`/sales/${inv.id}`)} title="View"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" title="More actions"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              data-testid={`row-more-${inv.invoice_no}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[200px] text-sm">
                            {!dead && (
                              <DropdownMenuItem onClick={() => nav(`/sales/${inv.id}/edit`)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => nav(`/sales/new?clone=${inv.id}`)} data-testid="clone-invoice">
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadPdf(inv)}>
                              <FileDown className="mr-2 h-3.5 w-3.5" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => shareWhatsApp(inv)}>
                              <Share2 className="mr-2 h-3.5 w-3.5" /> Share on WhatsApp
                            </DropdownMenuItem>
                            {inv.type === "sale" && !["cancelled", "void", "draft"].includes(inv.status) && (
                              <DropdownMenuItem onClick={() => setEwbTarget(inv)}>
                                <Truck className="mr-2 h-3.5 w-3.5" /> Generate e-way bill
                              </DropdownMenuItem>
                            )}
                            {zohoOn && inv.type === "sale" && !["cancelled", "void", "draft"].includes(inv.status) && (
                              <DropdownMenuItem disabled={pushing === inv.id || !!inv.zoho_invoice_id}
                                onClick={() => pushToZoho(inv)}>
                                <Upload className="mr-2 h-3.5 w-3.5" />
                                {inv.zoho_invoice_id ? "Already in Zoho" : "Send to Zoho"}
                              </DropdownMenuItem>
                            )}
                            {!dead && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-rose-600 focus:text-rose-600"
                                  onClick={() => setCancelTarget(inv)}>
                                  <Ban className="mr-2 h-3.5 w-3.5" /> Cancel invoice
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );})}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.invoice_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The invoice will be marked as cancelled. It stays in your records but cannot be
              edited or used for payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { const t = cancelTarget; setCancelTarget(null); cancel(t.id); }}>
              Yes, cancel invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoiceActionsSheet
        inv={sheetInv}
        onClose={() => setSheetInv(null)}
        zohoOn={zohoOn}
        pushing={pushing}
        canReceive={canReceive}
        onView={(i) => nav(`/sales/${i.id}`)}
        onEdit={(i) => nav(`/sales/${i.id}/edit`)}
        onClone={(i) => nav(`/sales/new?clone=${i.id}`)}
        onReceive={(i) => setReceiveTarget(i)}
        onEwb={(i) => setEwbTarget(i)}
        onZoho={pushToZoho}
        onPdf={downloadPdf}
        onShare={shareWhatsApp}
        onStatus={changeStatus}
        onCancel={cancel}
      />

      {receiveTarget && (
        <PaymentDialog
          open={!!receiveTarget}
          onClose={() => setReceiveTarget(null)}
          direction="received"
          defaultPartyId={receiveTarget.party_id}
          defaultAmount={receiveTarget.due}
          initialData={{
            direction: "received",
            party_id: receiveTarget.party_id,
            amount: receiveTarget.due,
            invoice_id: receiveTarget.id,
            linked_type: "invoice",
            linked_ref: receiveTarget.invoice_no,
          }}
          onSaved={() => { setReceiveTarget(null); load(); }}
        />
      )}

      <EwayBillDialog
        invoiceId={ewbTarget?.id}
        invoiceNo={ewbTarget?.invoice_no}
        open={!!ewbTarget}
        onOpenChange={(o) => { if (!o) setEwbTarget(null); }}
      />
    </div>
  );
}
