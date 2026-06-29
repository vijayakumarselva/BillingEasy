// Public read-only invoice view served via share token.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/Logo";
import { inr, fmtDate } from "@/lib/format";
import { FileDown } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PublicInvoice() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/invoices/${token}`)
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.detail || "Invoice not found"));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="p-8 max-w-md text-center">
          <h2 className="font-semibold text-lg mb-2">Invoice not available</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  const { invoice, business } = data;
  const same = invoice.same_state;

  const downloadPdf = async () => {
    const res = await axios.get(`${API}/public/invoices/${token}/pdf`, { responseType: "blob" });
    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${invoice.invoice_no}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="public-invoice-page">
      <header className="bg-white dark:bg-slate-900 border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="font-semibold" style={{ fontFamily: "Outfit, sans-serif" }}>Bill<span className="text-blue-600">Easy</span></span>
        </div>
        <Button onClick={downloadPdf} className="bg-blue-600 hover:bg-blue-700" data-testid="public-download-pdf">
          <FileDown className="h-4 w-4 mr-1.5" /> Download PDF
        </Button>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <Card className="p-6 sm:p-10">
          <div className="flex justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#1D4ED8" }}>{business?.name}</h1>
              <div className="text-xs text-muted-foreground mt-1">{business?.address}</div>
              <div className="text-xs text-muted-foreground">GSTIN: {business?.gstin || "—"}</div>
            </div>
            <div className="text-right">
              <Badge className="bg-blue-600">{invoice.type === "sale" ? "TAX INVOICE" : invoice.type.toUpperCase()}</Badge>
              <div className="font-mono-fin font-semibold text-lg mt-2">{invoice.invoice_no}</div>
              <div className="text-xs text-muted-foreground">Date: {fmtDate(invoice.invoice_date)}</div>
              <div className="text-xs text-muted-foreground">Due: {fmtDate(invoice.due_date)}</div>
            </div>
          </div>

          <div className="rounded-md border border-border p-4 mb-6">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill to</div>
            <div className="font-semibold mt-1">{invoice.party_snapshot?.name}</div>
            <div className="text-xs text-muted-foreground">{invoice.party_snapshot?.billing_address}</div>
            <div className="text-xs text-muted-foreground">GSTIN: {invoice.party_snapshot?.gstin || "—"}</div>
          </div>

          <div className="overflow-x-auto mb-4">
            <table className="app-table">
              <thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th>
                {same ? <><th>CGST</th><th>SGST</th></> : <th>IGST</th>}<th className="text-right">Total</th></tr></thead>
              <tbody>
                {invoice.items.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td className="font-medium">{it.name}</td>
                    <td className="font-mono-fin text-xs">{it.hsn || "—"}</td>
                    <td className="num">{it.qty} {it.unit}</td>
                    <td className="num">{inr(it.rate)}</td>
                    <td className="num">{inr(it.taxable)}</td>
                    {same ? <><td className="num">{inr(it.cgst)}</td><td className="num">{inr(it.sgst)}</td></> : <td className="num">{inr(it.igst)}</td>}
                    <td className="num font-semibold">{inr(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-1 text-sm">
              <Row label="Taxable" value={invoice.totals.taxable_amount} />
              {same ? (<><Row label="CGST" value={invoice.totals.cgst} /><Row label="SGST" value={invoice.totals.sgst} /></>)
                    : <Row label="IGST" value={invoice.totals.igst} />}
              <div className="flex justify-between border-t border-border pt-2 mt-2">
                <span className="font-semibold">Grand Total</span>
                <span className="font-mono-fin font-semibold text-xl text-blue-600">{inr(invoice.totals.grand_total)}</span>
              </div>
              <Row label="Paid" value={invoice.paid} />
              <Row label="Due" value={invoice.due} />
            </div>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-6 text-xs text-muted-foreground">
            <div>
              <div className="font-semibold text-foreground mb-1">Bank Details</div>
              <div>{business?.bank_name} · {business?.bank_account}</div>
              <div>IFSC: {business?.bank_ifsc}</div>
            </div>
            <div>
              <div className="font-semibold text-foreground mb-1">Terms</div>
              <div className="whitespace-pre-line">{business?.terms}</div>
            </div>
          </div>
        </Card>
      </main>
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
