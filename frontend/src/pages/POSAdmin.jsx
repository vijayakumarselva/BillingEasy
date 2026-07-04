import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Scan, Save, Settings2, Tag, Percent, Printer, Store,
  ArrowLeft, Plus, Trash2, Receipt,
} from "lucide-react";

const STORAGE_KEY = (orgId) => `pos_settings_${orgId}`;

const DEFAULT_SETTINGS = {
  storeName: "",
  address: "",
  gstin: "",
  phone: "",
  defaultGstRate: "18",
  discountEnabled: true,
  maxDiscountPct: "20",
  barcodeField: "sku",
  receiptHeader: "",
  receiptFooter: "Thank you for shopping with us!",
  showLowStock: true,
  lowStockThreshold: "5",
  categories: [],
  cashierName: "",
};

function loadSettings(orgId) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY(orgId));
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(orgId, settings) {
  localStorage.setItem(STORAGE_KEY(orgId), JSON.stringify(settings));
}

export default function POSAdmin() {
  const { user, orgId } = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(() => loadSettings(orgId));
  const [tab, setTab] = useState("general");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    api.get("/orgs/current").then(r => {
      const d = r.data;
      setSettings(prev => ({
        ...prev,
        storeName: prev.storeName || d.name || "",
        address: prev.address || d.address || "",
        gstin: prev.gstin || d.gstin || "",
      }));
    }).catch(() => {});
  }, []);

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const saveAll = () => {
    saveSettings(orgId, settings);
    toast.success("POS settings saved");
  };

  const addCategory = () => {
    if (!newCategory.trim()) return;
    if (settings.categories.includes(newCategory.trim())) { toast.error("Already exists"); return; }
    setSettings(s => ({ ...s, categories: [...s.categories, newCategory.trim()] }));
    setNewCategory("");
  };

  const removeCategory = (cat) => setSettings(s => ({ ...s, categories: s.categories.filter(x => x !== cat) }));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/pos")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Scan className="h-6 w-6 text-blue-500" /> Retail POS Admin
          </h1>
          <p className="text-sm text-muted-foreground">Configure store info, GST, discounts, receipt & scanner settings</p>
        </div>
        <div className="ml-auto">
          <Button onClick={saveAll} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Save className="h-4 w-4" /> Save All
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="gst" className="gap-1.5"><Percent className="h-3.5 w-3.5" /> GST & Tax</TabsTrigger>
          <TabsTrigger value="discount" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Discounts</TabsTrigger>
          <TabsTrigger value="scanner" className="gap-1.5"><Scan className="h-3.5 w-3.5" /> Scanner</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><Store className="h-3.5 w-3.5" /> Categories</TabsTrigger>
          <TabsTrigger value="receipt" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Receipt</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Store Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Store Name</Label>
                <Input value={settings.storeName} onChange={e => set("storeName", e.target.value)} placeholder="e.g. Sharma Electronics" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={settings.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Input value={settings.address} onChange={e => set("address", e.target.value)} placeholder="Full address" />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={settings.gstin} onChange={e => set("gstin", e.target.value)} placeholder="27AAAAA0000A1Z5" />
              </div>
              <div className="space-y-1.5">
                <Label>Default Cashier Name</Label>
                <Input value={settings.cashierName} onChange={e => set("cashierName", e.target.value)} placeholder="e.g. Counter 1" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border sm:col-span-2">
                <div>
                  <p className="font-medium">Show Low Stock Warning</p>
                  <p className="text-xs text-muted-foreground">Highlight products with stock below threshold in the POS grid</p>
                </div>
                <Switch checked={settings.showLowStock} onCheckedChange={v => set("showLowStock", v)} />
              </div>
              {settings.showLowStock && (
                <div className="space-y-1.5">
                  <Label>Low Stock Threshold (units)</Label>
                  <Input type="number" min="1" value={settings.lowStockThreshold}
                    onChange={e => set("lowStockThreshold", e.target.value)} className="w-32" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GST */}
        <TabsContent value="gst" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">GST / Tax Settings</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Default GST Rate (applied when product has no tax rate)</Label>
                <Select value={settings.defaultGstRate} onValueChange={v => set("defaultGstRate", v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% — Exempt</SelectItem>
                    <SelectItem value="5">5% — Essential goods</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18% — Standard</SelectItem>
                    <SelectItem value="28">28% — Luxury</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-4 text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">Per-product tax rate takes priority</p>
                <p className="text-blue-600/80 dark:text-blue-400/80 text-xs">
                  Each product in your catalogue has its own HSN-based tax rate. This default is only used when a product's tax rate is 0% or unset.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discount */}
        <TabsContent value="discount" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Discount Rules</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium">Enable Discounts</p>
                  <p className="text-xs text-muted-foreground">Allow cashiers to apply flat ₹ or % discount on bills</p>
                </div>
                <Switch checked={settings.discountEnabled} onCheckedChange={v => set("discountEnabled", v)} />
              </div>
              {settings.discountEnabled && (
                <div className="space-y-1.5">
                  <Label>Maximum Discount Allowed (%)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="100" value={settings.maxDiscountPct}
                      onChange={e => set("maxDiscountPct", e.target.value)} className="w-28" />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Cashiers cannot exceed this discount percentage. Set 100 for no limit.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scanner */}
        <TabsContent value="scanner" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Barcode Scanner Settings</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Match scanned code against</Label>
                <Select value={settings.barcodeField} onValueChange={v => set("barcodeField", v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sku">SKU code</SelectItem>
                    <SelectItem value="barcode">Barcode field</SelectItem>
                    <SelectItem value="name">Product name</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  When a barcode is scanned, this field is used to find the matching product.
                  Most scanners output EAN-13 or CODE128 — match against SKU if your SKUs are printed on labels.
                </p>
              </div>
              <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">How to use the scanner</p>
                <ul className="text-amber-600/80 dark:text-amber-400/80 text-xs space-y-1 list-disc ml-4">
                  <li>USB / Bluetooth barcode scanners work automatically — they act as keyboards</li>
                  <li>Click the scanner input field (top left on POS page) before scanning</li>
                  <li>Scanner sends the code + Enter key, which triggers the product lookup</li>
                  <li>Print barcodes from Products → Barcode icon on each product row</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Product Categories for POS</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Categories shown in the POS filter bar. Leave empty to auto-detect from your product catalogue.
              </p>
              <div className="flex gap-2">
                <Input value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g. Electronics, Clothing" onKeyDown={e => e.key === "Enter" && addCategory()} />
                <Button onClick={addCategory} className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              {settings.categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {settings.categories.map(cat => (
                    <Badge key={cat} variant="secondary" className="gap-2 px-3 py-1.5 text-sm">
                      {cat}
                      <button onClick={() => removeCategory(cat)} className="text-muted-foreground hover:text-red-500 ml-1">×</button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No custom categories — using auto-detected from products.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receipt */}
        <TabsContent value="receipt" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Receipt Customization</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Receipt Header</Label>
                <Input value={settings.receiptHeader} onChange={e => set("receiptHeader", e.target.value)}
                  placeholder="e.g. 'Exchange within 7 days with bill'" />
              </div>
              <div className="space-y-1.5">
                <Label>Receipt Footer</Label>
                <Input value={settings.receiptFooter} onChange={e => set("receiptFooter", e.target.value)}
                  placeholder="e.g. 'Thank you for shopping with us!'" />
              </div>
              <div className="rounded-md border p-4 bg-gray-50 dark:bg-gray-900 font-mono text-xs space-y-1">
                <p className="font-bold text-center">{settings.storeName || "Your Store"}</p>
                <p className="text-center text-gray-500">{settings.address || "Address line"}</p>
                <p className="text-center text-gray-500">GSTIN: {settings.gstin || "Not set"}</p>
                <p className="border-t border-dashed my-1" />
                <p className="text-center italic text-gray-400">{settings.receiptHeader || "(no header)"}</p>
                <p className="text-gray-500">Item 1 × 2 ... ₹200.00</p>
                <p className="text-gray-500">Item 2 × 1 ... ₹150.00</p>
                <p className="border-t border-dashed my-1" />
                <p className="font-bold">Total: ₹350.00</p>
                <p className="border-t border-dashed my-1" />
                <p className="text-center italic text-gray-400">{settings.receiptFooter}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
