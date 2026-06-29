import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { inr } from "@/lib/format";

function thisMonth() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function GST() {
  const [month, setMonth] = useState(thisMonth());
  const [gstr1, setGstr1] = useState(null);
  const [gstr3b, setGstr3b] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [r1, r3] = await Promise.all([
      api.get("/gst/gstr1", { params: { month } }),
      api.get("/gst/gstr3b", { params: { month } }),
    ]);
    setGstr1(r1.data); setGstr3b(r3.data); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const exportJson = () => {
    const data = { month, gstr1, gstr3b };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `gst-${month}.json`; a.click();
    URL.revokeObjectURL(url); toast.success("Exported");
  };

  return (
    <div className="space-y-6" data-testid="gst-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">GST Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Monthly summary for your CA — GSTR-1 (your sales), GSTR-3B (net GST to pay) and HSN totals. Download JSON to upload on the GST portal.</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" data-testid="gst-month-input" />
          <Button variant="outline" onClick={exportJson} data-testid="gst-export-json"><Download className="h-4 w-4 mr-1.5" /> Export JSON</Button>
        </div>
      </div>

      {loading ? <Skeleton className="h-40 w-full" /> : (
        <>
          {/* GSTR-3B summary */}
          <Card className="p-5">
            <h2 className="font-semibold text-lg mb-3">GSTR-3B Summary — {month}</h2>
            <div className="grid sm:grid-cols-4 gap-3">
              <Metric label="Output Taxable" value={gstr3b.outward.taxable} />
              <Metric label="Output GST" value={gstr3b.outward.cgst + gstr3b.outward.sgst + gstr3b.outward.igst} />
              <Metric label="Input GST (ITC)" value={gstr3b.itc.cgst + gstr3b.itc.sgst + gstr3b.itc.igst} />
              <Metric label="Net Payable" value={gstr3b.net_payable.total} highlight />
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <Metric label="CGST Payable" value={gstr3b.net_payable.cgst} />
              <Metric label="SGST Payable" value={gstr3b.net_payable.sgst} />
              <Metric label="IGST Payable" value={gstr3b.net_payable.igst} />
            </div>
          </Card>

          {/* GSTR-1 tabs */}
          <Tabs defaultValue="b2b">
            <TabsList>
              <TabsTrigger value="b2b" data-testid="gst-tab-b2b">B2B ({gstr1.b2b.length})</TabsTrigger>
              <TabsTrigger value="b2c" data-testid="gst-tab-b2c">B2C ({gstr1.b2c.length})</TabsTrigger>
              <TabsTrigger value="hsn" data-testid="gst-tab-hsn">HSN ({gstr1.hsn.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="b2b"><InvTable rows={gstr1.b2b} /></TabsContent>
            <TabsContent value="b2c"><InvTable rows={gstr1.b2c} /></TabsContent>
            <TabsContent value="hsn"><HsnTable rows={gstr1.hsn} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border border-border p-4 ${highlight ? "bg-blue-600/10 border-blue-600/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono-fin text-xl font-semibold mt-1 ${highlight ? "text-blue-700" : ""}`}>{inr(value)}</div>
    </div>
  );
}

function InvTable({ rows }) {
  return (
    <Card className="mt-3"><div className="overflow-x-auto"><table className="app-table">
      <thead><tr><th>Invoice</th><th>Date</th><th>Party</th><th>GSTIN</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No data.</td></tr> :
          rows.map((r, i) => (
            <tr key={i}>
              <td className="font-mono-fin text-blue-600">{r.invoice_no}</td>
              <td className="text-muted-foreground">{r.date}</td>
              <td className="font-medium">{r.party}</td>
              <td className="font-mono-fin text-xs">{r.gstin || <Badge variant="secondary">B2C</Badge>}</td>
              <td className="num">{inr(r.taxable)}</td>
              <td className="num">{inr(r.cgst)}</td>
              <td className="num">{inr(r.sgst)}</td>
              <td className="num">{inr(r.igst)}</td>
              <td className="num font-semibold">{inr(r.total)}</td>
            </tr>
          ))}
      </tbody>
    </table></div></Card>
  );
}

function HsnTable({ rows }) {
  return (
    <Card className="mt-3"><div className="overflow-x-auto"><table className="app-table">
      <thead><tr><th>HSN</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No data.</td></tr> :
          rows.map((r, i) => (
            <tr key={i}>
              <td className="font-mono-fin">{r.hsn}</td>
              <td className="font-medium">{r.description}</td>
              <td className="num">{r.qty}</td>
              <td className="num">{inr(r.taxable)}</td>
              <td className="num">{inr(r.cgst)}</td>
              <td className="num">{inr(r.sgst)}</td>
              <td className="num">{inr(r.igst)}</td>
              <td className="num font-semibold">{inr(r.total)}</td>
            </tr>
          ))}
      </tbody>
    </table></div></Card>
  );
}
