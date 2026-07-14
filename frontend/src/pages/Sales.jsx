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
import { Plus, Search, Trash2, Eye, FileDown, Share2, ChevronRight, FileText } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

const STATUS_COLOR = {
  finalized: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};

export default function Sales() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
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

  const remove = async (id) => { await api.delete(`/invoices/${id}`); toast.success("Deleted"); load(); };

  const downloadPdf = async (inv) => {
    try {
      const res = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.invoice_no}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch { toast.error("PDF download failed"); }
  };

  const shareWhatsApp = (inv) => {
    const phone = (inv.party_snapshot?.phone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${inv.party_name}, your invoice ${inv.invoice_no} for ₹${inv.totals?.grand_total?.toFixed(2)} is ready. Thank you!`);
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
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
              <SelectItem value="draft">Draft</SelectItem>
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
                    <td><Badge variant={inv.status === "finalized" ? "default" : "secondary"}>{inv.status}</Badge></td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => nav(`/sales/${inv.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => downloadPdf(inv)}><FileDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => shareWhatsApp(inv)}><Share2 className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete {inv.invoice_no}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(inv.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
