import { useState } from "react";
import api from "@/lib/api";
import { downloadFile } from "@/lib/mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, FileDown, CheckCircle2, AlertTriangle } from "lucide-react";

const todayISO = () => new Date().toISOString().slice(0, 10);

const blank = () => ({
  transMode: "1",       // 1=Road, 2=Rail, 3=Air, 4=Ship
  transName: "",
  transporterId: "",
  transDocNo: "",
  transDocDate: todayISO(),
  vehNo: "",
  vehType: "R",         // R=Regular, O=Over Dimensional
  distance: "",
  supplyType: "O",      // O=Outward, I=Inward
  subSupplyType: "1",   // 1=Supply, 3=Export, ...
});

/** Raise the NIC e-way bill payload for one invoice, and download it.
 *  Used both from the invoice list and from the invoice itself. */
export default function EwayBillDialog({ invoiceId, invoiceNo, open, onOpenChange }) {
  const [form, setForm] = useState(blank());
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/invoices/${invoiceId}/eway-bill`, form);
      setResult(data);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
        : (detail || "Failed to generate");
      setResult({ ok: false, errors: [msg] });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result?.payload) return;
    const safe = String(invoiceNo || invoiceId).replace(/[/\s]+/g, "_");
    const blob = new Blob([JSON.stringify(result.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `EWB-${safe}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const change = (o) => {
    if (!o) { setResult(null); setForm(blank()); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-2xl" data-testid="eway-bill-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-green-600" /> E-Way Bill{invoiceNo ? ` — ${invoiceNo}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Supply Type</Label>
                <Select value={form.supplyType} onValueChange={set("supplyType")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="O">Outward (Sales)</SelectItem>
                    <SelectItem value="I">Inward (Purchase Return)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub Supply Type</Label>
                <Select value={form.subSupplyType} onValueChange={set("subSupplyType")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Supply</SelectItem>
                    <SelectItem value="3">Export</SelectItem>
                    <SelectItem value="4">Job Work</SelectItem>
                    <SelectItem value="5">For Own Use</SelectItem>
                    <SelectItem value="10">Sales Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Transport Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Mode of Transport</Label>
                  <Select value={form.transMode} onValueChange={set("transMode")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">🚛 Road</SelectItem>
                      <SelectItem value="2">🚂 Rail</SelectItem>
                      <SelectItem value="3">✈️ Air</SelectItem>
                      <SelectItem value="4">🚢 Ship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Distance (km)</Label>
                  <Input type="number" min="1" placeholder="e.g. 250"
                    value={form.distance} onChange={(e) => set("distance")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Transporter Name</Label>
                  <Input placeholder="e.g. Fast Cargo Pvt Ltd"
                    value={form.transName} onChange={(e) => set("transName")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Transporter GSTIN / ID</Label>
                  <Input placeholder="15-digit transporter ID" className="uppercase"
                    value={form.transporterId} onChange={(e) => set("transporterId")(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>LR / RR / Doc No.</Label>
                  <Input placeholder="Transport document number"
                    value={form.transDocNo} onChange={(e) => set("transDocNo")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Transport Doc Date</Label>
                  <Input type="date" value={form.transDocDate}
                    onChange={(e) => set("transDocDate")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vehicle Number</Label>
                  <Input placeholder="e.g. TN01AB1234" className="uppercase"
                    value={form.vehNo} onChange={(e) => set("vehNo")(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vehicle Type</Label>
                  <Select value={form.vehType} onValueChange={set("vehType")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="R">Regular</SelectItem>
                      <SelectItem value="O">Over Dimensional Cargo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-3 text-xs text-blue-700 dark:text-blue-300">
              💡 E-Way Bill is required when goods value exceeds ₹50,000. This generates the JSON payload — upload it to <strong>ewaybillgst.gov.in</strong> or your GSP portal.
            </div>
          </div>
        ) : result.ok ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
              <CheckCircle2 className="h-4 w-4" /> E-Way Bill JSON ready — upload to ewaybillgst.gov.in or your GSP.
            </div>
            {(result.warnings || []).length > 0 && (
              <ul className="text-xs text-amber-600 list-disc pl-5 space-y-0.5">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <pre className="bg-muted rounded-md p-3 text-[11px] max-h-80 overflow-auto font-mono">
              {JSON.stringify(result.payload, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-600 font-semibold">
              <AlertTriangle className="h-4 w-4" /> Cannot generate — fix these first:
            </div>
            <ul className="text-sm list-disc pl-6 space-y-1">
              {(result.errors || []).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            <Button variant="outline" size="sm" onClick={() => setResult(null)} className="mt-2">← Back</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)}>Close</Button>
          {!result && (
            <Button onClick={generate} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white" data-testid="eway-generate">
              <Truck className="h-4 w-4 mr-1.5" /> {busy ? "Generating…" : "Generate"}
            </Button>
          )}
          {result?.ok && (
            <Button onClick={download} className="bg-blue-600 hover:bg-blue-700" data-testid="eway-download">
              <FileDown className="h-4 w-4 mr-1.5" /> Download JSON
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
