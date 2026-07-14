import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, Receipt } from "lucide-react";
import { inr, fmtDate, todayISO } from "@/lib/format";

const CATEGORIES = ["Rent","Electricity","Internet","Salaries","Travel","Office","Repairs","Marketing","Other"];
const CAT_COLOR = {
  Rent: "bg-purple-100 text-purple-700", Electricity: "bg-yellow-100 text-yellow-700",
  Internet: "bg-blue-100 text-blue-700", Salaries: "bg-green-100 text-green-700",
  Travel: "bg-orange-100 text-orange-700", Office: "bg-indigo-100 text-indigo-700",
  Repairs: "bg-red-100 text-red-700", Marketing: "bg-pink-100 text-pink-700",
  Other: "bg-gray-100 text-gray-700",
};

export default function Expenses() {
  const [list, setList] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "Other", amount: 0, date: todayISO(), description: "", gst_rate: 0 });
  const [banks, setBanks] = useState([]);
  const [bankId, setBankId] = useState("");

  const load = async () => { setLoading(true); const { data } = await api.get("/expenses"); setList(data); setLoading(false); };
  useEffect(() => { load(); api.get("/bank-accounts").then(r => setBanks(r.data)); }, []);

  const save = async () => {
    try {
      await api.post("/expenses", { ...form, amount: parseFloat(form.amount), gst_rate: parseFloat(form.gst_rate), bank_account_id: (bankId && bankId !== "__none__") ? bankId : null });
      toast.success("Saved"); setOpen(false); load();
      setForm({ category: "Other", amount: 0, date: todayISO(), description: "", gst_rate: 0 }); setBankId("");
    } catch { toast.error("Failed"); }
  };
  const remove = async (id) => { await api.delete(`/expenses/${id}`); toast.success("Deleted"); load(); };

  return (
    <div className="space-y-0 md:space-y-6" data-testid="expenses-page">

      {/* Mobile header */}
      <div className="mobile-page-header mobile-only">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-rose-500" />
          <h2>Expenses</h2>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="bg-rose-500 hover:bg-rose-600 h-9 px-3" data-testid="expense-new-button">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* Desktop header */}
      <div className="desktop-only flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">Day-to-day spends — rent, electricity, internet, salaries.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700" data-testid="expense-new-button-desktop">
          <Plus className="h-4 w-4 mr-1.5" /> New Expense
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="mobile-only mobile-list-gap">
        {loading
          ? [1,2,3].map(i => <div key={i} className="mobile-list-card"><Skeleton className="h-10 w-full" /></div>)
          : list.length === 0
            ? <div className="text-center text-muted-foreground py-12 text-sm">No expenses yet.</div>
            : list.map(e => (
              <div key={e.id} className="mobile-list-card">
                <div className={`px-2 py-1.5 rounded-lg text-[11px] font-bold shrink-0 ${CAT_COLOR[e.category] || CAT_COLOR.Other}`}>
                  {(e.category || "Other").slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{e.category}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.description || fmtDate(e.date)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="mobile-amount text-rose-600">{inr(e.amount)}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete expense?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(e.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
        }
      </div>

      {/* Desktop table */}
      <Card className="desktop-only">
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="text-right">Amount</th><th></th></tr></thead>
            <tbody>
              {loading ? [1,2,3].map(i => <tr key={i}><td colSpan={5}><Skeleton className="h-8 w-full" /></td></tr>) :
                list.length === 0 ? <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No expenses.</td></tr> :
                list.map(e => (
                  <tr key={e.id}>
                    <td className="text-muted-foreground">{fmtDate(e.date)}</td>
                    <td className="font-medium">{e.category}</td>
                    <td className="text-muted-foreground">{e.description}</td>
                    <td className="num font-semibold">{inr(e.amount)}</td>
                    <td className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-rose-500" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(e.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setBankId(""); setOpen(v); }}>
        <DialogContent data-testid="expense-dialog">
          <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="exp-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="exp-amount-input" /></div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="exp-date-input" /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="exp-desc-input" /></div>
            <div className="space-y-1.5">
              <Label>Payment Bank</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger data-testid="exp-bank-select"><SelectValue placeholder="No bank / cash" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No bank / cash</SelectItem>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_no}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} data-testid="exp-save-button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
