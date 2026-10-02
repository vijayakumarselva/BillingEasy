// Contextual upgrade prompt. Any 402 carrying a plan-limit code fires
// "be:plan-limit" from lib/api.js; this listens once, app-wide, so every
// gated action gets the same friendly modal naming the exact plan that helps.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, Smartphone, Building2, Users, ArrowRight } from "lucide-react";

const inr = (paise) => "₹" + Math.round((paise || 0) / 100).toLocaleString("en-IN");

const ICONS = {
  PLAN_LIMIT_BUSINESSES: Building2,
  PLAN_LIMIT_USERS: Users,
  PLAN_LIMIT_DEVICES: Smartphone,
  FEATURE_NOT_IN_PLAN: Lock,
  INSUFFICIENT_CREDITS: Sparkles,
};

const TITLES = {
  PLAN_LIMIT_BUSINESSES: "Room for one more business",
  PLAN_LIMIT_USERS: "Add another teammate",
  PLAN_LIMIT_DEVICES: "Already signed in elsewhere",
  FEATURE_NOT_IN_PLAN: "That is on a higher plan",
  INSUFFICIENT_CREDITS: "You are out of AI scans",
};

export default function UpgradeModal() {
  const [info, setInfo] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const onLimit = (e) => setInfo(e.detail);
    window.addEventListener("be:plan-limit", onLimit);
    return () => window.removeEventListener("be:plan-limit", onLimit);
  }, []);

  if (!info) return null;
  const Icon = ICONS[info.code] || Sparkles;
  const credits = info.code === "INSUFFICIENT_CREDITS";
  const go = (path) => {
    setInfo(null);
    nav(path);
  };

  return (
    <Dialog open onOpenChange={() => setInfo(null)}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 grid place-items-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">
              {TITLES[info.code] || "Upgrade needed"}
            </DialogTitle>
            <DialogDescription className="text-sm mt-1.5 leading-relaxed">
              {info.message}
            </DialogDescription>
          </div>
        </div>

        {credits && Array.isArray(info.packs) && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {info.packs.map((p) => (
              <button
                key={p.code}
                onClick={() => go(`/billing?buy=${p.code}`)}
                className="rounded-lg border p-3 text-center hover:border-blue-400 transition-colors"
              >
                <div className="font-bold">{p.credits.toLocaleString("en-IN")}</div>
                <div className="text-[11px] text-muted-foreground">AI scans</div>
                <div className="text-sm font-semibold text-blue-600 mt-1">{inr(p.paise)}</div>
              </button>
            ))}
          </div>
        )}

        {info.code === "PLAN_LIMIT_DEVICES" && Array.isArray(info.devices) && (
          <ul className="mt-3 text-xs text-muted-foreground space-y-1">
            {info.devices.map((d) => (
              <li key={d.device_id}>• Signed in on {d.label || "a device"}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 mt-5">
          <Button variant="ghost" className="flex-1" onClick={() => setInfo(null)}>
            Not now
          </Button>
          {!credits && (
            <Button
              className="flex-1 gap-1.5"
              onClick={() =>
                go(info.suggested_plan ? `/billing?plan=${info.suggested_plan}` : "/billing")
              }
            >
              {info.suggested_plan_name
                ? `Get ${info.suggested_plan_name}${
                    info.suggested_plan_paise ? ` — ${inr(info.suggested_plan_paise)}/yr` : ""
                  }`
                : "See plans"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {credits && (
            <Button className="flex-1" onClick={() => go("/billing?tab=credits")}>
              Top up scans
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
