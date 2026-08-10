// Shared toolkit page — GSTIN Validator, HSN Finder, AI HSN Finder, GST Calc, Income Tax, HRA, ITR Guide, TDS Rates.
// Routes: /tools, /tools/gstin, /tools/hsn  (also rendered publicly at /free/...)
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, AlertTriangle, Search, Sparkles, Loader2, FileText, ScanLine, Calculator, IndianRupee, Home, BookOpen, Table2 } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
// Use plain axios (no auth header) for /public endpoints so /tools works without login too.
const pub = axios.create({ baseURL: API });

export default function Tools({ publicMode = false }) {
  const auth = !publicMode ? useAuth() : { user: null }; // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <div className="space-y-6" data-testid="tools-page">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          Tax &amp; GST Toolkit
          <Badge className="bg-emerald-600 text-[10px]">Free Forever</Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calculators and reference tools for Indian businesses — GST, income tax, HRA, ITR guide, TDS rates, GSTIN validator, HSN finder.
        </p>
      </div>

      <Tabs defaultValue="gst-calc">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="gst-calc">
            <Calculator className="h-3.5 w-3.5 mr-1.5" /> GST Calculator
          </TabsTrigger>
          <TabsTrigger value="income-tax">
            <IndianRupee className="h-3.5 w-3.5 mr-1.5" /> Income Tax
          </TabsTrigger>
          <TabsTrigger value="hra">
            <Home className="h-3.5 w-3.5 mr-1.5" /> HRA Exemption
          </TabsTrigger>
          <TabsTrigger value="itr-guide">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" /> ITR Guide
          </TabsTrigger>
          <TabsTrigger value="tds-rates">
            <Table2 className="h-3.5 w-3.5 mr-1.5" /> TDS Rates
          </TabsTrigger>
          <TabsTrigger value="gstin" data-testid="tool-tab-gstin">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> GSTIN Validator
          </TabsTrigger>
          <TabsTrigger value="hsn" data-testid="tool-tab-hsn">
            <Search className="h-3.5 w-3.5 mr-1.5" /> HSN/SAC Finder
          </TabsTrigger>
          {!publicMode && (
            <TabsTrigger value="ai-hsn" data-testid="tool-tab-ai-hsn">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI HSN Finder
            </TabsTrigger>
          )}
          {!publicMode && (
            <TabsTrigger value="ai-cat" data-testid="tool-tab-ai-cat">
              <ScanLine className="h-3.5 w-3.5 mr-1.5" /> AI Categorizer
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="gst-calc"><GstCalcTool /></TabsContent>
        <TabsContent value="income-tax"><IncomeTaxTool /></TabsContent>
        <TabsContent value="hra"><HraTool /></TabsContent>
        <TabsContent value="itr-guide"><ItrGuideTool /></TabsContent>
        <TabsContent value="tds-rates"><TdsRatesTool /></TabsContent>
        <TabsContent value="gstin"><GstinTool /></TabsContent>
        <TabsContent value="hsn"><HsnTool /></TabsContent>
        {!publicMode && <TabsContent value="ai-hsn"><AiHsnTool /></TabsContent>}
        {!publicMode && <TabsContent value="ai-cat"><AiCategorizeTool /></TabsContent>}
      </Tabs>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────── */
const inrFmt = (n) => "₹ " + Math.round(n).toLocaleString("en-IN");
const inrDec = (n) => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ResultRow({ label, value, total = false, green = false }) {
  return (
    <div className={`flex justify-between items-center py-2.5 px-4 border-b last:border-0 ${total ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
      <span className={`text-sm ${total ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${total ? "text-base text-blue-700 dark:text-blue-400" : green ? "text-emerald-600" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

/* ─── GST Calculator ──────────────────────────────────── */
function GstCalcTool() {
  const [mode, setMode] = useState("add");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(18);
  const [txn, setTxn] = useState("intra");

  const result = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    let base, gstAmt, total;
    if (mode === "add") { base = amt; gstAmt = amt * rate / 100; total = amt + gstAmt; }
    else { total = amt; base = amt / (1 + rate / 100); gstAmt = total - base; }
    return { base, gstAmt, total, half: rate / 2 };
  }, [amount, rate, mode]);

  const rates = [0, 5, 12, 18, 28];

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      <Card className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</Label>
          <div className="flex rounded-md overflow-hidden border">
            {[["add", "Add GST"], ["remove", "Remove GST"]].map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (₹)</Label>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">GST Rate</Label>
          <div className="flex flex-wrap gap-2">
            {rates.map(r => (
              <button key={r} onClick={() => setRate(r)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${rate === r ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>{r}%</button>
            ))}
          </div>
          <Input type="number" value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} placeholder="Custom %" min="0" max="100" className="max-w-[120px]" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transaction Type</Label>
          <div className="flex rounded-md overflow-hidden border">
            {[["intra", "Intra-State"], ["inter", "Inter-State"]].map(([v, l]) => (
              <button key={v} onClick={() => setTxn(v)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${txn === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{l}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{txn === "intra" ? "CGST + SGST/UTGST split equally" : "Single IGST applied"}</p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5">Breakdown</div>
        <ResultRow label="Base amount (excl. GST)" value={inrDec(result.base)} />
        {txn === "intra" ? <>
          <ResultRow label={`CGST (${result.half}%)`} value={inrDec(result.gstAmt / 2)} />
          <ResultRow label={`SGST / UTGST (${result.half}%)`} value={inrDec(result.gstAmt / 2)} />
        </> : <ResultRow label={`IGST (${rate}%)`} value={inrDec(result.gstAmt)} />}
        <ResultRow label="Total (incl. GST)" value={inrDec(result.total)} total />
      </Card>
    </div>
  );
}

/* ─── Income Tax FY 2025-26 ───────────────────────────── */
const NEW_SLABS = [[0,400000,0],[400000,800000,.05],[800000,1200000,.10],[1200000,1600000,.15],[1600000,2000000,.20],[2000000,2400000,.25],[2400000,Infinity,.30]];
const OLD_SLABS = [[0,250000,0],[250000,500000,.05],[500000,1000000,.20],[1000000,Infinity,.30]];

function calcSlab(income, slabs) {
  let tax = 0; const rows = [];
  for (const [from, to, r] of slabs) {
    if (income <= from) break;
    const slab = Math.min(income, to) - from, t = slab * r;
    rows.push({ from, to, rate: r * 100, tax: t }); tax += t;
  }
  return { tax, rows };
}
function surcharge(income, tax) {
  if (income <= 5e6) return 0;
  if (income <= 1e7) return tax * .10;
  if (income <= 2e7) return tax * .15;
  if (income <= 5e7) return tax * .25;
  return tax * .37;
}
const slabLabel = n => n >= 1e7 ? "₹" + (n/1e7) + "Cr" : n >= 1e5 ? "₹" + (n/1e5) + "L" : n >= 1e3 ? "₹" + (n/1e3) + "K" : "₹" + n;

function IncomeTaxTool() {
  const [gross, setGross] = useState("");
  const [empType, setEmpType] = useState("salaried");
  const [d80c, setD80c] = useState("");
  const [d80d, setD80d] = useState("");
  const [dHra, setDHra] = useState("");
  const [dOther, setDOther] = useState("");

  const result = useMemo(() => {
    const g = parseFloat(gross) || 0; if (!g) return null;
    const isSal = empType === "salaried";
    const netN = Math.max(0, g - (isSal ? 75000 : 0));
    let { tax: tN, rows: rN } = calcSlab(netN, NEW_SLABS);
    if (netN <= 1200000) tN = Math.max(0, tN - Math.min(tN, 25000));
    const surN = surcharge(netN, tN), cessN = (tN + surN) * .04, totN = tN + surN + cessN;

    const totalOldDed = Math.min(parseFloat(d80c) || 0, 150000) + (parseFloat(d80d) || 0) + (parseFloat(dHra) || 0) + (parseFloat(dOther) || 0);
    const netO = Math.max(0, g - (isSal ? 50000 : 0) - totalOldDed);
    let { tax: tO, rows: rO } = calcSlab(netO, OLD_SLABS);
    if (netO <= 500000) tO = Math.max(0, tO - Math.min(tO, 12500));
    const surO = surcharge(netO, tO), cessO = (tO + surO) * .04, totO = tO + surO + cessO;

    const newWins = totN <= totO;
    return { totN, totO, newWins, saving: Math.abs(totN - totO), rows: newWins ? rN : rO, net: newWins ? netN : netO, sur: newWins ? surN : surO, cess: newWins ? cessN : cessO, tot: newWins ? totN : totO };
  }, [gross, empType, d80c, d80d, dHra, dOther]);

  return (
    <div className="mt-4 space-y-6 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Gross Annual Income (₹)</Label>
            <Input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="0" min="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Employment Type</Label>
            <div className="flex rounded-md overflow-hidden border">
              {[["salaried", "Salaried"], ["self", "Self-employed"]].map(([v, l]) => (
                <button key={v} onClick={() => setEmpType(v)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${empType === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{l}</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {empType === "salaried" ? "Std deduction ₹75,000 (new) / ₹50,000 (old) auto-applied" : "No standard deduction for self-employed"}
            </p>
          </div>
          <div className="border-t pt-3 space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Old Regime Deductions (optional)</p>
            {[
              ["Section 80C (max ₹1.5L)", d80c, setD80c, "PF, PPF, ELSS, LIC, home loan principal…"],
              ["Section 80D — Health insurance", d80d, setD80d, "Self ₹25K · Senior-citizen parents ₹50K"],
              ["HRA exemption (use HRA tab)", dHra, setDHra, ""],
              ["Other (80E, 80G, 24b interest…)", dOther, setDOther, ""],
            ].map(([lbl, val, set, note]) => (
              <div key={lbl} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{lbl}</Label>
                <Input type="number" value={val} onChange={e => set(e.target.value)} placeholder="0" min="0" />
                {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "New Regime", value: result.totN, wins: result.newWins },
                  { label: "Old Regime", value: result.totO, wins: !result.newWins },
                ].map(({ label, value, wins }) => (
                  <Card key={label} className={`p-4 text-center ${wins ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : ""}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">{label}</p>
                    <p className={`text-2xl font-bold font-mono tabular-nums ${wins ? "text-emerald-600" : "text-foreground"}`}>{inrFmt(value)}</p>
                    {wins && <Badge className="bg-emerald-600 text-[10px] mt-1.5">Better · Save {inrFmt(result.saving)}</Badge>}
                  </Card>
                ))}
              </div>
              <Card className="overflow-hidden">
                <div className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5">
                  {result.newWins ? "New" : "Old"} Regime Slab Breakdown
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Slab</th>
                      <th className="px-4 py-2 font-medium">Rate</th>
                      <th className="text-right px-4 py-2 font-medium">Tax</th>
                    </tr></thead>
                    <tbody>
                      {result.rows.filter(r => result.net > r.from).map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2 tabular-nums">{slabLabel(r.from)}{r.to === Infinity ? "+" : " – " + slabLabel(r.to)}</td>
                          <td className="px-4 py-2 text-center">{r.rate}%</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{r.rate === 0 ? "—" : inrFmt(r.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ResultRow label="Taxable income" value={inrFmt(result.net)} />
                <ResultRow label="Surcharge" value={result.sur > 0 ? inrFmt(result.sur) : "Nil"} />
                <ResultRow label="Health & Ed. Cess (4%)" value={inrFmt(result.cess)} />
                <ResultRow label="Total tax payable" value={inrFmt(result.tot)} total />
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center text-muted-foreground text-sm">Enter your income to compare both regimes</Card>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground italic">FY 2025–26 / AY 2026–27. Includes Budget 2025: ₹0 tax up to ₹12L under new regime (u/s 87A rebate). Verify with a CA before filing.</p>
    </div>
  );
}

/* ─── HRA Exemption ───────────────────────────────────── */
function HraTool() {
  const [basic, setBasic] = useState("");
  const [recv, setRecv] = useState("");
  const [rent, setRent] = useState("");
  const [metro, setMetro] = useState(true);

  const result = useMemo(() => {
    const b = parseFloat(basic) || 0, r = parseFloat(recv) || 0, rent2 = parseFloat(rent) || 0;
    const v1 = r, v2 = b * (metro ? .5 : .4), v3 = Math.max(0, rent2 - b * .10);
    const exempt = Math.min(v1, v2, v3), taxable = Math.max(0, r - exempt);
    return { v1, v2, v3, exempt, taxable };
  }, [basic, recv, rent, metro]);

  const steps = [
    { label: "① HRA received from employer", value: result.v1 },
    { label: `② ${metro ? "50" : "40"}% of Basic + DA (${metro ? "metro" : "non-metro"})`, value: result.v2 },
    { label: "③ Rent paid − 10% of Basic + DA", value: result.v3 },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      <Card className="p-5 space-y-4">
        {[["Basic salary + DA / year (₹)", basic, setBasic], ["HRA received from employer / year (₹)", recv, setRecv], ["Actual rent paid / year (₹)", rent, setRent]].map(([lbl, val, set]) => (
          <div key={lbl} className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">{lbl}</Label>
            <Input type="number" value={val} onChange={e => set(e.target.value)} placeholder="0" min="0" />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
          <div className="flex rounded-md overflow-hidden border">
            {[[true, "Metro (50%)"], [false, "Non-Metro (40%)"]].map(([v, l]) => (
              <button key={String(v)} onClick={() => setMetro(v)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${metro === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Metro: Mumbai, Delhi, Kolkata, Chennai</p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5">Three-part test — lowest wins</div>
        {steps.map((s, i) => (
          <div key={i} className="flex justify-between items-center px-4 py-3 border-b text-sm">
            <span className="text-muted-foreground text-xs">{s.label}</span>
            <span className="font-mono font-semibold tabular-nums">{inrFmt(s.value)}</span>
          </div>
        ))}
        <div className="flex justify-between items-center px-4 py-3 border-b bg-emerald-50 dark:bg-emerald-950/20 text-sm">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓ Exempt (minimum)</span>
          <span className="font-mono font-bold text-emerald-600 text-base tabular-nums">{inrFmt(result.exempt)}</span>
        </div>
        <ResultRow label="HRA received" value={inrFmt(result.v1)} />
        <ResultRow label="Exempt portion" value={inrFmt(result.exempt)} green />
        <ResultRow label="Taxable HRA" value={inrFmt(result.taxable)} total />
      </Card>
    </div>
  );
}

/* ─── ITR Guide ───────────────────────────────────────── */
const ITR_FORMS = [
  { form: "ITR-1", nick: "Sahaj", who: "Resident individuals with salary/pension, one house property (no loss), and other income sources. Total income ≤ ₹50 lakh.", tags: ["Salaried", "Pensioner", "FD interest"], not: ["Capital gains", "Foreign income", "Business income", "2+ houses"] },
  { form: "ITR-2", nick: "", who: "Individuals & HUFs with capital gains, 2+ house properties, foreign assets/income, or company directorships. No business income.", tags: ["Capital gains", "Multiple houses", "Foreign assets", "Director"], not: ["Business / presumptive income"] },
  { form: "ITR-3", nick: "", who: "Individuals & HUFs earning from a proprietary business or profession. Partners in a firm also file this. Covers all income types.", tags: ["Freelancers", "Proprietors", "Firm partners"], not: [] },
  { form: "ITR-4", nick: "Sugam", who: "Resident individuals, HUFs, and firms (not LLP) opting for presumptive income under Sec 44AD, 44ADA, or 44AE. Income ≤ ₹50 lakh.", tags: ["Small business (44AD)", "Professionals 44ADA", "Transporters 44AE"], not: ["Capital gains", "Foreign assets", "2+ houses"] },
  { form: "ITR-5", nick: "", who: "Firms, LLPs, AOPs, BOIs, and other entities not covered by ITR-3 or ITR-6.", tags: ["LLP", "Partnership firm", "AOP / BOI"], not: [] },
  { form: "ITR-6", nick: "", who: "All companies except those claiming exemption under Sec 11 (charitable/religious trusts). Must file electronically.", tags: ["Private Ltd", "Public Ltd", "OPC"], not: ["Sec 11 trusts"] },
];

const DEADLINES = [
  { label: "Non-audit individuals & salaried", sub: "Sec 139(1) — original return", date: "31 Jul 2025" },
  { label: "Businesses requiring audit (Sec 44AB)", sub: "Turnover > ₹1 Cr (business) or ₹50L (profession)", date: "31 Oct 2025" },
  { label: "Transfer pricing cases", sub: "International / specified domestic transactions", date: "30 Nov 2025" },
  { label: "Belated / revised return", sub: "Sec 139(4)/(5) — ₹5,000 late fee applies", date: "31 Dec 2025" },
  { label: "Updated return (ITR-U)", sub: "2 years from end of AY; additional tax + interest", date: "31 Mar 2028" },
];

const DOC_GROUPS = [
  { title: "Everyone", docs: ["PAN card", "Aadhaar", "Bank account details (for refund)", "Form 26AS / AIS / TIS from incometax.gov.in", "Previous year ITR"] },
  { title: "Salaried", docs: ["Form 16 Part A & B from employer", "Monthly pay slips", "Rent receipts (for HRA)", "Investment proofs — 80C, 80D, NPS"] },
  { title: "Capital Gains", docs: ["Broker contract notes / statement", "MF capital gain statements", "Property sale deed + purchase cost", "Cost of improvement receipts"] },
  { title: "Business / Profession", docs: ["P&L + Balance Sheet", "GST returns (GSTR-1, 3B)", "Books of accounts", "Audit report u/s 44AB (if applicable)"] },
];

function ItrGuideTool() {
  return (
    <div className="mt-4 space-y-8 max-w-4xl">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Which ITR form applies to you?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ITR_FORMS.map(f => (
            <Card key={f.form} className="p-4 hover:border-primary transition-colors">
              <div className="text-2xl font-bold text-primary font-mono mb-0.5">{f.form}</div>
              {f.nick && <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{f.nick}</div>}
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{f.who}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {f.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
              {f.not.length > 0 && <p className="text-[11px] text-muted-foreground"><strong>Not for:</strong> {f.not.join(", ")}</p>}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Key Deadlines — AY 2025–26</h2>
        <Card className="overflow-hidden">
          {DEADLINES.map((d, i) => (
            <div key={i} className={`flex justify-between items-center px-4 py-3 gap-4 border-b last:border-0 ${i % 2 ? "bg-muted/30" : ""}`}>
              <div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">{d.sub}</p>
              </div>
              <Badge variant="outline" className="shrink-0 font-mono">{d.date}</Badge>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Documents Checklist</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DOC_GROUPS.map(g => (
            <Card key={g.title} className="overflow-hidden">
              <div className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5">{g.title}</div>
              <ul className="p-3 space-y-2">
                {g.docs.map(d => (
                  <li key={d} className="flex gap-2 text-xs text-muted-foreground items-baseline">
                    <span className="text-emerald-500 shrink-0">✓</span>{d}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── TDS Rates ───────────────────────────────────────── */
const TDS_DATA = [
  { s:"192", n:"Salary", t:"As per income slab", r:"As per slab" },
  { s:"193", n:"Interest on securities", t:"₹10,000", r:"10%" },
  { s:"194", n:"Dividend", t:"₹5,000", r:"10%" },
  { s:"194A", n:"Interest — bank / post office / others", t:"₹50K (senior) / ₹40K (banks) / ₹5K", r:"10%" },
  { s:"194B", n:"Winnings — lottery / crossword", t:"₹10,000 per transaction", r:"30%" },
  { s:"194BB", n:"Winnings — horse race", t:"₹10,000", r:"30%" },
  { s:"194C", n:"Contractor / sub-contractor", t:"₹30K (single) / ₹1L (aggregate)", r:"1% (indiv/HUF) · 2% (others)" },
  { s:"194D", n:"Insurance commission", t:"₹15,000", r:"5%" },
  { s:"194G", n:"Commission — lottery tickets", t:"₹15,000", r:"5%" },
  { s:"194H", n:"Commission or brokerage", t:"₹15,000", r:"5%" },
  { s:"194I", n:"Rent", t:"₹2,40,000 p.a.", r:"2% (plant/machinery) · 10% (land/building)" },
  { s:"194IA", n:"Purchase of immovable property (buyer)", t:"₹50 lakh", r:"1%" },
  { s:"194IB", n:"Rent by individual/HUF (from tenant)", t:"₹50,000/month", r:"5%" },
  { s:"194J", n:"Professional / technical service fees", t:"₹30,000", r:"2% (technical) · 10% (professional)" },
  { s:"194K", n:"Income from mutual fund units", t:"₹5,000", r:"10%" },
  { s:"194M", n:"Payment to contractor/professional by indiv/HUF", t:"₹50 lakh aggregate", r:"5%" },
  { s:"194N", n:"Cash withdrawal from bank", t:"₹1 Cr (ITR filer) / ₹20L (non-filer)", r:"2% / 5%" },
  { s:"194O", n:"Payment by e-commerce operator to participant", t:"₹5 lakh", r:"1%" },
  { s:"194Q", n:"Purchase of goods (buyer side)", t:"₹50 lakh from single seller", r:"0.1%" },
  { s:"194R", n:"Perquisite / benefit to business or profession", t:"₹20,000", r:"10%" },
  { s:"194S", n:"Virtual digital assets — crypto / NFT", t:"₹10K (others) / ₹50K (specified)", r:"1%" },
  { s:"195", n:"Payments to non-residents (interest, royalty, FTS)", t:"None", r:"Varies / DTAA" },
];

function TdsRatesTool() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return TDS_DATA;
    const ql = q.toLowerCase();
    return TDS_DATA.filter(r => r.s.toLowerCase().includes(ql) || r.n.toLowerCase().includes(ql) || r.r.toLowerCase().includes(ql));
  }, [q]);

  return (
    <div className="mt-4 max-w-4xl space-y-4">
      <p className="text-sm text-muted-foreground">If PAN is not furnished: 20% or double the applicable rate, whichever is higher.</p>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search section, nature of payment…" className="max-w-sm" />
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-bold">Section</th>
              <th className="text-left px-4 py-3 font-bold">Nature of Payment</th>
              <th className="text-left px-4 py-3 font-bold">Threshold</th>
              <th className="text-right px-4 py-3 font-bold">Rate</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.s} className={`border-t ${i % 2 ? "bg-muted/30" : ""}`}>
                <td className="px-4 py-2.5 font-mono font-bold text-primary">{r.s}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.n}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.t}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">{r.r}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No matching sections</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground italic">Rates for FY 2025–26. Always verify at incometax.gov.in before deducting.</p>
    </div>
  );
}

function GstinTool() {
  const [gstin, setGstin] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const check = async (e) => {
    e?.preventDefault();
    if (!gstin.trim()) return;
    setLoading(true);
    try {
      const { data } = await pub.get(`/public/gstin/validate`, { params: { gstin: gstin.trim() } });
      setResult(data);
    } finally { setLoading(false); }
  };
  return (
    <Card className="mt-3 p-6 max-w-2xl">
      <form onSubmit={check} className="space-y-3">
        <Label htmlFor="gstin-in" className="text-sm">GSTIN to verify</Label>
        <div className="flex gap-2">
          <Input id="gstin-in" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())}
                 placeholder="22AAAAA0000A1Z5" className="font-mono uppercase tracking-wider"
                 maxLength={15} data-testid="gstin-input" />
          <Button type="submit" disabled={loading} data-testid="gstin-check-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          15 characters · We check format, state code, PAN segment and the official mod-36 checksum.
        </p>
      </form>

      {result && (
        <div className="mt-5 pt-5 border-t" data-testid="gstin-result">
          {result.valid ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <ShieldCheck className="h-5 w-5" /> Structurally valid
              </div>
              <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
                <dt className="text-muted-foreground">State</dt><dd>{result.state} <span className="text-xs text-muted-foreground">({result.state_code})</span></dd>
                <dt className="text-muted-foreground">PAN</dt><dd className="font-mono">{result.pan}</dd>
                <dt className="text-muted-foreground">Entity code</dt><dd className="font-mono">{result.entity_code}</dd>
                <dt className="text-muted-foreground">Checksum</dt><dd className="font-mono">{result.checksum}</dd>
              </dl>
              <p className="text-xs text-muted-foreground italic">{result.note}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-rose-600 font-semibold">
                <AlertTriangle className="h-5 w-5" /> Invalid
              </div>
              <p className="text-sm">{result.reason}</p>
              {result.expected_checksum && (
                <p className="text-xs text-muted-foreground">
                  Expected last character: <span className="font-mono text-foreground">{result.expected_checksum}</span> · got <span className="font-mono text-foreground">{result.got_checksum}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function HsnTool() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const { data } = await pub.get(`/public/hsn/search`, { params: { q: q.trim(), limit: 30 } });
      setResults(data.results); setTotal(data.count_total);
    } finally { setLoading(false); }
  };

  return (
    <Card className="mt-3 p-6">
      <form onSubmit={search} className="space-y-3 max-w-2xl">
        <Label htmlFor="hsn-q" className="text-sm">Product or service</Label>
        <div className="flex gap-2">
          <Input id="hsn-q" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="e.g. laptop, tally license, restaurant, biscuit"
                 data-testid="hsn-input" />
          <Button type="submit" disabled={loading} data-testid="hsn-search-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Searches the bundled CBIC HSN/SAC database ({total || "—"} curated codes). Type description in English/Hindi or paste a partial code.
        </p>
      </form>

      {results.length > 0 && (
        <div className="mt-6 overflow-x-auto" data-testid="hsn-results">
          <table className="app-table">
            <thead>
              <tr><th>Code</th><th>Description</th><th>GST Rate</th><th>Category</th></tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.code + r.description} data-testid={`hsn-row-${r.code}`}>
                  <td className="font-mono font-semibold">{r.code}</td>
                  <td className="max-w-md">{r.description}</td>
                  <td><GstBadge rate={r.gst_rate} /></td>
                  <td className="text-xs text-muted-foreground">{r.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q && !loading && results.length === 0 && (
        <div className="mt-6 text-sm text-muted-foreground" data-testid="hsn-no-results">
          No matches in the bundled list. Try the <strong>AI HSN Finder</strong> tab (login required) for fuzzy matching across the full CBIC catalogue.
        </div>
      )}
    </Card>
  );
}

function AiHsnTool() {
  const [desc, setDesc] = useState("");
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);

  const ask = async (e) => {
    e?.preventDefault();
    if (!desc.trim()) return;
    setLoading(true); setOut(null);
    try {
      const { data } = await api.post("/ai/hsn-finder", { description: desc.trim() });
      setOut(data);
    } finally { setLoading(false); }
  };

  return (
    <Card className="mt-3 p-6">
      <form onSubmit={ask} className="space-y-3 max-w-2xl">
        <Label htmlFor="ai-hsn-q" className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Describe what you're selling
        </Label>
        <div className="flex gap-2">
          <Input id="ai-hsn-q" value={desc} onChange={(e) => setDesc(e.target.value)}
                 placeholder="e.g. 5kg basmati rice premium, social media management service, etc."
                 data-testid="ai-hsn-input" />
          <Button type="submit" disabled={loading} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
                  data-testid="ai-hsn-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask AI"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Claude Sonnet 4.5 will infer the HSN/SAC code, GST rate, and explain its reasoning. Free for all plans.
        </p>
      </form>

      {out && (
        <div className="mt-6 space-y-4" data-testid="ai-hsn-result">
          {out.ai_suggestion && !out.ai_suggestion.error && (
            <div className="rounded-xl border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30 p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">AI suggestion</span>
                <span className="text-xs text-muted-foreground">Confidence: {Math.round((out.ai_suggestion.confidence || 0) * 100)}%</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-3xl font-bold font-mono text-violet-700 dark:text-violet-300">{out.ai_suggestion.code}</span>
                <GstBadge rate={out.ai_suggestion.gst_rate} large />
                <Badge variant="outline" className="text-xs">{out.ai_suggestion.is_service ? "SAC (Service)" : "HSN (Goods)"}</Badge>
              </div>
              <p className="text-sm mt-2">{out.ai_suggestion.description}</p>
              <p className="text-xs text-muted-foreground mt-2 italic">{out.ai_suggestion.reasoning}</p>
            </div>
          )}
          {out.ai_suggestion?.error && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
              AI service unavailable. {out.ai_suggestion.message}
            </div>
          )}

          {out.bundled_matches?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Also found in bundled database</div>
              <div className="overflow-x-auto">
                <table className="app-table">
                  <thead><tr><th>Code</th><th>Description</th><th>GST</th></tr></thead>
                  <tbody>
                    {out.bundled_matches.map(m => (
                      <tr key={m.code + m.description}>
                        <td className="font-mono">{m.code}</td>
                        <td className="max-w-md">{m.description}</td>
                        <td><GstBadge rate={m.gst_rate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AiCategorizeTool() {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);

  const ask = async (e) => {
    e?.preventDefault();
    if (!desc.trim()) return;
    setLoading(true); setOut(null);
    try {
      const body = { description: desc.trim() };
      if (amount) body.amount = parseFloat(amount);
      const { data } = await api.post("/ai/categorize-expense", body);
      setOut(data);
    } finally { setLoading(false); }
  };

  return (
    <Card className="mt-3 p-6">
      <form onSubmit={ask} className="space-y-3 max-w-2xl">
        <Label className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Paste any expense / vendor / bill description
        </Label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)}
               placeholder="e.g. Airtel monthly broadband bill, CA filing fees, office rent for Q1…"
               data-testid="ai-cat-input" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
                 placeholder="Amount (optional)" data-testid="ai-cat-amount" />
          <Button type="submit" disabled={loading} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
                  data-testid="ai-cat-btn">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Categorize"}
          </Button>
        </div>
      </form>

      {out && (
        <div className="mt-6 rounded-xl border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30 p-5" data-testid="ai-cat-result">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Badge className="bg-violet-600 text-sm py-1.5 px-3">{out.category}</Badge>
            {out.tds_section && out.tds_section !== "None" && (
              <Badge className="bg-amber-500 text-xs">TDS · {out.tds_section} @ {out.tds_rate}%</Badge>
            )}
            {out.is_input_gst_claimable && <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-700">Input GST claimable</Badge>}
            <span className="text-xs text-muted-foreground ml-auto">Confidence: {Math.round((out.confidence || 0) * 100)}%</span>
          </div>
          <dl className="text-sm space-y-1">
            <div className="flex gap-3"><dt className="text-muted-foreground w-32">Suggested ledger</dt><dd className="font-medium">{out.suggested_ledger}</dd></div>
            {out.tds_section !== "None" && (
              <div className="flex gap-3"><dt className="text-muted-foreground w-32">TDS section</dt><dd className="font-mono">{out.tds_section} @ {out.tds_rate}%</dd></div>
            )}
          </dl>
          <p className="text-xs text-muted-foreground mt-3 italic">{out.reasoning}</p>
        </div>
      )}
    </Card>
  );
}

export function GstBadge({ rate, large = false }) {
  const color = rate === 0 ? "bg-slate-500" : rate <= 5 ? "bg-emerald-600" : rate <= 12 ? "bg-blue-600" : rate <= 18 ? "bg-amber-500" : "bg-rose-600";
  return <Badge className={`${color} ${large ? "text-base py-1.5 px-3" : "text-[10px]"}`}>{rate}% GST</Badge>;
}
