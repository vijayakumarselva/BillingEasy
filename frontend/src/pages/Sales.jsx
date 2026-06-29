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
import { Plus, Search, Trash2, Eye, FileDown, Share2 } from "lucide-react";
import { inr, fmtDate } from "@/lib/format";

export default function Sales() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [params] = useSearchParams();
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const p = {};
    if (statusFilter !== "all") p.status = statusFilter;
    if (typeFilter !== "all") p.type = typeFilter;
    const { data } = await api.get("/invoices", { params: p });
    setList(data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, typeFilter]);

  const filtered = list.filter(i =>
    !search ||
    i.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
    (i.party_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const remove = async (id) => { await api.delete(`/invoices/${id}`); toast.success("Deleted"); load(); };

  const tokenParam = `?_t=${encodeURIComponent(localStorage.getItem("be_token") || "")}`;
  const pdfUrl = (id) => `${API_BASE}/invoices/${id}/pdf`;

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
    const msg = encodeURIComponent(`Hi ${inv.party_name}, your invoice ${inv.invoice_no} for ₹${inv.totals.grand_total.toFixed(2)} is ready. Thank you!`);
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6" data-testid="sales-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales / Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Create GST invoices, download PDF, and share on WhatsApp in one click.</p>
        </div>
        <Button onClick={() => nav("/sales/new")} className="bg-blue-600 hover:bg-blue-700" data-testid="invoice-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invoice # or party…" value={search}
            onChange={(e) => setSearch(e.target.value)} data-testid="invoice-search-input" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44" data-testid="invoice-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="sale">Sale Invoice</SelectItem>
            <SelectItem value="quotation">Quotation</SelectItem>
            <SelectItem value="credit_note">Credit Note</SelectItem>
            <SelectItem value="sales_return">Sales Return</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="invoice-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="finalized">Finalized</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr>
              <th>Invoice #</th><th>Type</th><th>Customer</th><th>Date</th><th>Due</th>
              <th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th><th></th>
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
                    <td className="num">{inr(inv.totals.grand_total)}</td>
                    <td className="num">{inr(inv.paid)}</td>
                    <td className="num">{inv.due > 0 ? <span className="text-rose-600 font-semibold">{inr(inv.due)}</span> : <Badge className="bg-emerald-600">Paid</Badge>}</td>
                    <td><Badge variant={inv.status === "finalized" ? "default" : "secondary"}>{inv.status}</Badge></td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => nav(`/sales/${inv.id}`)} data-testid={`inv-view-${inv.invoice_no}`}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => downloadPdf(inv)} data-testid={`inv-pdf-${inv.invoice_no}`}><FileDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => shareWhatsApp(inv)} data-testid={`inv-wa-${inv.invoice_no}`}><Share2 className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`inv-del-${inv.invoice_no}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
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
