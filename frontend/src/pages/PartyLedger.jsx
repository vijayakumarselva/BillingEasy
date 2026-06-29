import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export default function PartyLedger() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => { api.get(`/parties/${id}/ledger`).then(r => setData(r.data)); }, [id]);
  if (!data) return null;
  const { party, transactions, balance } = data;

  return (
    <div className="space-y-6" data-testid="party-ledger-page">
      <Button variant="ghost" onClick={() => nav(-1)} data-testid="ledger-back-button"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{party.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {party.type === "customer" ? "Customer" : "Supplier"} · {party.state} · GSTIN: {party.gstin || "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="font-mono-fin text-3xl font-semibold">{inr(balance)}</div>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {transactions.length === 0 ? <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No transactions.</td></tr> :
                transactions.map((t, i) => (
                  <tr key={i}>
                    <td className="text-muted-foreground">{fmtDate(t.date)}</td>
                    <td><Badge variant="secondary">{t.type}</Badge></td>
                    <td className="font-mono-fin text-xs">{t.ref}</td>
                    <td className="num">{t.debit ? inr(t.debit) : "—"}</td>
                    <td className="num">{t.credit ? inr(t.credit) : "—"}</td>
                    <td className="num font-semibold">{inr(t.balance)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
