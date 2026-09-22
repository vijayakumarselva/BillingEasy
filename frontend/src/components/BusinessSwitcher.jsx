import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check, Lock, ArrowLeft } from "lucide-react";
import { STATES } from "@/pages/Parties";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

export const BUSINESS_MODES = [
  { value: "b2b",        label: "B2B Billing",   emoji: "🏢", color: "bg-blue-600",   desc: "GST invoices, purchases, ledgers" },
  { value: "b2c",        label: "B2C Retail",    emoji: "🛒", color: "bg-orange-500", desc: "Sales, POS, retail billing" },
  { value: "restaurant", label: "Restaurant",    emoji: "🍽️", color: "bg-red-500",    desc: "Table orders, KOT, menus" },
  { value: "pos",        label: "POS / Counter", emoji: "🖥️", color: "bg-indigo-600", desc: "Retail counter & quick billing" },
  { value: "stay",       label: "Stay / Hotel",  emoji: "🏨", color: "bg-teal-600",   desc: "Rooms, bookings, check-in/out" },
];
export const modeInfo = (v) => BUSINESS_MODES.find(m => m.value === v);

/** Business picker: switch between standalone businesses, add a new one, and (for a
 *  legacy multi-type company only) switch its type view. */
export default function BusinessSwitcher({ open, onClose, orgId, currentOrg, businessMode, onChooseMode, onSwitch, startInAdd = false }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", business_type: "", state_code: "33", gstin: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAdding(startInAdd);
    api.get("/businesses").then(r => setData(r.data)).catch(() => setData({ businesses: [], account: null }));
  }, [open, startInAdd]);

  if (!open) return null;
  const acct = data?.account;
  const legacy = currentOrg && !currentOrg.business_type;

  const create = async () => {
    if (form.name.trim().length < 2) { toast.error("Enter the business name"); return; }
    if (!form.business_type) { toast.error("Choose the business type"); return; }
    setSaving(true);
    try {
      const st = STATES.find(s => s.code === form.state_code);
      const { data: b } = await api.post("/businesses", { ...form, name: form.name.trim(), state: st?.name || "" });
      toast.success(`${b.name} created — it has its own parties, products, invoices and team`);
      onSwitch(b.id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create business"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {!adding ? (
          <>
            <div className="p-6 pb-3">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your businesses</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Each business is fully separate — its own parties, products, invoices, accounts and team.</p>
            </div>
            <div className="px-6 space-y-2">
              {!data && [1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
              {data?.businesses.map(b => {
                const m = modeInfo(b.business_type);
                const active = b.id === orgId;
                return (
                  <button key={b.id} onClick={() => !active && onSwitch(b.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${active ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-100 dark:border-gray-800 hover:border-blue-300"}`}>
                    <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl ${m?.color || "bg-gray-500"}`}>{m?.emoji || "🏬"}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm text-gray-900 dark:text-white truncate">{b.name}</span>
                      <span className="block text-xs text-gray-500">{b.type_label}{b.role !== "owner" ? ` · ${b.role}` : ""}</span>
                    </span>
                    {active && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                );
              })}
            </div>
            {legacy && (
              <div className="px-6 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">View for {currentOrg.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  {BUSINESS_MODES.filter(m => m.value !== "stay").map(m => (
                    <button key={m.value} onClick={() => onChooseMode(m.value)}
                      className={`rounded-xl border-2 px-3 py-2 text-left text-sm ${businessMode === m.value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-100 dark:border-gray-800 hover:border-blue-300"}`}>
                      {m.emoji} <span className="font-semibold">{m.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">This company mixes several types. For fully separate books, add a new business instead.</p>
              </div>
            )}
            <div className="p-6 flex flex-col gap-2">
              {acct && (acct.can_add
                ? <Button onClick={() => setAdding(true)} className="w-full bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-1.5" /> Add business</Button>
                : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                    <div className="flex gap-2">
                      <Lock className="h-4 w-4 shrink-0" />
                      <span>
                        Your plan includes {acct.limits.max_businesses} business{acct.limits.max_businesses !== 1 ? "es" : ""}.
                        {user?.is_super_admin
                          ? " Raise the limit in the platform console to add another (B2B, B2C, Restaurant, POS or Stay / Resort / Homestay)."
                          : ` To add more, contact BillingsEasy support — ₹${acct.limits.addon_price_monthly}/month per extra business.`}
                      </span>
                    </div>
                    {user?.is_super_admin && (
                      <Button size="sm" variant="outline" className="h-8"
                        onClick={() => { onClose(); nav("/super"); }}>Open platform console</Button>
                    )}
                  </div>
                ))}
              <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2">Close</button>
            </div>
          </>
        ) : (
          <div className="p-6 space-y-4">
            <button onClick={() => setAdding(false)} className="text-sm text-gray-500 flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> Back</button>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add a business</h2>
              <p className="text-sm text-gray-500 mt-1">Starts empty and standalone. Add staff to it separately under Settings → Team.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Business name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. NammaHut Wholesale" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_MODES.map(m => {
                  const allowed = !acct || acct.types.find(t => t.value === m.value)?.allowed;
                  return (
                    <button key={m.value} type="button" disabled={!allowed}
                      onClick={() => setForm(f => ({ ...f, business_type: m.value }))}
                      className={`rounded-xl border-2 p-3 text-left ${form.business_type === m.value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-100 dark:border-gray-800"} ${allowed ? "hover:border-blue-300" : "opacity-40 cursor-not-allowed"}`}>
                      <div className="text-sm font-semibold">{m.emoji} {m.label}</div>
                      <div className="text-[11px] text-gray-500">{allowed ? m.desc : "Not enabled — contact support"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={form.state_code} onValueChange={v => setForm(f => ({ ...f, state_code: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN (optional)</Label>
                <Input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="33ABCDE1234F1Z5" />
              </div>
            </div>
            {acct && acct.owned_count >= acct.limits.included_businesses && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                This is an extra business on your plan: ₹{acct.limits.addon_price_monthly}/month.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">{saving ? "Creating…" : "Create business"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
