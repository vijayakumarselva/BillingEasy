// Ask BillEasy — streaming AI bookkeeper chat (Claude Sonnet 4.5).
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Sparkles, User as UserIcon, Plus, History, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUGGESTIONS = [
  "How much GST do I owe this month?",
  "Top 5 customers by revenue in the last 30 days",
  "Show me overdue invoices",
  "Am I ready to file GSTR-1?",
  "What is ITC and how do I claim it?",
  "Mere expenses kitne hue is mahine?",
];

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
    setMessages(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const token = localStorage.getItem("token");
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
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: `(AI service error: ${payload.error})` };
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
            <div className="font-semibold flex items-center gap-2">Ask BillEasy <Badge className="bg-violet-600 text-[10px]">AI</Badge></div>
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
          {messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} streaming={streaming && i === messages.length - 1} />)}
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

function ChatBubble({ role, content, streaming }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`} data-testid={`msg-${role}`}>
      {!isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${isUser ? "bg-blue-600 text-white" : "bg-muted"}`}>
        {content || (streaming ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> thinking…</span> : "")}
      </div>
      {isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-blue-600 grid place-items-center text-white">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
