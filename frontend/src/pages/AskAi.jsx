// Ask BillingsEasy — streaming AI bookkeeper chat (Claude Sonnet 4.5).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Sparkles, User as UserIcon, Plus, Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import api from "@/lib/api";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUGGESTIONS = [
  "Create invoice for Amit, 5kg rice at ₹100, GST 5%",
  "How much GST do I owe this month?",
  "Top 5 customers by revenue in the last 30 days",
  "Show me overdue invoices",
  "Am I ready to file GSTR-1?",
  "Mere expenses kitne hue is mahine?",
];

// Words that signal invoice creation intent
const INVOICE_INTENT = /\b(create|make|generate|bill|invoice|बनाओ|बना|invoice karo|bill karo|sale karo|add invoice|new invoice)\b/i;

function newSessionId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AskAi() {
  const { orgId } = useAuth();
  const [sessionId, setSessionId] = useState(() => newSessionId());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState([]);
  const scrollRef = useRef(null);

  const loadSessions = async () => {
    const { data } = await api.get("/ai/chat/sessions");
    setSessions(data);
  };
  useEffect(() => { loadSessions(); }, []);

  const loadHistory = async (sid) => {
    setSessionId(sid);
    const { data } = await api.get("/ai/chat/history", { params: { session_id: sid } });
    setMessages(data.messages.map(m => ({ role: m.role, content: m.content })));
  };

  const startNew = () => {
    setSessionId(newSessionId());
    setMessages([]);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    setInput("");

    // Detect invoice creation intent — use AI extraction instead of chat
    if (INVOICE_INTENT.test(msg)) {
      setMessages(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: "", type: "invoice-loading" }]);
      setStreaming(true);
      try {
        const { data } = await api.post("/ai/invoice-draft", { text: msg });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "", type: "invoice-draft", draft: data };
          return copy;
        });
      } catch (err) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Sorry, I couldn't extract invoice details. Please try again with more details like: \"Create invoice for Ramesh, 10kg wheat at ₹40, cash payment\"" };
          return copy;
        });
      } finally {
        setStreaming(false);
        loadSessions();
      }
      return;
    }

    setMessages(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const token = localStorage.getItem("be_token");
      const r = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Org-Id": orgId || "",
        },
        body: JSON.stringify({ session_id: sessionId, message: msg }),
      });
      if (!r.ok || !r.body) {
        const txt = await r.text();
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.delta) {
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + payload.delta };
                return copy;
              });
            } else if (payload.error) {
              const rawErr = payload.error || "";
              let friendlyErr;
              if (rawErr.includes("credit balance is too low") || rawErr.includes("billing")) {
                friendlyErr = "⚠️ Anthropic API credits exhausted. Please ask your administrator to top up the Anthropic account at console.anthropic.com → Billing.";
              } else if (rawErr.includes("401") || rawErr.includes("authentication")) {
                friendlyErr = "⚠️ AI API key is invalid or expired. Please contact your administrator.";
              } else {
                friendlyErr = `⚠️ AI error: ${rawErr}`;
              }
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: friendlyErr };
                return copy;
              });
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `Sorry — couldn't reach the AI service. ${err?.message || ""}` };
        return copy;
      });
    } finally {
      setStreaming(false);
      loadSessions();
    }
  };

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-7rem)]" data-testid="ai-chat-page">
      {/* Sessions sidebar */}
      <Card className="p-3 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Conversations</div>
          <Button size="icon" variant="ghost" onClick={startNew} title="New chat" data-testid="new-chat-btn">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1 overflow-y-auto flex-1">
          {sessions.length === 0 && (
            <div className="text-xs text-muted-foreground p-3 text-center">No previous chats yet.</div>
          )}
          {sessions.map(s => (
            <button key={s.session_id} onClick={() => loadHistory(s.session_id)}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-muted/60 transition ${sessionId === s.session_id ? "bg-muted" : ""}`}
                    data-testid={`session-${s.session_id}`}>
              <div className="truncate font-medium">{s.last_msg || "—"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.count} msgs</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Main chat */}
      <Card className="flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold flex items-center gap-2">Ask BillingsEasy <Badge className="bg-violet-600 text-[10px]">AI</Badge></div>
            <div className="text-[11px] text-muted-foreground">Your AI bookkeeper · Powered by Claude · English & हिन्दी</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10" data-testid="empty-chat-state">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center mx-auto text-white mb-3">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">How can I help with your books today?</h2>
              <p className="text-sm text-muted-foreground mt-1">Ask anything about your business in English or Hindi.</p>
              <div className="grid sm:grid-cols-2 gap-2 mt-6 max-w-2xl mx-auto">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                          className="text-left text-xs rounded-lg border bg-card hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30 p-3 transition"
                          data-testid={`suggestion-${s.slice(0, 20).replace(/\s+/g, '-')}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.type === "invoice-draft"
              ? <InvoiceDraftCard key={i} draft={m.draft} />
              : <ChatBubble key={i} role={m.role} content={m.content} streaming={streaming && i === messages.length - 1 && m.type !== "invoice-loading"} invoiceLoading={m.type === "invoice-loading" && streaming} />
          )}
        </div>

        <div className="border-t p-3">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about your sales, GST, customers, or anything else…"
              rows={1}
              className="resize-none min-h-[44px] max-h-32"
              disabled={streaming}
              data-testid="chat-input"
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} className="h-11 w-11 shrink-0" data-testid="chat-send-btn">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            AI can occasionally make mistakes — always verify before filing returns.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ChatBubble({ role, content, streaming, invoiceLoading }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`} data-testid={`msg-${role}`}>
      {!isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${isUser ? "bg-blue-600 text-white" : "bg-muted"}`}>
        {invoiceLoading
          ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading invoice details…</span>
          : content || (streaming ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</span> : "")
        }
      </div>
      {isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-blue-600 grid place-items-center text-white">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function InvoiceDraftCard({ draft }) {
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");

  const { extracted, party, items } = draft || {};
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const subtotal = (items || []).reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);
  const tax = (items || []).reduce((s, it) => s + (it.qty || 0) * (it.rate || 0) * ((it.gst_rate || 0) / 100), 0);

  const confirmCreate = async () => {
    setCreating(true); setError("");
    try {
      const payload = {
        party_id: party?.id || "",
        invoice_date: extracted?.invoice_date,
        due_date: extracted?.invoice_date,
        type: extracted?.type || "sale",
        status: "finalized",
        notes: extracted?.notes || "Created via AI chat",
        items: (items || []).map(it => ({
          product_id: it.product_id || "",
          name: it.matched_product_name || it.name,
          hsn: it.hsn || "",
          qty: it.qty || 1,
          unit: it.unit || "NOS",
          rate: it.rate || 0,
          discount_pct: 0,
          gst_rate: it.gst_rate || 0,
        })),
      };
      // Create party on-the-fly if not found
      if (!payload.party_id && extracted?.party_name) {
        const { data: newParty } = await api.post("/parties", {
          name: extracted.party_name,
          phone: extracted.party_phone || "",
          role: extracted.type === "purchase" ? "vendor" : "customer",
          type: "individual",
          opening_balance: 0,
        });
        payload.party_id = newParty.id;
      }
      const { data: inv } = await api.post("/invoices", payload);
      // Record payment if cash/upi
      if (extracted?.payment_method && extracted.payment_method !== "credit" && inv?.totals?.grand_total > 0) {
        await api.post("/payments", {
          invoice_id: inv.id,
          party_id: payload.party_id,
          amount: inv.totals.grand_total,
          payment_date: extracted.invoice_date,
          method: extracted.payment_method === "upi" ? "upi" : "cash",
          notes: "Auto-recorded via AI",
        }).catch(() => {});
      }
      setCreated(inv);
      toast.success("Invoice created!");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    return (
      <div className="flex gap-3">
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
          <Bot className="h-4 w-4" />
        </div>
        <div className="rounded-2xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 max-w-sm">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-sm mb-1">
            <CheckCircle2 className="h-4 w-4" /> Invoice Created!
          </div>
          <p className="text-xs text-muted-foreground mb-2">#{created.invoice_number || created.id}</p>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => nav(`/sales/${created.id}`)}>
            View Invoice →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-3 max-w-sm w-full">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 font-semibold text-sm mb-3">
          <FileText className="h-4 w-4" /> Invoice Draft
        </div>

        {/* Party */}
        <div className="text-xs mb-2">
          <span className="text-muted-foreground">Customer: </span>
          <span className="font-semibold">{extracted?.party_name || "Walk-in"}</span>
          {party ? <span className="ml-1 text-green-600 text-[10px]">✓ found</span> : <span className="ml-1 text-amber-600 text-[10px]">• will be created</span>}
        </div>

        {/* Date & type */}
        <div className="text-xs mb-3 text-muted-foreground">
          {extracted?.type === "purchase" ? "Purchase" : "Sale"} · {extracted?.invoice_date} · {extracted?.payment_method || "credit"}
        </div>

        {/* Items */}
        <div className="space-y-1 mb-3">
          {(items || []).map((it, i) => (
            <div key={i} className="flex justify-between text-xs bg-white dark:bg-zinc-900 rounded px-2 py-1.5 border">
              <div>
                <span className="font-medium">{it.matched_product_name || it.name}</span>
                {it.matched_product_name && it.matched_product_name !== it.name && <span className="text-[10px] text-muted-foreground ml-1">({it.name})</span>}
                <div className="text-[10px] text-muted-foreground">{it.qty} {it.unit} × ₹{it.rate} · GST {it.gst_rate}%</div>
              </div>
              <div className="font-semibold text-right">₹{((it.qty||0)*(it.rate||0)).toLocaleString("en-IN")}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="text-xs border-t pt-2 mb-3 space-y-0.5">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>GST</span><span>{inr(tax)}</span></div>
          <div className="flex justify-between font-bold text-sm mt-1"><span>Total</span><span>{inr(subtotal + tax)}</span></div>
        </div>

        {error && <div className="flex items-center gap-1 text-xs text-red-600 mb-2"><AlertCircle className="h-3 w-3" />{error}</div>}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 h-8 text-xs" onClick={confirmCreate} disabled={creating}>
            {creating ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Creating…</> : "✓ Confirm & Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
