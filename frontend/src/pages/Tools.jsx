// Shared toolkit page — GSTIN Validator, HSN Finder, AI HSN Finder.
// Routes: /tools, /tools/gstin, /tools/hsn  (also rendered publicly at /free/...)
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, AlertTriangle, Search, Sparkles, Loader2, FileText, ScanLine } from "lucide-react";
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
          GST Compliance Tools
          <Badge className="bg-emerald-600 text-[10px]">Free Forever</Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick utilities for Indian businesses — GSTIN validator, HSN code finder, and AI-powered classification.
          No charges, no rate limits.
        </p>
      </div>

      <Tabs defaultValue="gstin">
        <TabsList>
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
              <ScanLine className="h-3.5 w-3.5 mr-1.5" /> AI Expense Categorizer
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="gstin"><GstinTool /></TabsContent>
        <TabsContent value="hsn"><HsnTool /></TabsContent>
        {!publicMode && <TabsContent value="ai-hsn"><AiHsnTool /></TabsContent>}
        {!publicMode && <TabsContent value="ai-cat"><AiCategorizeTool /></TabsContent>}
      </Tabs>
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
