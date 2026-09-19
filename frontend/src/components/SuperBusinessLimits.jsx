import { Fragment, useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { inr } from "@/lib/format";

const TYPES = [["b2b", "B2B"], ["b2c", "B2C"], ["restaurant", "Restaurant"], ["pos", "POS"], ["stay", "Stay"]];

function LimitsEditor({ value, onSave, saveLabel = "Save" }) {
  const [f, setF] = useState(value);
  useEffect(() => setF(value), [value]);
  const toggle = t => setF(x => ({ ...x, allowed_types: x.allowed_types.includes(t) ? x.allowed_types.filter(y => y !== t) : [...x.allowed_types, t] }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1"><Label className="text-xs">Included in plan</Label><Input type="number" min="0" value={f.included_businesses} onChange={e => setF({ ...f, included_businesses: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">Max businesses</Label><Input type="number" min="1" value={f.max_businesses} onChange={e => setF({ ...f, max_businesses: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">Add-on ₹ / business / month</Label><Input type="number" min="0" value={f.addon_price_monthly} onChange={e => setF({ ...f, addon_price_monthly: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map(([v, l]) => (
          <button key={v} type="button" onClick={() => toggle(v)}
            className={`text-xs px-3 py-1.5 rounded-full border ${f.allowed_types.includes(v) ? "bg-blue-600 text-white border-blue-600" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      <Button size="sm" onClick={() => onSave({ included_businesses: +f.included_businesses, max_businesses: +f.max_businesses,
        addon_price_monthly: +f.addon_price_monthly, allowed_types: f.allowed_types })}>{saveLabel}</Button>
    </div>
  );
}

export default function SuperBusinessLimits() {
  const [defaults, setDefaults] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const load = () => {
    api.get("/super/business-limits").then(r => setDefaults(r.data.defaults));
    api.get("/super/accounts").then(r => setAccounts(r.data));
  };
  useEffect(() => { load(); }, []);

  const rows = accounts.filter(a => !q || `${a.user.name} ${a.user.email} ${a.businesses.map(b => b.name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const addonMRR = accounts.reduce((s, a) => s + a.addon_monthly_total, 0);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Accounts</p><p className="text-2xl font-semibold">{accounts.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Businesses</p><p className="text-2xl font-semibold">{accounts.reduce((s, a) => s + a.owned_count, 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Add-on revenue / month</p><p className="text-2xl font-semibold">{inr(addonMRR)}</p></Card>
      </div>

      {defaults && (
        <Card className="p-4">
          <h3 className="font-semibold mb-1">Default for every account</h3>
          <p className="text-xs text-muted-foreground mb-3">Applies unless an account has its own setting below.</p>
          <LimitsEditor value={defaults} saveLabel="Save defaults"
            onSave={async body => { await api.put("/super/business-limits", body); toast.success("Defaults saved"); load(); }} />
        </Card>
      )}

      <Card>
        <div className="p-3"><Input placeholder="Search owner or business…" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" /></div>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Owner</th><th>Businesses</th><th>Limit</th><th className="text-right">Add-on / month</th><th></th></tr></thead>
            <tbody>
              {rows.map(a => (
                <Fragment key={a.user.id}>
                  <tr>
                    <td><div className="font-medium">{a.user.name}</div><div className="text-xs text-muted-foreground">{a.user.email}</div></td>
                    <td className="text-xs">{a.businesses.map(b => <div key={b.id}>{b.name} <Badge variant="secondary" className="text-[10px]">{b.type_label}</Badge></div>)}</td>
                    <td className="text-sm">{a.owned_count} / {a.limits.max_businesses}<div className="text-xs text-muted-foreground">{a.limits.included_businesses} included{Object.keys(a.override || {}).length ? " · custom" : ""}</div></td>
                    <td className="num">{inr(a.addon_monthly_total)}<div className="text-xs text-muted-foreground">{a.extra_businesses} × {inr(a.limits.addon_price_monthly)}</div></td>
                    <td className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(editing === a.user.id ? null : a.user.id)}>{editing === a.user.id ? "Close" : "Edit"}</Button></td>
                  </tr>
                  {editing === a.user.id && (
                    <tr key={a.user.id + "-edit"}><td colSpan={5} className="bg-muted/30">
                      <LimitsEditor value={a.limits} saveLabel="Save for this account"
                        onSave={async body => { await api.put(`/super/accounts/${a.user.id}/business-limits`, body); toast.success(`Updated ${a.user.email}`); setEditing(null); load(); }} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
