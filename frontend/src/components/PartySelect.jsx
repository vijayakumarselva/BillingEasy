import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import api from "@/lib/api";
import GstinField from "@/components/GstinField";

/**
 * Drop-in replacement for party/customer/supplier selects.
 * Shows an inline "Create" prompt when the list is empty.
 *
 * Props:
 *   parties   – array of { id, name }
 *   value     – selected id
 *   onChange  – (id) => void
 *   role      – "customer" | "supplier" | "both" (default "both")
 *   placeholder – string
 *   onCreated – (party) => void  — called after quick-create succeeds
 *   testId    – data-testid for trigger
 */
export default function PartySelect({
  parties = [],
  value,
  onChange,
  role = "both",
  placeholder,
  onCreated,
  testId,
}) {
  const nav = useNavigate();
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [saving, setSaving] = useState(false);

  const label = role === "customer" ? "Customer" : role === "supplier" ? "Supplier" : "Party";
  const ph = placeholder || `Select ${label.toLowerCase()}`;

  const quickCreate = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/parties", {
        name: name.trim(),
        phone: phone.trim(),
        gstin: gstin.trim(),
        role: role === "both" ? "customer" : role,
      });
      toast.success(`${data.name} created`);
      setShowQuickCreate(false);
      setName(""); setPhone(""); setGstin("");
      if (onCreated) onCreated(data);
      onChange(data.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create");
    } finally { setSaving(false); }
  };

  /* ── Empty state ── */
  if (parties.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-dashed text-sm text-muted-foreground"
          style={{ borderColor: "hsl(var(--tally-green) / 0.4)" }}>
          <Users className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--tally-green))" }} />
          <span>No {label.toLowerCase()}s yet —</span>
          <button type="button" className="font-semibold hover:underline"
            style={{ color: "hsl(var(--tally-green))" }}
            onClick={() => setShowQuickCreate(true)}>
            Create one now
          </button>
          <span className="opacity-40">or</span>
          <button type="button" className="font-semibold hover:underline"
            style={{ color: "hsl(var(--tally-green))" }}
            onClick={() => nav("/parties")}>
            Go to Parties →
          </button>
        </div>

        <QuickCreateDialog
          open={showQuickCreate}
          onClose={() => setShowQuickCreate(false)}
          label={label}
          name={name} setName={setName}
          phone={phone} setPhone={setPhone}
          gstin={gstin} setGstin={setGstin}
          saving={saving}
          onSave={quickCreate}
        />
      </>
    );
  }

  /* ── Normal select with footer to create new ── */
  return (
    <>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={ph} />
        </SelectTrigger>
        <SelectContent>
          {parties.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
          {/* ── Create new at bottom of list ── */}
          <div className="border-t mt-1 pt-1">
            <button type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded hover:bg-accent"
              style={{ color: "hsl(var(--tally-green))" }}
              onMouseDown={(e) => { e.preventDefault(); setShowQuickCreate(true); }}>
              <UserPlus className="h-3.5 w-3.5" /> New {label}
            </button>
          </div>
        </SelectContent>
      </Select>

      <QuickCreateDialog
        open={showQuickCreate}
        onClose={() => setShowQuickCreate(false)}
        label={label}
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        gstin={gstin} setGstin={setGstin}
        saving={saving}
        onSave={quickCreate}
      />
    </>
  );
}

function QuickCreateDialog({ open, onClose, label, name, setName, phone, setPhone, gstin, setGstin, saving, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" style={{ color: "hsl(var(--tally-green))" }} />
            Quick Create {label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>GSTIN <span className="text-muted-foreground text-xs">(auto-fills name & address)</span></Label>
            <GstinField
              value={gstin} onChange={setGstin}
              onLookup={(info) => {
                if (!info || info.error) return;
                const fetched = info.trade_name || info.legal_name || "";
                if (fetched && !name) setName(fetched);
              }} />
          </div>
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Sharma Traders" autoFocus
              onKeyDown={e => e.key === "Enter" && onSave()} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="9876543210" type="tel" />
          </div>
          <p className="text-xs text-muted-foreground">
            Address, state and more details can be completed later from Parties page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}
            style={{ background: "hsl(var(--tally-green))", color: "white" }}>
            {saving ? "Creating…" : `Create ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
