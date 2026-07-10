import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, CheckCircle2, XCircle, Link2, Trash2, FileText } from "lucide-react";
import DropZone from "@/components/DropZone";
import { inr, fmtDate } from "@/lib/format";

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));

  const findCol = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));
  const dateIdx    = findCol("date");
  const descIdx    = findCol("description", "narration", "particulars", "remarks");
  const debitIdx   = findCol("debit", "withdrawal", "dr");
  const creditIdx  = findCol("credit", "deposit", "cr");
  const balanceIdx = findCol("balance");

  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/['"]/g, ""));
    const parseAmt = i => i >= 0 ? parseFloat(cols[i]?.replace(/,/g, "") || "0") || 0 : 0;
    return {
      date:        cols[dateIdx]  || "",
      description: cols[descIdx] || "",
      debit:       parseAmt(debitIdx),
      credit:      parseAmt(creditIdx),
      balance:     parseAmt(balanceIdx),
    };
  }).filter(r => r.date && r.description);
}

export default function BankStatement() {
  const [banks, setBanks]       = useState([]);
  const [bankId, setBankId]     = useState("");
  const [rows, setRows]         = useState([]);
  const [preview, setPreview]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get("/bank-accounts").then(r => { setBanks(r.data); if (r.data[0]) setBankId(r.data[0].id); });
  }, []);

  useEffect(() => {
    if (bankId) loadRows();
    // eslint-disable-next-line
  }, [bankId]);

  const loadRows = async () => {
    setLoading(true);
    const { data } = await api.get("/bank-statement", { params: { bank_account_id: bankId } });
    setRows(data);
    setLoading(false);
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if (!parsed.length) { toast.error("Could not parse CSV. Check column headers."); return; }
      setPreview(parsed);
      toast.success(`${parsed.length} rows parsed — review and upload`);
    };
    reader.readAsText(file);
  };

  const uploadRows = async () => {
    if (!bankId) { toast.error("Select a bank account first"); return; }
    setUploading(true);
    try {
      const { data } = await api.post("/bank-statement/upload", { bank_account_id: bankId, rows: preview });
      toast.success(`Uploaded ${data.uploaded} rows — ${data.matched} auto-matched!`);
      setPreview([]);
      fileRef.current.value = "";
      loadRows();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteRow = async (id) => {
    await api.delete(`/bank-statement/${id}`);
    setRows(r => r.filter(x => x.id !== id));
  };

  const matched   = rows.filter(r => r.matched).length;
  const unmatched = rows.filter(r => !r.matched).length;
  const totalIn   = rows.reduce((s, r) => s + r.credit, 0);
  const totalOut  = rows.reduce((s, r) => s + r.debit, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bank Statement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your bank CSV — we auto-match credits to customer invoices and debits to vendor purchases.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={bankId} onValueChange={setBankId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select bank account" />
          </SelectTrigger>
          <SelectContent>
            {banks.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.bank_name} – {b.account_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="cursor-pointer">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
          <Button variant="outline" asChild>
            <span><Upload className="h-4 w-4 mr-1.5" /> Upload CSV</span>
          </Button>
        </label>
        {banks.length === 0 && (
          <p className="text-sm text-amber-600">Add a bank account in Settings → Banking first.</p>
        )}
      </div>

      <DropZone
        accept=".csv"
        onFile={(f) => onFile({ target: { files: [f] } })}
        label="Drag & drop your bank CSV here"
        hint="CSV file from your bank · or use the Upload CSV button above"
        icon={FileText}
        compact
      />

      {/* CSV Format hint */}
      <Card className="p-4 bg-blue-50 border-blue-100">
        <p className="text-xs text-blue-700 font-medium mb-1">Expected CSV columns (header row required):</p>
        <code className="text-xs text-blue-600">Date, Description, Debit, Credit, Balance</code>
        <p className="text-xs text-blue-500 mt-1">Column names are flexible — "Narration", "Withdrawal", "Deposit" etc. are also recognised.</p>
      </Card>

      {/* Preview before upload */}
      {preview.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-amber-50">
            <span className="text-sm font-medium text-amber-800">{preview.length} rows ready to upload — review below</span>
            <Button size="sm" onClick={uploadRows} disabled={uploading} className="bg-blue-600 hover:bg-blue-700">
              {uploading ? "Uploading…" : `Upload & Auto-Match`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 text-gray-600">{r.date}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{r.description}</td>
                    <td className="px-4 py-2 text-right text-red-600">{r.debit > 0 ? inr(r.debit) : "—"}</td>
                    <td className="px-4 py-2 text-right text-green-600">{r.credit > 0 ? inr(r.credit) : "—"}</td>
                  </tr>
                ))}
                {preview.length > 10 && (
                  <tr className="border-t"><td colSpan={4} className="px-4 py-2 text-xs text-gray-400 text-center">…and {preview.length - 10} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Summary stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total In",    value: inr(totalIn),   color: "text-green-600" },
            { label: "Total Out",   value: inr(totalOut),  color: "text-red-600" },
            { label: "Matched",     value: matched,         color: "text-blue-600" },
            { label: "Unmatched",   value: unmatched,       color: "text-amber-600" },
          ].map(s => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Statement rows */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Statement Rows</span>
          <span className="text-xs text-muted-foreground">{rows.length} entries</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-muted-foreground text-sm">No statement rows yet. Upload a CSV to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-center">Match</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{r.description}</td>
                    <td className="px-4 py-2 text-right text-red-600 font-medium">{r.debit > 0 ? inr(r.debit) : "—"}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-medium">{r.credit > 0 ? inr(r.credit) : "—"}</td>
                    <td className="px-4 py-2 text-center">
                      {r.matched ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {r.match_type === "invoice" ? "Invoice" : "Purchase"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{r.match_ref}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 gap-1">
                          <XCircle className="h-3 w-3" /> Unmatched
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
