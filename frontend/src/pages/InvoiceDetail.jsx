import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Share2, Wallet, ArrowRightLeft, FileJson, AlertTriangle, CheckCircle2 } from "lucide-react";
import { inr, fmtDate, todayISO } from "@/lib/format";

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: 0, mode: "Cash", date: todayISO(), reference: "" });
  const [eiOpen, setEiOpen] = useState(false);
  const [eiResult, setEiResult] = useState(null);
  const [eiLoading, setEiLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/invoices/${id}`);
    setInv(data);
    setPay(p => ({ ...p, amount: data.due }));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!inv) return null;

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.invoice_no}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("PDF download failed"); }
  };

  const generateEinvoice = async () => {
    setEiOpen(true); setEiLoading(true); setEiResult(null);
    try {
      const { data } = await api.get(`/invoices/${id}/einvoice`);
      setEiResult(data);
    } catch (e) {
      setEiResult({ ok: false, errors: [e?.response?.data?.detail || "Failed to generate"], warnings: [] });
    } finally { setEiLoading(false); }
  };

  const downloadEinvoiceJson = () => {
    if (!eiResult?.payload) return;
    const blob = new Blob([JSON.stringify(eiResult.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `EINV-${inv.invoice_no.replace(/[\/\s]+/g, '_')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shareWA = () => {
    const phone = (inv.party_snapshot?.phone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${inv.party_snapshot?.name}, your invoice ${inv.invoice_no} for ₹${inv.totals.grand_total.toFixed(2)} is ready. Thank you!`);
    window.open(phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
  };
  const recordPayment = async () => {
    try {
      await api.post("/payments", {
        party_id: inv.party_id, direction: "received", amount: parseFloat(pay.amount || 0),
        mode: pay.mode, date: pay.date, reference: pay.reference, invoice_id: inv.id,
      });
      toast.success("Payment recorded");
      setPayOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const convertQuote = async () => {
    try {
      const { data } = await api.post(`/invoices/${id}/convert`);
      toast.success("Converted to invoice");
      nav(`/sales/${data.id}`);
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="invoice-detail-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
        <div className="flex gap-2 flex-wrap">
          {inv.type === "quotation" && <Button variant="outline" onClick={convertQuote} data-testid="convert-quote-button"><ArrowRightLeft className="h-4 w-4 mr-1.5" /> Convert to Invoice</Button>}
          {inv.due > 0 && inv.type === "sale" && <Button onClick={() => setPayOpen(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="record-payment-button"><Wallet className="h-4 w-4 mr-1.5" /> Record Payment</Button>}
          <Button variant="outline" onClick={async () => {
            const { data } = await api.post(`/invoices/${id}/share-link`);
            const url = `${window.location.origin}${data.path}`;
            try { await navigator.clipboard.writeText(url); } catch {}
            toast.success("Share link copied to clipboard");
          }} data-testid="copy-share-link"><ArrowRightLeft className="h-4 w-4 mr-1.5" /> Copy share link</Button>
          <Button variant="outline" onClick={shareWA} data-testid="share-whatsapp-button"><Share2 className="h-4 w-4 mr-1.5" /> WhatsApp</Button>
          <Button variant="outline" onClick={downloadPdf} data-testid="download-pdf-button"><FileDown className="h-4 w-4 mr-1.5" /> Download PDF</Button>
          {inv.type === "sale" && (
            <Button variant="outline" onClick={generateEinvoice} data-testid="einvoice-button" className="border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30">
              <FileJson className="h-4 w-4 mr-1.5" /> E-Invoice JSON
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{inv.invoice_no}</h1>
            <div className="text-sm text-muted-foreground mt-1">
              <Badge>{inv.type}</Badge> · <Badge variant="secondary">{inv.status}</Badge> · {fmtDate(inv.invoice_date)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Grand Total</div>
            <div className="font-mono-fin text-3xl font-semibold text-blue-600">{inr(inv.totals.grand_total)}</div>
            <div className="text-xs mt-1">Paid: <span className="font-mono-fin">{inr(inv.paid)}</span> · Due: <span className="font-mono-fin text-rose-600">{inr(inv.due)}</span></div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Bill To</div>
            <div className="font-medium">{inv.party_snapshot?.name}</div>
            <div className="text-muted-foreground">{inv.party_snapshot?.billing_address}</div>
            <div className="text-muted-foreground">GSTIN: {inv.party_snapshot?.gstin || "—"}</div>
            <div className="text-muted-foreground">{inv.party_snapshot?.phone}</div>
          </div>
          <div className="text-sm sm:text-right">
            <div>Date: <span className="font-medium">{fmtDate(inv.invoice_date)}</span></div>
            <div>Due: <span className="font-medium">{fmtDate(inv.due_date)}</span></div>
            <div>Place of Supply: <span className="font-medium">{inv.party_snapshot?.state}</span></div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc</th><th>Taxable</th><th>GST%</th>
              {inv.same_state ? <><th>CGST</th><th>SGST</th></> : <th>IGST</th>}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><div className="font-medium">{it.name}</div></td>
                  <td className="font-mono-fin text-xs">{it.hsn || "—"}</td>
                  <td className="num">{it.qty} {it.unit}</td>
                  <td className="num">{inr(it.rate)}</td>
                  <td className="num">{inr(it.discount)}</td>
                  <td className="num">{inr(it.taxable)}</td>
                  <td className="num">{it.gst_rate}%</td>
                  {inv.same_state ? <><td className="num">{inr(it.cgst)}</td><td className="num">{inr(it.sgst)}</td></> : <td className="num">{inr(it.igst)}</td>}
                  <td className="num font-semibold">{inr(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <div className="text-sm text-muted-foreground whitespace-pre-line">{inv.notes}</div>
          <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
            <Row label="Subtotal" value={inv.totals.subtotal} />
            <Row label="Discount" value={-inv.totals.discount} />
            <Row label="Taxable Amount" value={inv.totals.taxable_amount} />
            {inv.same_state ? (<>
              <Row label="CGST" value={inv.totals.cgst} />
              <Row label="SGST" value={inv.totals.sgst} />
            </>) : <Row label="IGST" value={inv.totals.igst} />}
            <Row label="Round Off" value={inv.totals.round_off} />
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="font-semibold">Grand Total</span>
              <span className="font-mono-fin font-semibold text-lg">{inr(inv.totals.grand_total)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} data-testid="payment-amount-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={pay.mode} onValueChange={(v) => setPay({ ...pay, mode: v })}>
                <SelectTrigger data-testid="payment-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Cash","Bank Transfer","UPI","Cheque","Card"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} data-testid="payment-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UPI/Cheque #" data-testid="payment-ref-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={recordPayment} className="bg-blue-600 hover:bg-blue-700" data-testid="payment-save-button">Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E-Invoice JSON dialog */}
      <Dialog open={eiOpen} onOpenChange={setEiOpen}>
        <DialogContent className="max-w-3xl" data-testid="einvoice-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-4 w-4" /> E-Invoice JSON (Schema 1.1)
            </DialogTitle>
          </DialogHeader>
          {eiLoading && <div className="py-6 text-center text-sm text-muted-foreground">Generating…</div>}
          {eiResult && !eiResult.ok && (
            <div className="space-y-2" data-testid="einvoice-errors">
              <div className="flex items-center gap-2 text-rose-600 font-semibold"><AlertTriangle className="h-4 w-4" /> Cannot generate — fix these first:</div>
              <ul className="text-sm list-disc pl-6 space-y-1">
                {eiResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {eiResult?.ok && (
            <div className="space-y-3" data-testid="einvoice-ok">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> JSON ready — upload to the IRP portal or your GSP/ASP service.
              </div>
              {eiResult.warnings.length > 0 && (
                <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-5">
                  {eiResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <pre className="bg-muted rounded-md p-3 text-[11px] max-h-80 overflow-auto font-mono">
                {JSON.stringify(eiResult.payload, null, 2)}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEiOpen(false)}>Close</Button>
            {eiResult?.ok && (
              <Button onClick={downloadEinvoiceJson} className="bg-blue-600 hover:bg-blue-700" data-testid="einvoice-download-btn">
                <FileDown className="h-4 w-4 mr-1.5" /> Download JSON
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-fin">{inr(value)}</span>
    </div>
  );
}
