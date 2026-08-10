import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const fetchMessages = async () => {
    try {
      const { data } = await api.get("/chat/messages");
      setMessages(data);
    } catch {}
  };

  const fetchUnread = async () => {
    try {
      const { data } = await api.get("/chat/unread");
      setUnread(data.count);
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    if (open) {
      fetchMessages();
      pollRef.current = setInterval(fetchMessages, 4000);
      setUnread(0);
    } else {
      clearInterval(pollRef.current);
      fetchUnread();
      pollRef.current = setInterval(fetchUnread, 15000);
    }
    return () => clearInterval(pollRef.current);
  }, [open, user]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setText("");
    try {
      const { data } = await api.post("/chat/messages", { message: msg });
      setMessages(prev => [...prev, data]);
    } catch {}
    setSending(false);
  };

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl flex items-center justify-center transition-all"
        title="Chat with Support"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 flex flex-col rounded-2xl shadow-2xl border border-border bg-background overflow-hidden" style={{ height: 480 }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">S</div>
            <div className="flex-1">
              <p className="font-semibold text-sm">BillingsEasy Support</p>
              <p className="text-[11px] text-blue-100">We typically reply within a few hours</p>
            </div>
            <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50 dark:bg-slate-900">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground pt-10">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 text-blue-300" />
                <p>Send us a message!</p>
                <p className="text-xs mt-1">Our team will reply shortly.</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  m.sender === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white dark:bg-slate-800 text-foreground border border-border rounded-bl-sm"
                }`}>
                  {m.sender === "admin" && (
                    <p className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 mb-0.5">Support</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={`text-[10px] mt-0.5 ${m.sender === "user" ? "text-blue-100" : "text-muted-foreground"}`}>
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t bg-background">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Type a message…"
              className="flex-1 rounded-full border border-input bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
