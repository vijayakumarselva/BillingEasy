import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";

export default function AuditLogPanel() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => { api.get("/audit-logs", { params: { limit: 300 } }).then(r => setItems(r.data)); }, []);
  if (items === null) return <Skeleton className="h-40 w-full mt-4" />;

  const filtered = items.filter(e =>
    !search ||
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    (e.user_email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="mt-4" data-testid="audit-panel">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Audit Log</h3>
          <p className="text-xs text-muted-foreground">All sensitive actions are recorded with user, IP and timestamp.</p>
        </div>
        <Input placeholder="Search by action or user…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64" data-testid="audit-search-input" />
      </div>
      <div className="overflow-x-auto"><table className="app-table">
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
        <tbody>
          {filtered.length === 0 ? <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No events.</td></tr> :
            filtered.map(e => (
              <tr key={e.id} data-testid={`audit-row-${e.id}`}>
                <td className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.timestamp)} {e.timestamp?.slice(11, 19)}</td>
                <td>
                  <div className="font-medium text-sm">{e.user_name || e.user_email}</div>
                  <div className="text-[10px] text-muted-foreground">{e.user_email}</div>
                </td>
                <td><Badge variant="secondary" className="font-mono-fin text-[11px]">{e.action}</Badge></td>
                <td className="text-xs">
                  {e.entity_type && <span className="text-muted-foreground">{e.entity_type}</span>}
                  {e.metadata?.invoice_no && <span className="ml-1 font-mono-fin">{e.metadata.invoice_no}</span>}
                  {e.metadata?.name && <span className="ml-1">{e.metadata.name}</span>}
                  {e.metadata?.email && <span className="ml-1">{e.metadata.email}</span>}
                </td>
                <td className="font-mono-fin text-xs text-muted-foreground">{e.ip || "—"}</td>
              </tr>
            ))}
        </tbody>
      </table></div>
    </Card>
  );
}
