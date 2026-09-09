import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, Landmark, Sparkles, Loader2, Pencil, Receipt } from "lucide-react";
import PartySelect from "@/components/PartySelect";
import { inr, fmtDate, todayISO } from "@/lib/format";

const ACCOUNT_TYPE_COLOR = {
  Current: "bg-blue-100 text-blue-700",
  Savings:  "bg-emerald-100 text-emerald-700",
  OD:       "bg-amber-100 text-amber-700",
  CC:       "bg-violet-100 text-violet-700",
  Wallet:   "bg-cyan-100 text-cyan-700",
};

export default function Payments() {
  const [tab, setTab] = useState("received");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editPayment, setEditPayment] = useState(null); // payment being edited

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/payments", { params: { direction: tab } });
    setList(data);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);
  const remove = async (id) => { await api.delete(`/payments/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-6" data-testid="payments-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Money In / Out</h1>
          <p className="text-sm text-muted-foreground mt-1">Record payments received from customers and payments made to suppliers — Cash, UPI, Bank, Cheque or Card.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="payment-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> New Payment
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="received" data-testid="tab-received">Money In</TabsTrigger>
          <TabsTrigger value="paid" data-testid="tab-paid">Money Out</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th>Date</th><th>Party</th><th>Mode</th>
                <th>Bank Account</th><th>Reference</th>
                <th>{tab === "paid" ? "Linked PO / Bill" : "Linked Invoice"}</th>
                <th className="text-right">Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={8}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No payments.</td></tr> :
                list.map(p => (
                  <tr key={p.id} data-testid={`payment-row-${p.id}`}>
                    <td className="text-muted-foreground">{fmtDate(p.date)}</td>
                    <td className="font-medium">{p.party_name}</td>
                    <td><Badge variant="secondary">{p.mode}</Badge></td>
                    <td>
                      {p.bank_account_name ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <Landmark className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{p.bank_account_name}</span>
                          {p.account_type && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ACCOUNT_TYPE_COLOR[p.account_type] || "bg-muted text-muted-foreground"}`}>
                              {p.account_type}
                            </span>
                          )}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-xs font-mono-fin">{p.reference || "—"}</td>
                    <td>
                      {p.linked_ref ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                          🔗 {p.linked_ref}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="num font-semibold">{inr(p.amount)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => setEditPayment(p)}>
                        <Pencil className="h-3.5 w-3.5 text-blue-500" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete payment?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PaymentDialog open={open} onClose={() => setOpen(false)} direction={tab} onSaved={load} />
      <PaymentDialog
        open={!!editPayment}
        onClose={() => setEditPayment(null)}
        direction={editPayment?.direction || tab}
        editId={editPayment?.id}
        initialData={editPayment}
        onSaved={() => { setEditPayment(null); load(); }}
      />
    </div>
  );
}

export function PaymentDialog({ open, onClose, direction = "received", onSaved, defaultAmount, defaultPartyId, editId = null, initialData = null }) {
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({
    party_id: defaultPartyId || "", amount: defaultAmount || 0,
    mode: "Bank Transfer", date: todayISO(), reference: "", bank_account_id: "",
  });
  const [activeDir, setActiveDir] = useState(direction);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [openItems, setOpenItems] = useState({ invoices: [], expenses: [] });
  const [openItemsLoading, setOpenItemsLoading] = useState(false);
  const [linkedItem, setLinkedItem] = useState(null); // { item_type, id, label, outstanding }
  const [expenseCategory, setExpenseCategory] = useState(""); // if set, also create expense on save
  const [expenseDesc, setExpenseDesc] = useState("");
  // outType: "payment" = supplier payment (linked to PO), "expense" = direct expense entry
  const [outType, setOutType] = useState("payment");

  useEffect(() => {
    if (open) {
      const dir = initialData?.direction || direction;
      setActiveDir(dir);
      api.get("/parties").then(r => setParties(r.data));
      api.get("/bank-accounts").then(r => setBanks(r.data));
      if (initialData) {
        // Edit mode — prefill from existing payment
        setForm({
          party_id: initialData.party_id || "",
          amount: initialData.amount || 0,
          mode: initialData.mode || "Bank Transfer",
          date: initialData.date || todayISO(),
          reference: initialData.reference || "",
          bank_account_id: initialData.bank_account_id || "",
          invoice_id: initialData.invoice_id || "",
          expense_id: initialData.expense_id || "",
          linked_type: initialData.linked_type || "",
        });
        if (initialData.linked_ref) {
          setLinkedItem({ id: initialData.invoice_id || initialData.expense_id, item_type: initialData.linked_type, label: initialData.linked_ref, invoice_no: initialData.linked_ref });
        } else { setLinkedItem(null); }
      } else {
        setForm(f => ({
          ...f,
          party_id: defaultPartyId || f.party_id,
          amount: defaultAmount || f.amount,
          invoice_id: "", expense_id: "", linked_type: "",
        }));
        setLinkedItem(null);
      }
      setAiText(""); setAiResult(null); setOpenItems({ invoices: [], expenses: [] });
    }
  }, [open, direction, defaultPartyId, defaultAmount, initialData]);

  // Load open items when party or direction changes
  useEffect(() => {
    if (!open) return;
    setOpenItemsLoading(true);

    if (activeDir === "paid") {
      // Money Out — fetch directly from /purchases (always works) + expenses
      Promise.all([
        api.get("/purchases"),
        api.get("/payments/open-items", { params: { direction: "paid" } }),
      ]).then(([purRes, expRes]) => {
        const allPurchases = purRes.data || [];
        // Filter by party if selected; otherwise show all
        const filtered = form.party_id
          ? allPurchases.filter(p => p.party_id === form.party_id)
          : allPurchases;
        // Map to same shape as open-items invoices — exclude paid and cancelled
        const invoices = filtered
          .filter(p => !["cancelled", "paid"].includes((p.status || "").toLowerCase()))
          .map(p => ({
            id: p.id,
            invoice_no: `PO-${p.bill_no || ""}`,
            total: p.totals?.grand_total || 0,
            paid: 0,
            outstanding: p.totals?.grand_total || 0,
            date: p.purchase_date || "",
            party_name: p.party_name || "",
            item_type: "invoice",
          }));
        setOpenItems({ invoices, expenses: expRes.data?.expenses || [] });
      }).catch(() => setOpenItems({ invoices: [], expenses: [] }))
        .finally(() => setOpenItemsLoading(false));
    } else {
      // Money In — use open-items as before
      const params = { direction: activeDir };
      if (form.party_id) params.party_id = form.party_id;
      api.get("/payments/open-items", { params })
        .then(r => setOpenItems(r.data))
        .catch(() => setOpenItems({ invoices: [], expenses: [] }))
        .finally(() => setOpenItemsLoading(false));
    }
  }, [form.party_id, activeDir, open]);

  const selectLinkedItem = (item) => {
    setLinkedItem(item);
    setForm(f => ({
      ...f,
      amount: item.outstanding,
      invoice_id: item.item_type === "invoice" ? item.id : "",
      expense_id: item.item_type === "expense" ? item.id : "",
      linked_type: item.item_type,
    }));
  };

  const parseWithAI = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const { data } = await api.post("/payments/ai-parse", { text: aiText, today: todayISO() });
      if (!data || !data.amount) { toast.error("Could not parse — try rephrasing"); return; }
      setAiResult(data);
      const dir = data.direction || activeDir;
      setActiveDir(dir);
      // Match party by name (fuzzy)
      const partyName = (data.party_name || "").toLowerCase();
      const matched = parties.find(p => p.name.toLowerCase().includes(partyName) || partyName.includes(p.name.toLowerCase()));
      setForm(f => ({
        ...f,
        party_id: matched ? matched.id : f.party_id,
        amount: data.amount || f.amount,
        date: data.date || f.date,
        mode: data.mode || f.mode,
        reference: data.reference || f.reference,
      }));
      // Auto-select suggested PO/SO link if AI found a match
      if (data.suggested_link) {
        selectLinkedItem(data.suggested_link);
        toast.success(`AI matched ${dir === "paid" ? "PO" : "SO"} ${data.suggested_link.invoice_no} (₹${data.suggested_link.outstanding?.toLocaleString("en-IN")}) — review and confirm ✨`);
      } else if (!matched && data.party_name) {
        toast.info(`Party "${data.party_name}" not found — select manually or create`, { duration: 4000 });
      } else {
        toast.success("AI filled the form — review and save ✨");
      }
    } catch { toast.error("AI parse failed"); }
    finally { setAiLoading(false); }
  };

  const save = async () => {
    if (!form.amount) { toast.error("Amount required"); return; }
    try {
      // ── EXPENSE MODE ─────────────────────────────────────────────────────────
      if (activeDir === "paid" && outType === "expense") {
        if (!expenseCategory) { toast.error("Select an expense category"); return; }
        const partyList = await api.get("/parties").then(r => r.data);
        const party = partyList.find(p => p.id === form.party_id);
        const paidTo = expenseDesc || (party ? party.name : expenseCategory);
        await api.post("/expenses", {
          category: expenseCategory,
          amount: parseFloat(form.amount),
          date: form.date || todayISO(),
          description: paidTo,
          gst_rate: 0,
          paid_via: form.mode || "",
          reference: form.reference || "",
          bank_account_id: form.bank_account_id === "__none__" ? "" : (form.bank_account_id || ""),
        });
        toast.success(`✅ Expense saved — ${expenseCategory}: ₹${parseFloat(form.amount).toLocaleString("en-IN")}`);
        onClose(); onSaved?.();
        setForm({ party_id: "", amount: 0, mode: "Bank Transfer", date: todayISO(), reference: "", bank_account_id: "" });
        setAiText(""); setAiResult(null); setExpenseCategory(""); setExpenseDesc(""); setOutType("payment");
        return;
      }

      // ── PAYMENT MODE ─────────────────────────────────────────────────────────
      if (!form.party_id) { toast.error("Party required"); return; }
      const payload = {
        ...form, direction: activeDir,
        amount: parseFloat(form.amount),
        bank_account_id: form.bank_account_id === "__none__" ? "" : form.bank_account_id,
      };
      if (editId) {
        await api.patch(`/payments/${editId}`, payload);
        toast.success("Payment updated");
      } else {
        const { data } = await api.post("/payments", payload);
        if (data.purchase_auto_closed) toast.success("✅ Payment saved — Purchase Bill marked as Paid!");
        else if (data.invoice_auto_closed) toast.success("✅ Payment saved — Invoice marked as Paid!");
        else toast.success("Payment saved");
      }
      // Also create expense if category selected (wallet recharge, logistics)
      if (!editId && expenseCategory && activeDir === "paid") {
        const partyList = await api.get("/parties").then(r => r.data);
        const party = partyList.find(p => p.id === form.party_id);
        await api.post("/expenses", {
          category: expenseCategory, amount: parseFloat(form.amount),
          date: form.date || todayISO(),
          description: expenseDesc || (party ? `Payment to ${party.name}` : expenseCategory),
          gst_rate: 0,
        });
        toast.success(`Expense also recorded under "${expenseCategory}"`);
      }
      onClose(); onSaved?.();
      setForm({ party_id: "", amount: 0, mode: "Bank Transfer", date: todayISO(), reference: "", bank_account_id: "" });
      setAiText(""); setAiResult(null); setExpenseCategory(""); setExpenseDesc(""); setOutType("payment");
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="payment-form-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeDir === "received" ? "💰" : "💸"}
            <span>{editId ? "Edit" : "New"} {activeDir === "received" ? "Money In" : "Money Out"}</span>
            <div className="ml-auto flex gap-1">
              <button onClick={() => setActiveDir("received")}
                className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${activeDir === "received" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "text-muted-foreground border-transparent hover:border-border"}`}>
                Money In
              </button>
              <button onClick={() => setActiveDir("paid")}
                className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${activeDir === "paid" ? "bg-rose-100 text-rose-700 border-rose-300" : "text-muted-foreground border-transparent hover:border-border"}`}>
                Money Out
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* AI Parse Bar */}
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" /> AI Quick Entry
          </div>
          <div className="flex gap-2">
            <Input
              className="h-8 text-sm bg-white border-violet-200 flex-1"
              placeholder='e.g. "Received ₹45k from Ravi Traders via NEFT on 3rd Sep, UTR 987654"'
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && parseWithAI()}
            />
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              onClick={parseWithAI} disabled={aiLoading || !aiText.trim()}>
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5 mr-1" />Parse</>}
            </Button>
          </div>
          {aiResult && (
            <div className="space-y-1">
              <div className="text-xs text-violet-600 bg-white rounded px-2 py-1 border border-violet-100">
                ✨ Detected: <strong>{aiResult.party_name || "—"}</strong> · ₹{aiResult.amount?.toLocaleString("en-IN")} · {aiResult.mode} · {aiResult.date}
                {aiResult.reference ? ` · Ref: ${aiResult.reference}` : ""}
              </div>
              {aiResult.suggested_link && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center gap-2">
                  <span className="text-amber-700 font-semibold">🔗 AI matched:</span>
                  <span className="text-amber-800 font-bold">{aiResult.suggested_link.invoice_no}</span>
                  <span className="text-amber-600">· ₹{aiResult.suggested_link.outstanding?.toLocaleString("en-IN")} outstanding</span>
                  {aiResult.suggested_link.party_name && <span className="text-muted-foreground">· {aiResult.suggested_link.party_name}</span>}
                  <span className="ml-auto text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">Auto-linked ✓</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Type toggle for Money Out: Transaction vs Expense */}
        {activeDir === "paid" && (
          <div className="flex rounded-lg border overflow-hidden text-sm font-semibold">
            <button type="button"
              onClick={() => setOutType("payment")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 transition-colors
                ${outType === "payment" ? "bg-rose-600 text-white" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}>
              💸 Supplier Payment
              <span className={`text-[10px] font-normal ${outType === "payment" ? "text-rose-100" : "text-muted-foreground"}`}>PO / vendor</span>
            </button>
            <button type="button"
              onClick={() => setOutType("expense")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 border-l transition-colors
                ${outType === "expense" ? "bg-orange-500 text-white" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}>
              🧾 Expense
              <span className={`text-[10px] font-normal ${outType === "expense" ? "text-orange-100" : "text-muted-foreground"}`}>salary / opex / other</span>
            </button>
          </div>
        )}

        <div className="space-y-3">
          {/* Expense mode: category first, party optional */}
          {activeDir === "paid" && outType === "expense" ? (
            <>
              <div className="space-y-1.5">
                <Label>Expense Category *</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger className="border-orange-300">
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Salaries","Rent","Electricity","Internet","Travel","Office","Repairs",
                      "Marketing","Logistics","Freight","Wallet Recharge","Bank Charges","Other"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description / Paid To</Label>
                <Input value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="e.g. Salary – Vijayakumar, Aug 2026" />
              </div>
            </>
          ) : (<>
          <div className="space-y-1.5">
            <Label>{activeDir === "received" ? "Customer" : "Supplier"} *</Label>
            <PartySelect
              parties={parties.filter(p => {
                const t = (p.type || "").toLowerCase();
                if (activeDir === "received") return t === "customer" || t === "both" || t === "";
                return t === "supplier" || t === "vendor" || t === "both" || t === "";
              })}
              value={form.party_id}
              onChange={(v) => setForm({ ...form, party_id: v })}
              role={activeDir === "received" ? "customer" : "supplier"}
              testId="pay-party-select"
              onCreated={(p) => setParties(prev => [...prev, p])} />
          </div>

          {/* Link to SO / PO / Expense — always visible */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                🔗 Link to {activeDir === "received" ? "Sale Order (SO)" : "Purchase Order / Expense"}
              </span>
              {linkedItem && (
                <button className="text-[11px] text-rose-500 hover:text-rose-700 font-medium" onClick={() => {
                  setLinkedItem(null);
                  setForm(f => ({ ...f, invoice_id: "", expense_id: "", linked_type: "" }));
                }}>✕ Unlink</button>
              )}
            </div>

            {linkedItem && (
              <div className="px-3 py-2 bg-blue-50 border-b flex items-center justify-between">
                <div className="text-xs">
                  <span className="font-semibold text-blue-800">{linkedItem.invoice_no || linkedItem.label}</span>
                  <span className="text-blue-600 ml-2">· ₹{linkedItem.outstanding?.toLocaleString("en-IN")} outstanding</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-200 text-blue-800 font-semibold">✓ Linked</span>
              </div>
            )}

            <div className="p-2 max-h-44 overflow-y-auto">
              {openItemsLoading ? (
                <div className="text-xs text-center py-3 text-muted-foreground">Loading…</div>
              ) : ([...openItems.invoices, ...openItems.expenses].length === 0) ? (
                <div className="text-xs text-center py-3 text-muted-foreground">
                  {form.party_id
                    ? `No open unpaid ${activeDir === "received" ? "sales orders" : "purchases/expenses"} for this party`
                    : `Select a party above to see their open ${activeDir === "received" ? "sales orders" : "purchases/expenses"}`}
                </div>
              ) : (
                <div className="space-y-1">
                  {[...openItems.invoices, ...openItems.expenses].map(item => {
                    const isSelected = linkedItem?.id === item.id;
                    return (
                      <button key={item.id} onClick={() => selectLinkedItem(item)}
                        className={`w-full text-left flex items-center justify-between px-2.5 py-2 rounded-md text-xs border transition-all
                          ${isSelected ? "bg-blue-50 border-blue-400 text-blue-800 ring-1 ring-blue-300" : "bg-white border-border hover:bg-blue-50/50 hover:border-blue-200"}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">{item.invoice_no || item.label || item.category}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                              item.item_type === "expense" ? "bg-orange-100 text-orange-700"
                              : activeDir === "received" ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-100 text-blue-700"}`}>
                              {item.item_type === "expense" ? "Expense" : activeDir === "received" ? "SO" : "PO"}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {item.party_name && <span>{item.party_name} · </span>}
                            {item.date}
                            {item.paid > 0 && <span className="ml-1 text-amber-600">· Partial ₹{item.paid?.toLocaleString("en-IN")} paid</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className="font-bold text-sm">₹{item.outstanding?.toLocaleString("en-IN")}</div>
                          <div className="text-muted-foreground text-[10px]">due</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </>)}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="pay-amount-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="pay-date-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                <SelectTrigger data-testid="pay-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Cash","Bank Transfer","UPI","NEFT","RTGS","IMPS","Cheque","Card","NACH"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bank Account</Label>
              <Select value={form.bank_account_id} onValueChange={(v) => setForm({ ...form, bank_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Cash / Not applicable —</SelectItem>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-2">
                        <span>{b.bank_name}</span>
                        <span className="text-muted-foreground text-xs">…{b.account_no?.slice(-4)}</span>
                        {b.account_type && (
                          <span className={`text-[10px] px-1 rounded ${ACCOUNT_TYPE_COLOR[b.account_type] || ""}`}>{b.account_type}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reference / UTR / Cheque #</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="UPI ref, UTR, cheque number…" data-testid="pay-ref-input" />
          </div>

          {/* Also record as Expense — supplier payment mode only */}
          {activeDir === "paid" && outType === "payment" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 overflow-hidden">
              <div className="px-3 py-2 border-b border-orange-200 flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-xs font-semibold text-orange-700">Also record as Expense</span>
                <span className="text-[10px] text-orange-500 ml-0.5">— optional, for P&amp;L tracking</span>
                {expenseCategory && (
                  <button className="ml-auto text-[11px] text-orange-500 hover:text-orange-700 font-medium"
                    onClick={() => { setExpenseCategory(""); setExpenseDesc(""); }}>✕ Clear</button>
                )}
              </div>
              <div className="p-2.5 space-y-2">
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger className="h-8 text-sm bg-white border-orange-200">
                    <SelectValue placeholder="Pick expense category (optional)…" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Logistics","Freight","Rent","Electricity","Internet","Salaries","Travel",
                      "Office","Repairs","Marketing","Wallet Recharge","Bank Charges","Other"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {expenseCategory && (
                  <Input className="h-8 text-sm bg-white border-orange-200"
                    placeholder="Description (optional)…"
                    value={expenseDesc}
                    onChange={e => setExpenseDesc(e.target.value)} />
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className={activeDir === "received" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"} onClick={save} data-testid="pay-save-button">
            {activeDir === "received" ? "💰 Save Money In" : "💸 Save Money Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
