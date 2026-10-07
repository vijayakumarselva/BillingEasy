// Connect Zoho Inventory (or Books) so invoices raised here appear there, and
// the e-way bill raised there comes back here.
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, fmtDate } from "@/lib/format";
import {
  ExternalLink, Loader2, Plug, RefreshCcw, Truck, CheckCircle2, AlertTriangle,
} from "lucide-react";

export default function ZohoIntegration({ canEdit = true }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [queue, setQueue] = useState(null);
  const [redirectUri, setRedirectUri] = useState("");
  // Two ways in: a Server-based Application approves through a redirect, a
  // Self Client hands you a code to paste. Both end with a refresh token.
  const [how, setHow] = useState("redirect");

  const load = async () => {
    const { data } = await api.get("/integrations/zoho");
    setCfg(data);
    setForm(data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get("/integrations/zoho/redirect-uri")
      .then((r) => setRedirectUri(r.data.redirect_uri)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy("save");
    try {
      const { data } = await api.put("/integrations/zoho", {
        enabled: !!form.enabled, product: form.product || "inventory",
        data_centre: form.data_centre || "in",
        client_id: form.client_id || "", client_secret: form.client_secret || "",
        organization_id: form.organization_id || "",
        organization_name: form.organization_name || "",
        auto_push: !!form.auto_push, sync_items: form.sync_items !== false,
        pull_eway: form.pull_eway !== false, redirect_uri: form.redirect_uri || "",
      });
      setCfg(data); setForm(data);
      toast.success("Saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save");
    } finally { setBusy(""); }
  };

  const approve = async () => {
    setBusy("approve");
    try {
      const { data } = await api.get("/integrations/zoho/authorize");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start the approval");
      setBusy("");
    }
  };

  const connect = async () => {
    if (!code.trim()) return toast.error("Paste the code from the Zoho API console");
    setBusy("connect");
    try {
      const { data } = await api.post("/integrations/zoho/connect", { code: code.trim() });
      setOrgs(data.organizations || []);
      setCode("");
      toast.success("Connected to Zoho");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Zoho refused that code");
    } finally { setBusy(""); }
  };

  const test = async () => {
    setBusy("test");
    try {
      const { data } = await api.post("/integrations/zoho/test");
      setOrgs(data.organizations || []);
      toast.success(data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not reach Zoho");
    } finally { setBusy(""); }
  };

  const pushPending = async () => {
    setBusy("push");
    try {
      const { data } = await api.post("/integrations/zoho/push-pending");
      toast.success(`${data.sent} of ${data.tried} sent to Zoho`);
      if (data.first_error) toast.error(data.first_error);
      loadQueue(); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not send");
    } finally { setBusy(""); }
  };

  const syncEway = async () => {
    setBusy("eway");
    try {
      const { data } = await api.post("/integrations/zoho/sync-eway");
      toast.success(data.found
        ? `${data.found} e-way bill${data.found === 1 ? "" : "s"} brought back`
        : `Checked ${data.checked} — none raised in Zoho yet`);
      loadQueue();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not check Zoho");
    } finally { setBusy(""); }
  };

  const loadQueue = async () => {
    const { data } = await api.get("/integrations/zoho/queue", { params: { limit: 50 } });
    setQueue(data.rows);
  };

  if (!cfg) return <Card className="p-6 text-muted-foreground text-sm">Loading…</Card>;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Plug className="h-4 w-4" /> Zoho Inventory / Books
            {cfg.connected
              ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Connected</Badge>
              : <Badge variant="outline">Not connected</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Invoices raised here are mirrored into Zoho, so you can keep raising e-way bills
            there. The e-way bill number comes back and shows on the invoice here.
          </p>
        </div>
        {cfg.connected && (
          <div className="text-right text-xs text-muted-foreground">
            <div>{cfg.pushed} invoice{cfg.pushed === 1 ? "" : "s"} sent</div>
            {cfg.failed > 0 && <div className="text-rose-600">{cfg.failed} failed</div>}
          </div>
        )}
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Which Zoho product</Label>
          <Select value={form.product || "inventory"} onValueChange={(v) => set("product", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inventory">Zoho Inventory</SelectItem>
              <SelectItem value="books">Zoho Books</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Data centre</Label>
          <Select value={form.data_centre || "in"} onValueChange={(v) => set("data_centre", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(cfg.data_centres || {}).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Must match where your Zoho account lives, or the token will be rejected.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Client ID</Label>
          <Input value={form.client_id || ""} onChange={(e) => set("client_id", e.target.value)}
                 placeholder="1000.XXXXXXXXXXXXXXXX" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Client Secret</Label>
          <Input type="password" value={form.client_secret || ""}
                 onChange={(e) => set("client_secret", e.target.value)}
                 placeholder="kept encrypted" />
        </div>
      </div>

      <details className="text-xs text-muted-foreground" open={!cfg.connected}>
        <summary className="cursor-pointer font-medium text-foreground">
          Where to get the Client ID, Secret and code
        </summary>
        <ol className="list-decimal ml-5 mt-2 space-y-1.5">
          <li>
            Open{" "}
            <a className="underline inline-flex items-center gap-0.5"
               href={cfg.console_url || "https://api-console.zoho.in/"}
               target="_blank" rel="noreferrer">
              {(cfg.console_url || "https://api-console.zoho.in/").replace("https://", "")}
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            — signed in as the same Zoho account that owns the organisation.
          </li>
          <li>
            <strong>Add Client → Self Client → Create</strong>. Self Client needs no redirect
            URL; it exists for exactly this kind of server-to-server link.
          </li>
          <li>
            Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> it shows
            into the boxes above, then press <strong>Save</strong> here.
          </li>
          <li>
            Back in Zoho, open the <strong>Generate Code</strong> tab of that same Self Client.
            Paste this into <em>Scope</em>:
            <code className="block bg-muted rounded p-1.5 mt-1 break-all select-all">
              {cfg.scopes}
            </code>
            set <em>Time Duration</em> to 10 minutes, type any description, and press
            <strong> Create</strong>. Choose your organisation when it asks.
          </li>
          <li>
            Zoho then shows a code starting <code>1000.</code> — that is the one-time code.
            Copy it and paste it below, then press Connect.
          </li>
        </ol>
        <p className="mt-2">
          The code is single-use and expires in the minutes you chose. If it fails, generate a
          fresh one — do not reuse the old.
        </p>
      </details>

      {/* Connect */}
      {canEdit && (
        <div className="space-y-3">
          <div className="inline-flex bg-muted rounded-lg p-1">
            {[["redirect", "I have a Server-based app"],
              ["code", "I have a Self Client"]].map(([v, l]) => (
              <button key={v} onClick={() => setHow(v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                        how === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {l}
              </button>
            ))}
          </div>

          {how === "redirect" ? (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Add this to <em>Authorized Redirect URIs</em> in the Zoho console first
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={redirectUri} className="font-mono text-xs" />
                  <Button variant="outline" onClick={() => {
                    navigator.clipboard?.writeText(redirectUri);
                    toast.success("Copied — paste it into Zoho, press Update, then Approve");
                  }}>Copy</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  It must match character for character, and your Client ID and Secret must be
                  saved here first.
                </p>
              </div>
              <Button onClick={approve} disabled={busy === "approve"} className="gap-1.5">
                {busy === "approve" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {cfg.connected ? "Approve again in Zoho" : "Approve in Zoho"}
              </Button>
            </div>
          ) : (
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label className="text-xs">
              One-time code from Zoho's <em>Generate Code</em> tab
            </Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)}
                   placeholder="1000.xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx" />
            <p className="text-[11px] text-muted-foreground">
              Single use, and expires in minutes — paste it as soon as Zoho shows it.
            </p>
          </div>
          <Button onClick={connect} disabled={busy === "connect"} className="gap-1.5">
            {busy === "connect" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {cfg.connected ? "Reconnect" : "Connect"}
          </Button>
        </div>
          )}
          {cfg.connected && (
            <Button variant="outline" onClick={test} disabled={busy === "test"}>
              Test connection
            </Button>
          )}
        </div>
      )}

      {/* Organisation */}
      {(orgs.length > 0 || cfg.organization_id) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Send invoices to this Zoho organisation</Label>
          <Select value={form.organization_id || ""}
                  onValueChange={(v) => {
                    const o = orgs.find((x) => x.organization_id === v);
                    setForm((f) => ({ ...f, organization_id: v,
                                      organization_name: o?.name || f.organization_name }));
                  }}>
            <SelectTrigger>
              <SelectValue placeholder={cfg.organization_name || "Choose one"} />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.organization_id} value={o.organization_id}>
                  {o.name}{o.gstin ? ` · ${o.gstin}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orgs.length === 0 && cfg.organization_name && (
            <p className="text-[11px] text-muted-foreground">
              Currently {cfg.organization_name}. Press Test connection to reload the list.
            </p>
          )}
        </div>
      )}

      {/* Behaviour */}
      <div className="space-y-3 rounded-lg border p-3">
        {[
          ["enabled", "Use Zoho", "Nothing is sent until this is on."],
          ["auto_push", "Send each sale as it is raised",
           "Finalized sales go across on their own. Otherwise send them by hand below."],
          ["sync_items", "Create missing items in Zoho",
           "Matches on SKU, then name. Off means lines go across as plain text."],
          ["pull_eway", "Bring the e-way bill number back",
           "After you raise it in Zoho, it appears on the invoice here."],
        ].map(([key, title, help]) => (
          <div key={key} className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>
            <Switch checked={key === "enabled" ? !!form.enabled : form[key] !== false}
                    onCheckedChange={(v) => set(key, v)} disabled={!canEdit} />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2 flex-wrap">
          <Button onClick={save} disabled={busy === "save"}>Save</Button>
          {cfg.connected && cfg.enabled && (
            <>
              <Button variant="outline" onClick={pushPending} disabled={busy === "push"}
                      className="gap-1.5">
                {busy === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                 : <RefreshCcw className="h-3.5 w-3.5" />}
                Send everything not yet in Zoho
              </Button>
              <Button variant="outline" onClick={syncEway} disabled={busy === "eway"}
                      className="gap-1.5">
                {busy === "eway" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                 : <Truck className="h-3.5 w-3.5" />}
                Fetch e-way bills from Zoho
              </Button>
              <Button variant="ghost" onClick={loadQueue}>Show what has gone across</Button>
            </>
          )}
        </div>
      )}

      {queue && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">In Zoho</th>
                <th className="px-3 py-2 text-left">E-way bill</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nothing yet.
                </td></tr>
              )}
              {queue.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.invoice_no}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtDate(r.invoice_date)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.party}</td>
                  <td className="px-3 py-2 text-right">{inr(r.total)}</td>
                  <td className="px-3 py-2">
                    {r.zoho_invoice_id ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {r.zoho_url
                          ? <a className="underline" href={r.zoho_url} target="_blank"
                               rel="noreferrer">{r.zoho_invoice_number || "open"}</a>
                          : (r.zoho_invoice_number || "sent")}
                      </span>
                    ) : r.zoho_error ? (
                      <span className="text-rose-600 text-xs inline-flex items-start gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {r.zoho_error}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">not sent</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.ewb_no || <span className="text-muted-foreground font-sans">—</span>}
                    {r.ewb_source === "zoho" && r.ewb_no && (
                      <span className="block text-[10px] text-muted-foreground font-sans">
                        from Zoho
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
