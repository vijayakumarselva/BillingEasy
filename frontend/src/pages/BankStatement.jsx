import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, CheckCircle2, XCircle, Link2, Trash2, FileText, Sparkles, TrendingUp, TrendingDown, BarChart3, Users, Tag } from "lucide-react";
import DropZone from "@/components/DropZone";
import { inr, fmtDate } from "@/lib/format";
import * as XLSX from "xlsx";

// Parse a CSV line respecting quoted fields (handles commas inside descriptions)
function splitCSVLine(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

const parseAmt = v => parseFloat(String(v || "0").replace(/[,\s]/g, "")) || 0;

// Find column index — ordered from most-specific to least-specific to avoid false matches
function findColIdx(headers, ...priorities) {
  for (const name of priorities) {
    const idx = headers.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function rowsFromSheet(sheet) {
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!json.length) return [];
  const keys = Object.keys(json[0]);
  const norm = k => k.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Most-specific first: "withdrawal amt" > "withdrawal" > "debit"
  const findK = (...names) => keys.find(k => names.some(n => norm(k).includes(n.replace(/\s/g, ""))));

  const dateKey    = findK("valuedt", "txndate", "transactiondate", "date");
  const descKey    = findK("narration", "description", "particulars", "remarks", "details");
  const debitKey   = findK("withdrawalamt", "withdrawal", "debitamt", "debit", "dr");
  const creditKey  = findK("depositamt", "deposit", "creditamt", "credit", "cr");
  const balanceKey = findK("closingbalance", "balance");

  return json.map(row => ({
    date:        dateKey  ? String(row[dateKey] || "").trim()  : "",
    description: descKey  ? String(row[descKey] || "").trim() : "",
    debit:       debitKey  ? parseAmt(row[debitKey])  : 0,  // Withdrawal = money OUT = debit
    credit:      creditKey ? parseAmt(row[creditKey]) : 0,  // Deposit = money IN = credit
    balance:     balanceKey ? parseAmt(row[balanceKey]) : 0,
  })).filter(r => r.date && r.description);
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  // Use proper quoted CSV splitting
  const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, "").trim());

  // Most-specific first to avoid false matches
  const dateIdx    = findColIdx(headers, "value dt", "txn date", "transaction date", "date");
  const descIdx    = findColIdx(headers, "narration", "description", "particulars", "remarks", "details");
  const debitIdx   = findColIdx(headers, "withdrawal amt", "withdrawal", "debit amt", "debit");  // Withdrawal = OUT = debit
  const creditIdx  = findColIdx(headers, "deposit amt", "deposit", "credit amt", "credit");       // Deposit = IN = credit
  const balanceIdx = findColIdx(headers, "closing balance", "balance");

  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const get = i => i >= 0 ? (cols[i] || "").replace(/['"]/g, "").trim() : "";
    return {
      date:        get(dateIdx),
      description: get(descIdx),
      debit:       parseAmt(get(debitIdx)),   // Withdrawal Amt → debit (money OUT)
      credit:      parseAmt(get(creditIdx)),  // Deposit Amt → credit (money IN)
      balance:     parseAmt(get(balanceIdx)),
    };
  }).filter(r => r.date && r.description);
}

export default function BankStatement() {
  const [banks, setBanks]       = useState([]);
  const [bankId, setBankId]     = useState("");
  const [rows, setRows]         = useState([]);
  const [batches, setBatches]   = useState([]);
  const [preview, setPreview]   = useState([]);
  const [filename, setFilename] = useState("");
  const [loading, setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get("/bank-accounts").then(r => { setBanks(r.data); if (r.data[0]) setBankId(r.data[0].id); });
  }, []);

  useEffect(() => {
    if (bankId) { loadRows(); loadBatches(); }
    // eslint-disable-next-line
  }, [bankId]);

  const loadBatches = async () => {
    const { data } = await api.get("/bank-statement/batches", { params: { bank_account_id: bankId } });
    setBatches(data);
  };

  const loadRows = async () => {
    setLoading(true);
    const { data } = await api.get("/bank-statement", { params: { bank_account_id: bankId } });
    setRows(data);
    setLoading(false);
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let parsed;
      if (isExcel) {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsed = rowsFromSheet(ws);
        if (!parsed.length) { toast.error("Could not read Excel sheet. Check column headers."); return; }
      } else {
        parsed = parseCSV(ev.target.result);
        if (!parsed.length) { toast.error("Could not parse CSV. Check column headers."); return; }
      }
      setPreview(parsed);
      setFilename(file.name);
      toast.success(`${parsed.length} rows parsed — review and upload`);
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const uploadRows = async () => {
    if (!bankId) { toast.error("Select a bank account first"); return; }
    setUploading(true);
    try {
      const { data } = await api.post("/bank-statement/upload", { bank_account_id: bankId, rows: preview, filename });
      toast.success(`Uploaded ${data.uploaded} rows — ${data.matched} auto-matched!`);
      setPreview([]); setFilename("");
      fileRef.current.value = "";
      loadRows(); loadBatches();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteBatch = async (batchId) => {
    if (!window.confirm("Delete this upload and all its rows?")) return;
    await api.delete(`/bank-statement/batch/${batchId}`);
    toast.success("Upload deleted");
    loadRows(); loadBatches();
  };

  // Convert rows to bank-statement format (same as HDFC export)
  const toBankFormat = (rowArr) => rowArr.map(r => ({
    "Value Dt":            r.date,
    "Narration":           r.description,
    "Withdrawal Amt.(Dr)": r.debit  || "",   // money OUT — blank if zero
    "Deposit Amt.(Cr)":    r.credit || "",   // money IN  — blank if zero
    "Closing Balance":     r.balance,
    "Matched":             r.matched ? "Yes" : "No",
    "Match Ref":           r.match_ref || "",
  }));

  const downloadBatch = async (batch) => {
    const { data } = await api.get(`/bank-statement/batch/${batch.id}/rows`);
    const ws = XLSX.utils.json_to_sheet(toBankFormat(data));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    const safeName = (batch.filename || "statement").replace(/[^a-zA-Z0-9._-]/g, "_");
    XLSX.writeFile(wb, `${safeName}.xlsx`);
    toast.success(`Downloaded ${data.length} rows`);
  };

  const deleteRow = async (id) => {
    await api.delete(`/bank-statement/${id}`);
    setRows(r => r.filter(x => x.id !== id));
  };

  const downloadAllRows = () => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(toBankFormat(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    const bank = banks.find(b => b.id === bankId);
    XLSX.writeFile(wb, `bank-statement-${bank?.bank_name || "export"}.xlsx`);
    toast.success(`Downloaded ${rows.length} rows as Excel`);
  };

  const clearAllRows = async () => {
    if (!window.confirm(`Delete ALL ${rows.length} statement rows for this account? This cannot be undone.`)) return;
    // Delete each row (or batch-delete via batches)
    await Promise.all([
      ...batches.map(b => api.delete(`/bank-statement/batch/${b.id}`).catch(() => {})),
      // Also delete any legacy rows without batch_id
      ...rows.filter(r => !r.batch_id).map(r => api.delete(`/bank-statement/${r.id}`).catch(() => {})),
    ]);
    toast.success("All rows cleared");
    loadRows(); loadBatches();
  };

  const [showHistory, setShowHistory] = useState(false);

  // Use batch totals (live-counted by backend) for summary so partial row loads don't skew the numbers
  const totalRowCount = batches.reduce((s, b) => s + (b.row_count || 0), 0);
  const matched   = batches.reduce((s, b) => s + (b.matched_count || 0), 0);
  const unmatched = totalRowCount - matched;
  const totalIn   = rows.reduce((s, r) => s + r.credit, 0);
  const totalOut  = rows.reduce((s, r) => s + r.debit, 0);

  const [activeTab, setActiveTab]     = useState("rows"); // "rows" | "analysis"
  const [analysis, setAnalysis]       = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisTab, setAnalysisTab] = useState("vendors"); // "vendors"|"categories"|"monthly"|"insights"

  const runAnalysis = async () => {
    if (!bankId) { toast.error("Select a bank account first"); return; }
    setAnalysisLoading(true);
    setActiveTab("analysis");
    try {
      const { data } = await api.get("/bank-statement/analyze", { params: { bank_account_id: bankId } });
      setAnalysis(data);
    } catch {
      toast.error("Analysis failed. Try again.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Mini bar chart helper (CSS-based)
  const maxVal = (arr, key) => Math.max(...arr.map(r => r[key] || 0), 1);
  const Bar = ({ value, max, color = "bg-blue-500" }) => (
    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );

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
              <SelectItem key={b.id} value={b.id}>{b.bank_name} – {b.account_no || b.account_number || "—"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="cursor-pointer">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden" onChange={onFile} />
          <Button variant="outline" asChild>
            <span><Upload className="h-4 w-4 mr-1.5" /> Upload CSV / Excel</span>
          </Button>
        </label>
        {rows.length > 0 && (
          <Button onClick={runAnalysis} disabled={analysisLoading}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Sparkles className="h-4 w-4 mr-1.5" />
            {analysisLoading ? "Analysing…" : "AI Analysis"}
          </Button>
        )}
        {banks.length === 0 && (
          <p className="text-sm text-amber-600">Add a bank account in Settings → Banking first.</p>
        )}
      </div>

      {/* Tab switcher */}
      {rows.length > 0 && (
        <div className="flex gap-1 border-b">
          {[{ id: "rows", label: "Statement Rows" }, { id: "analysis", label: "AI Analysis" }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t.id ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.id === "analysis" && <Sparkles className="h-3.5 w-3.5 inline mr-1 text-violet-500" />}
              {t.label}
            </button>
          ))}
        </div>
      )}

      <DropZone
        accept=".csv,.xlsx,.xls,.ods"
        onFile={(f) => onFile({ target: { files: [f] } })}
        label="Drag & drop your bank statement here"
        hint="CSV or Excel (.xlsx / .xls) · or use the Upload button above"
        icon={FileText}
        compact
      />

      {/* Format hint */}
      <Card className="p-4 bg-blue-50 border-blue-100">
        <p className="text-xs text-blue-700 font-medium mb-1">Supported formats: CSV and Excel (.xlsx / .xls)</p>
        <code className="text-xs text-blue-600">Date, Description, Debit, Credit, Balance</code>
        <p className="text-xs text-blue-500 mt-1">Column names are flexible — "Narration", "Withdrawal", "Deposit" etc. are also recognised. For Excel, data must be on the first sheet.</p>
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

      {/* Upload Versions — always visible when bank selected */}
      {bankId && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">📂 Upload Versions</span>
            <span className="text-xs text-muted-foreground">{batches.length} version{batches.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">File</th>
                  <th className="px-4 py-2 text-left">Uploaded</th>
                  <th className="px-4 py-2 text-left">Date Range</th>
                  <th className="px-4 py-2 text-right">Rows</th>
                  <th className="px-4 py-2 text-right">Matched</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-sm">
                    No uploads yet for this account.
                  </td></tr>
                ) : batches.map((b, idx) => (
                  <tr key={b.id} className={`border-t hover:bg-muted/20 ${b.is_legacy ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-sm truncate max-w-[180px]" title={b.filename}>
                        {b.is_legacy ? "⚠ " : ""}{b.filename}
                      </div>
                      {!b.is_legacy && <div className="text-[10px] text-muted-foreground">v{batches.length - idx}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-sm">
                      {b.uploaded_at ? fmtDate(b.uploaded_at.slice(0,10)) : <span className="text-amber-600 text-xs">Before tracking</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-sm">
                      {b.date_from}{b.date_to && b.date_to !== b.date_from ? ` → ${b.date_to}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{b.row_count}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={b.matched_count > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}>
                        {b.matched_count} / {b.row_count}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 text-xs mr-1.5" onClick={() => downloadBatch(b)}>
                        ⬇ Download
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => deleteBatch(b.id)}>
                        🗑 Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ───────── AI ANALYSIS TAB ───────── */}
      {activeTab === "analysis" && (
        <div className="space-y-4">
          {analysisLoading ? (
            <Card className="p-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-violet-400 animate-pulse mb-3" />
              <p className="text-muted-foreground font-medium">Claude is analysing your transactions…</p>
              <p className="text-xs text-muted-foreground mt-1">Grouping vendors, categorising expenses, generating insights</p>
            </Card>
          ) : analysis ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total In", value: inr(analysis.total_in), color: "text-emerald-600", icon: TrendingUp },
                  { label: "Total Out", value: inr(analysis.total_out), color: "text-rose-600", icon: TrendingDown },
                  { label: "Net Flow", value: inr(analysis.total_in - analysis.total_out), color: analysis.total_in >= analysis.total_out ? "text-emerald-600" : "text-rose-600", icon: BarChart3 },
                  { label: "Vendors Found", value: analysis.vendors.length, color: "text-blue-600", icon: Users },
                ].map(s => (
                  <Card key={s.label} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                  </Card>
                ))}
              </div>

              {/* Sub-tabs */}
              <div className="flex gap-1 border rounded-lg p-1 bg-muted/30 w-fit">
                {[
                  { id: "vendors", label: "By Vendor", icon: Users },
                  { id: "categories", label: "By Category", icon: Tag },
                  { id: "monthly", label: "Monthly Trend", icon: BarChart3 },
                  { id: "insights", label: "AI Insights", icon: Sparkles },
                ].map(t => (
                  <button key={t.id} onClick={() => setAnalysisTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${analysisTab === t.id ? "bg-white shadow text-violet-700" : "text-muted-foreground hover:text-foreground"}`}>
                    <t.icon className="h-3 w-3" /> {t.label}
                  </button>
                ))}
              </div>

              {/* Vendors tab */}
              {analysisTab === "vendors" && (
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b flex items-center justify-between">
                    <span className="text-sm font-semibold">Top Vendors / Parties</span>
                    <span className="text-xs text-muted-foreground">{analysis.vendors.length} unique</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Vendor</th>
                          <th className="px-4 py-2 text-left">Category</th>
                          <th className="px-4 py-2 text-right">Txns</th>
                          <th className="px-4 py-2 text-right">Debit ₹</th>
                          <th className="px-4 py-2 text-right">Credit ₹</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.vendors.slice(0, 50).map((v, i) => (
                          <tr key={i} className="border-t hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium max-w-[200px]">
                              <div className="truncate">{v.clean_name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{v.raw_vendor}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{v.category}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{v.count}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-rose-600">{v.total_debit > 0 ? inr(v.total_debit) : "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{v.total_credit > 0 ? inr(v.total_credit) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Categories tab */}
              {analysisTab === "categories" && (
                <Card className="p-4 space-y-3">
                  <div className="text-sm font-semibold mb-2">Expense & Income by Category</div>
                  {analysis.categories.map((c, i) => {
                    const mxD = maxVal(analysis.categories, "debit");
                    const mxC = maxVal(analysis.categories, "credit");
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{c.category}</span>
                          <span className="text-muted-foreground">{c.count} txns</span>
                        </div>
                        {c.debit > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 text-rose-500 text-right font-mono">{inr(c.debit)}</span>
                            <Bar value={c.debit} max={mxD} color="bg-rose-400" />
                            <span className="text-[10px] text-muted-foreground w-12">out</span>
                          </div>
                        )}
                        {c.credit > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 text-emerald-600 text-right font-mono">{inr(c.credit)}</span>
                            <Bar value={c.credit} max={mxC} color="bg-emerald-400" />
                            <span className="text-[10px] text-muted-foreground w-12">in</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              )}

              {/* Monthly tab */}
              {analysisTab === "monthly" && (
                <Card className="p-4 space-y-3">
                  <div className="text-sm font-semibold mb-2">Monthly Cash Flow</div>
                  {analysis.monthly.map((m, i) => {
                    const mxAll = Math.max(maxVal(analysis.monthly, "credit"), maxVal(analysis.monthly, "debit"));
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{m.month}</span>
                          <span className={`font-mono text-xs ${m.credit >= m.debit ? "text-emerald-600" : "text-rose-600"}`}>
                            Net {inr(m.credit - m.debit)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-20 text-emerald-600 text-right font-mono">{inr(m.credit)}</span>
                          <Bar value={m.credit} max={mxAll} color="bg-emerald-400" />
                          <span className="text-[10px] text-muted-foreground w-8">in</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-20 text-rose-500 text-right font-mono">{inr(m.debit)}</span>
                          <Bar value={m.debit} max={mxAll} color="bg-rose-400" />
                          <span className="text-[10px] text-muted-foreground w-8">out</span>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}

              {/* Insights tab */}
              {analysisTab === "insights" && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-semibold">AI Financial Insights</span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                    {analysis.insights || "No insights generated."}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="p-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-violet-300 mb-3" />
              <p className="text-muted-foreground">Click <strong>AI Analysis</strong> to analyse your transactions</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "rows" && <>

      {/* Statement rows */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-sm font-semibold text-gray-700">Statement Rows</span>
            <span className="text-xs text-muted-foreground ml-2">{rows.length} entries</span>
          </div>
          {rows.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={downloadAllRows}>
                ⬇ Download All
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                onClick={clearAllRows}>
                🗑 Clear All
              </Button>
            </div>
          )}
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
      </>}
    </div>
  );
}
