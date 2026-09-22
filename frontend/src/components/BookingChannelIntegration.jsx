import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Globe, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/format";

const sample = (base, key) => `curl -X POST ${base}/integrations/bookings \\
  -H "X-Integration-Key: ${key || "YOUR_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "WEB-1042",         // your booking id — resending is safe
    "channel": "Website",              // or Airbnb, Booking.com, MakeMyTrip…
    "check_in": "2026-11-01",
    "check_out": "2026-11-03",
    "adults": 2,
    "room_type": "Cottage",            // or "room_number": "C1"
    "total_amount": 9450,              // what the guest pays, incl. GST
    "commission_amount": 900,          // what the channel keeps (optional)
    "advance_paid": 9450,              // already collected (optional)
    "guest": {"name": "Anita Rao", "phone": "9000011111", "state": "Karnataka"}
  }'`;

function Row({ label, value, secret }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs ${secret ? "text-emerald-700 font-semibold" : ""}`}>{value}</code>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function BookingChannelIntegration({ canEdit }) {
  const [st, setSt] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/integrations/bookings").then(r => setSt(r.data)).catch(() => setSt({ connected: false }));
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/integrations/bookings/key");
      setNewKey(data.key);
      toast.success("Key created — copy it now, it won't be shown again");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create key"); }
    finally { setBusy(false); }
  };

  if (!st) return <Card className="p-6 h-40 animate-pulse" />;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-teal-50 flex items-center justify-center"><Globe className="h-5 w-5 text-teal-600" /></span>
          <div>
            <h3 className="font-semibold">Booking channels (website / OTA)</h3>
            <p className="text-xs text-muted-foreground">Bookings posted here become guests, bookings, advances and invoices automatically. Anything that can't be matched to a free room waits in Stay → Inbox.</p>
          </div>
        </div>
        {st.connected
          ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Key active</Badge>
          : <Badge variant="secondary">Not connected</Badge>}
      </div>

      {st.connected && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Bookings received</p><p className="text-lg font-semibold">{st.bookings_received}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Waiting in inbox</p><p className={`text-lg font-semibold ${st.inbox_pending ? "text-amber-600" : ""}`}>{st.inbox_pending}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Last booking received</p><p className="text-sm font-medium">{st.last_used_at ? fmtDate(st.last_used_at) : "Never"}</p></div>
        </div>
      )}

      <div className="space-y-3">
        <Row label="Booking API URL" value={`${API_BASE}/integrations/bookings`} />
        {newKey
          ? <Row label="Integration key (shown once)" value={newKey} secret />
          : st.connected && <p className="text-xs text-muted-foreground">Current key ends in <code>…{st.key_hint}</code>. Keys are stored hashed and can't be shown again.</p>}
      </div>

      <details className="rounded-lg border p-3">
        <summary className="text-sm font-medium cursor-pointer">How to send a booking</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-3 text-[11px] leading-relaxed">{sample(API_BASE, newKey || (st.connected ? "be_bk_…" : ""))}</pre>
        <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc pl-4">
          <li>Send the same <code>external_id</code> again to update nothing — duplicates are ignored.</li>
          <li>Send <code>"status": "cancelled"</code> with the same id to cancel the booking.</li>
          <li>Trips: <code>"booking_type": "package"</code>, <code>package_name</code>, <code>package_amount</code>; check-out can be the same day.</li>
          <li>Check what's free: <code>GET {API_BASE}/integrations/bookings/availability?date_from=…&amp;date_to=…</code></li>
        </ul>
      </details>

      {canEdit && (
        st.connected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}><KeyRound className="h-4 w-4 mr-1.5" />Regenerate key</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate the booking key?</AlertDialogTitle>
                <AlertDialogDescription>The current key stops working immediately. Bookings from your website or OTA won't arrive until the new key is in place.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={generate}>Regenerate</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : <Button onClick={generate} disabled={busy} className="bg-teal-600 hover:bg-teal-700"><KeyRound className="h-4 w-4 mr-1.5" />Generate booking key</Button>
      )}
    </Card>
  );
}
