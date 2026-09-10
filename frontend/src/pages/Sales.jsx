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
import { Plus, Search, Ban, Eye, FileDown, Share2, ChevronRight, FileText, Pencil, ChevronDown, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/pages/Payments";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export default function Sales() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [receiveTarget, setReceiveTarget] = useState(null); // invoice to record a receipt against
  const canReceive = (inv) => inv.type === "sale" && inv.due > 0.5 && !["cancelled", "void", "draft"].includes(inv.status);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const p = {};
    if (statusFilter !== "all") p.status = statusFilter;
    if (typeFilter !== "all") p.type = typeFilter;
    const { data } = await api.get("/invoices", { params: p });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter, typeFilter]); // eslint-disable-line

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

      {/* ── Mobile card list ── */}
      <div className="mobile-only mobile-list-gap">
        {loading
          ? [1,2,3,4].map(i => <div key={i} className="mobile-list-card"><Skeleton className="h-10 w-full" /></div>)
          : filtered.length === 0
            ? <div className="text-center text-muted-foreground py-12 text-sm">No invoices yet.</div>
            : filtered.map(inv => (
              <div key={inv.id} className="mobile-list-card" onClick={() => nav(`/sales/${inv.id}`)}>
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-blue-600 truncate">{inv.invoice_no}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_COLOR[inv.status] || "bg-muted text-muted-foreground"}`}>{inv.status}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{inv.party_name || "Walk-in"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(inv.invoice_date)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="mobile-amount text-foreground">{inr(inv.totals?.grand_total)}</p>
                  {inv.due > 0
                    ? <p className="text-xs text-rose-500 font-semibold">Due {inr(inv.due)}</p>
                    : <p className="text-xs text-emerald-600 font-semibold">Paid</p>
                  }
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {canReceive(inv) && (
                    <button onClick={(e) => { e.stopPropagation(); setReceiveTarget(inv); }} title="Receive payment"
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100">
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); downloadPdf(inv); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80">
                    <FileDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); shareWhatsApp(inv); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20 hover:bg-green-100">
                    <Share2 className="w-3.5 h-3.5 text-green-600" />
                  </button>
                </div>
              </div>
            ))
        }
      </div>

      {/* ── Desktop table ── */}
      <Card className="desktop-only">
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr>
              <th>Invoice #</th><th>Type</th><th>Customer</th><th>Date</th><th>Due</th>
              <th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {loading ? [1,2,3,4].map(i => <tr key={i}><td colSpan={10}><Skeleton className="h-8 w-full" /></td></tr>) :
                filtered.length === 0 ? <tr><td colSpan={10} className="text-center text-muted-foreground py-8">No invoices.</td></tr> :
                filtered.map(inv => (
                  <tr key={inv.id} data-testid={`invoice-row-${inv.invoice_no}`}>
                    <td className="font-mono-fin text-blue-600 font-medium">{inv.invoice_no}</td>
                    <td><Badge variant="secondary">{inv.type}</Badge></td>
                    <td className="font-medium">{inv.party_name}</td>
                    <td className="text-muted-foreground">{fmtDate(inv.invoice_date)}</td>
                    <td className="text-muted-foreground">{fmtDate(inv.due_date)}</td>
                    <td className="num">{inr(inv.totals?.grand_total)}</td>
                    <td className="num">{inr(inv.paid)}</td>
                    <td className="num">{inv.due > 0 ? <span className="text-rose-600 font-semibold">{inr(inv.due)}</span> : <Badge className="bg-emerald-600">Paid</Badge>}</td>
                    <td>
                      {/* Payment status badge */}
                      {inv.status !== "cancelled" && inv.status !== "void" && inv.status !== "draft" && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold mr-1 ${
                          inv.due <= 0 ? "bg-emerald-100 text-emerald-700" :
                          inv.paid > 0 ? "bg-amber-100 text-amber-700" :
                          "bg-rose-100 text-rose-700"
                        }`}>
                          {inv.due <= 0 ? "Paid" : inv.paid > 0 ? "Partial" : "Unpaid"}
                        </span>
                      )}
                      {inv.status === "cancelled" || inv.status === "void" ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status] || "bg-muted text-muted-foreground"}`}>
                          {inv.status}
                        </span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLOR[inv.status] || "bg-muted text-muted-foreground"}`}>
                              {inv.status} <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="text-sm min-w-[160px]">
                            {inv.status !== "draft" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "draft")}>📝 Draft</DropdownMenuItem>}
                            {inv.status !== "finalized" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "finalized")}>✅ Finalized</DropdownMenuItem>}
                            {inv.type === "sale" && inv.status !== "dispatched" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "dispatched")}>🚚 Dispatched</DropdownMenuItem>}
                            {inv.type === "sale" && inv.status !== "delivered" && <DropdownMenuItem onClick={() => changeStatus(inv.id, "delivered")}>📦 Delivered</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            {inv.status !== "void" && <DropdownMenuItem className="text-slate-500" onClick={() => changeStatus(inv.id, "void")}>🚫 Void</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canReceive(inv) && (
                        <Button size="icon" variant="ghost" title={`Receive payment — balance ${inr(inv.due)}`}
                          onClick={() => setReceiveTarget(inv)}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                          <IndianRupee className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => nav(`/sales/${inv.id}`)} title="View"><Eye className="h-4 w-4" /></Button>
                      {inv.status !== "cancelled" && inv.status !== "void" && (
                        <Button size="icon" variant="ghost" onClick={() => nav(`/sales/${inv.id}/edit`)} title="Edit"><Pencil className="h-4 w-4 text-blue-500" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => downloadPdf(inv)}><FileDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => shareWhatsApp(inv)}><Share2 className="h-4 w-4" /></Button>
                      {inv.status !== "cancelled" && inv.status !== "void" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Cancel invoice"><Ban className="h-4 w-4 text-rose-500" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel {inv.invoice_no}?</AlertDialogTitle>
                              <AlertDialogDescription>The invoice will be marked as cancelled. It will remain in your records but cannot be edited or used for payments.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => cancel(inv.id)}>Yes, Cancel Invoice</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

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
    </div>
  );
}
