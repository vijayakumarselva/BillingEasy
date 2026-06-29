// Inline HSN suggester — uses the bundled DB first, then falls back to AI.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, Loader2 } from "lucide-react";
import axios from "axios";
import api from "@/lib/api";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function HsnSuggestButton({ description = "", onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [bundled, setBundled] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const initialQuery = description?.trim() || "";

  const search = async (qq) => {
    const term = (qq ?? q).trim();
    if (!term) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/public/hsn/search`, { params: { q: term, limit: 10 } });
      setBundled(data.results);
    } finally { setLoading(false); }
  };

  const askAi = async () => {
    const term = q.trim() || initialQuery;
    if (!term) return;
    setAiLoading(true);
    try {
      const { data } = await api.post("/ai/hsn-finder", { description: term });
      setAiResult(data.ai_suggestion);
      if (!bundled.length && data.bundled_matches?.length) setBundled(data.bundled_matches);
    } finally { setAiLoading(false); }
  };

  const openDialog = () => {
    setOpen(true);
    setQ(initialQuery);
    setAiResult(null);
    if (initialQuery) search(initialQuery);
  };

  const pick = (hit) => {
    onPick?.({ code: hit.code, gst_rate: hit.gst_rate, description: hit.description });
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={openDialog}
              className="text-[10px] uppercase tracking-wider text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1"
              data-testid="hsn-suggest-open-btn">
        <Sparkles className="h-3 w-3" /> Find HSN
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="hsn-suggest-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" /> Find the right HSN/SAC code
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
                   placeholder="Describe your product or service…"
                   data-testid="hsn-suggest-input" />
            <Button onClick={() => search()} disabled={loading} variant="outline" data-testid="hsn-suggest-search-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            <Button onClick={askAi} disabled={aiLoading} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
                    data-testid="hsn-suggest-ai-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Ask AI
            </Button>
          </div>

          {aiResult && !aiResult.error && (
            <div className="rounded-lg border-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30 p-3" data-testid="hsn-suggest-ai-result">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">AI suggestion</span>
                <span className="text-[10px] text-muted-foreground">{Math.round((aiResult.confidence || 0) * 100)}% confidence</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-mono text-violet-700 dark:text-violet-300">{aiResult.code}</span>
                <Badge className="bg-amber-500 text-[10px]">{aiResult.gst_rate}% GST</Badge>
                <Button size="sm" className="ml-auto" onClick={() => pick(aiResult)} data-testid="hsn-pick-ai-btn">Use this</Button>
              </div>
              <p className="text-xs mt-1">{aiResult.description}</p>
              <p className="text-[11px] text-muted-foreground mt-1 italic">{aiResult.reasoning}</p>
            </div>
          )}

          {bundled.length > 0 && (
            <div className="max-h-80 overflow-y-auto -mx-2">
              {bundled.map(hit => (
                <button key={hit.code + hit.description} onClick={() => pick(hit)}
                        className="w-full text-left px-3 py-2 hover:bg-muted rounded-md flex items-center gap-3"
                        data-testid={`hsn-pick-${hit.code}`}>
                  <span className="font-mono font-semibold text-sm">{hit.code}</span>
                  <span className="text-sm flex-1 truncate">{hit.description}</span>
                  <Badge className="bg-blue-600 text-[10px]">{hit.gst_rate}%</Badge>
                </button>
              ))}
            </div>
          )}
          {q && !loading && bundled.length === 0 && !aiResult && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No match in our bundled database — click <strong>Ask AI</strong> to get a suggestion.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
