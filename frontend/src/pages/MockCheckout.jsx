// MOCK Cashfree checkout — a fake page that pretends to take payment.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function MockCheckout() {
  const [params] = useSearchParams();
  const subId = params.get("sub_id");
  const plan = params.get("plan");
  const [processing, setProcessing] = useState(false);
  const nav = useNavigate();

  const complete = async () => {
    setProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 1200));
      await api.post("/billing/mock-activate");
      toast.success("Subscription activated!");
      nav("/billing");
    } catch {
      toast.error("Activation failed");
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!subId) nav("/billing");
  }, [subId, nav]);

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-slate-50 dark:bg-slate-950">
      <Card className="max-w-md w-full p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-lg">Cashfree (Sandbox)</div>
          <div className="text-xs text-muted-foreground">MOCK MODE</div>
        </div>
        <div className="space-y-2 text-sm">
          <Row label="Subscription ID" value={<span className="font-mono-fin text-xs">{subId}</span>} />
          <Row label="Plan" value={<span className="font-mono-fin">{plan}</span>} />
          <Row label="Mode" value="UPI / Cards / Netbanking" />
        </div>
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          This is a simulated checkout — no real money will be charged. Once Cashfree keys are configured in production, real UPI/card collection happens here.
        </div>
        <div className="space-y-2">
          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={complete} disabled={processing} data-testid="mock-pay-button">
            {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</> : "Authorize & Pay"}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => nav("/billing")} disabled={processing}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-border pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
