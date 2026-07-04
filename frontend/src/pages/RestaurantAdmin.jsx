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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  UtensilsCrossed, Plus, Trash2, Save, Settings2, LayoutGrid,
  Layers, Percent, Printer, Tag, ChefHat, ArrowLeft,
} from "lucide-react";

const STORAGE_KEY = (orgId) => `restaurant_settings_${orgId}`;

const DEFAULT_SETTINGS = {
  restaurantName: "",
  address: "",
  gstin: "",
  fssai: "",
  phone: "",
  gstRate: "18",
  splitGst: true,
  kotEnabled: true,
  billHeader: "",
  billFooter: "Thank you for dining with us!",
  tables: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Table ${i + 1}`, section: "Main Hall", active: true })),
  sections: ["Main Hall", "Terrace", "Private Dining"],
  categories: ["Starters", "Main Course", "Beverages", "Desserts", "Breads"],
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

export default function RestaurantAdmin() {
  const { user, orgId } = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(() => loadSettings(orgId));
  const [orgData, setOrgData] = useState(null);
  const [tab, setTab] = useState("general");

  // table dialog
  const [tableDialog, setTableDialog] = useState({ open: false, table: null });
  const [tableForm, setTableForm] = useState({ name: "", section: "Main Hall" });

  // category / section inputs
  const [newCategory, setNewCategory] = useState("");
  const [newSection, setNewSection] = useState("");

  useEffect(() => {
    api.get("/orgs/current").then(r => {
      const d = r.data;
      setOrgData(d);
      setSettings(prev => ({
        ...prev,
        restaurantName: prev.restaurantName || d.name || "",
        address: prev.address || d.address || "",
        gstin: prev.gstin || d.gstin || "",
      }));
    }).catch(() => {});
  }, []);

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const saveAll = () => {
    saveSettings(orgId, settings);
    toast.success("Restaurant settings saved");
  };

  // Tables
  const openAddTable = () => {
    const nextId = Math.max(0, ...settings.tables.map(t => t.id)) + 1;
    setTableForm({ name: `Table ${nextId}`, section: settings.sections[0] || "Main Hall" });
    setTableDialog({ open: true, table: null });
  };

  const openEditTable = (t) => {
    setTableForm({ name: t.name, section: t.section });
    setTableDialog({ open: true, table: t });
  };

  const saveTable = () => {
    if (!tableForm.name.trim()) { toast.error("Name required"); return; }
    setSettings(s => {
      const tables = tableDialog.table
        ? s.tables.map(t => t.id === tableDialog.table.id ? { ...t, ...tableForm } : t)
        : [...s.tables, { id: Math.max(0, ...s.tables.map(t => t.id)) + 1, ...tableForm, active: true }];
      return { ...s, tables };
    });
    setTableDialog({ open: false, table: null });
  };

  const removeTable = (id) => setSettings(s => ({ ...s, tables: s.tables.filter(t => t.id !== id) }));
  const toggleTable = (id) => setSettings(s => ({ ...s, tables: s.tables.map(t => t.id === id ? { ...t, active: !t.active } : t) }));

  const addSection = () => {
    if (!newSection.trim()) return;
    if (settings.sections.includes(newSection.trim())) { toast.error("Already exists"); return; }
    setSettings(s => ({ ...s, sections: [...s.sections, newSection.trim()] }));
    setNewSection("");
  };

  const removeSection = (sec) => setSettings(s => ({ ...s, sections: s.sections.filter(x => x !== sec) }));

  const addCategory = () => {
    if (!newCategory.trim()) return;
    if (settings.categories.includes(newCategory.trim())) { toast.error("Already exists"); return; }
    setSettings(s => ({ ...s, categories: [...s.categories, newCategory.trim()] }));
    setNewCategory("");
  };

  const removeCategory = (cat) => setSettings(s => ({ ...s, categories: s.categories.filter(x => x !== cat) }));

  const sectionGroups = settings.sections.reduce((acc, sec) => {
    acc[sec] = settings.tables.filter(t => t.section === sec);
    return acc;
  }, {});

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/restaurant")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-orange-500" /> Restaurant Admin
          </h1>
          <p className="text-sm text-muted-foreground">Configure tables, categories, GST, and billing settings</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={saveAll} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <Save className="h-4 w-4" /> Save All
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="tables" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Tables</TabsTrigger>
          <TabsTrigger value="sections" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Sections</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Categories</TabsTrigger>
          <TabsTrigger value="gst" className="gap-1.5"><Percent className="h-3.5 w-3.5" /> GST & Tax</TabsTrigger>
          <TabsTrigger value="print" className="gap-1.5"><Printer className="h-3.5 w-3.5" /> Print & KOT</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Restaurant Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Restaurant Name</Label>
                <Input value={settings.restaurantName} onChange={e => set("restaurantName", e.target.value)} placeholder="e.g. Spice Garden" />
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
                <Label>FSSAI License No.</Label>
                <Input value={settings.fssai} onChange={e => set("fssai", e.target.value)} placeholder="10019011001866" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tables */}
        <TabsContent value="tables" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{settings.tables.length} tables configured across {settings.sections.length} sections</p>
            <Button onClick={openAddTable} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4" /> Add Table
            </Button>
          </div>
          {settings.sections.map(sec => {
            const tbls = sectionGroups[sec] || [];
            if (!tbls.length) return null;
            return (
              <Card key={sec}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">{sec}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {tbls.map(t => (
                      <div key={t.id}
                        className={`relative rounded-lg border-2 p-3 text-center cursor-pointer transition-all ${t.active ? "border-orange-300 bg-orange-50 dark:bg-orange-500/10" : "border-dashed border-gray-200 opacity-50"}`}
                        onClick={() => openEditTable(t)}>
                        <div className="text-lg font-bold text-orange-600">{t.id}</div>
                        <div className="text-xs font-medium truncate">{t.name}</div>
                        <div className="flex justify-center gap-1 mt-2">
                          <button className="text-xs text-blue-500 hover:underline" onClick={e => { e.stopPropagation(); toggleTable(t.id); }}>
                            {t.active ? "Disable" : "Enable"}
                          </button>
                          <span className="text-gray-300">|</span>
                          <button className="text-xs text-red-500 hover:underline" onClick={e => { e.stopPropagation(); removeTable(t.id); }}>
                            Del
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Sections */}
        <TabsContent value="sections" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Floor / Section Management</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newSection} onChange={e => setNewSection(e.target.value)}
                  placeholder="e.g. Rooftop, Private Room" onKeyDown={e => e.key === "Enter" && addSection()} />
                <Button onClick={addSection} className="bg-orange-500 hover:bg-orange-600 text-white gap-1"><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="space-y-2">
                {settings.sections.map(sec => (
                  <div key={sec} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div>
                      <div className="font-medium">{sec}</div>
                      <div className="text-xs text-muted-foreground">{settings.tables.filter(t => t.section === sec).length} tables</div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => removeSection(sec)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Menu Categories</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g. Chef's Special, Mocktails" onKeyDown={e => e.key === "Enter" && addCategory()} />
                <Button onClick={addCategory} className="bg-orange-500 hover:bg-orange-600 text-white gap-1"><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {settings.categories.map(cat => (
                  <Badge key={cat} variant="secondary" className="gap-2 px-3 py-1.5 text-sm">
                    {cat}
                    <button onClick={() => removeCategory(cat)} className="text-muted-foreground hover:text-red-500 ml-1">×</button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GST */}
        <TabsContent value="gst" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">GST & Tax Settings</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Default GST Rate for Food</Label>
                <Select value={settings.gstRate} onValueChange={v => set("gstRate", v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exempt)</SelectItem>
                    <SelectItem value="5">5% (AC restaurants, annual TO &lt; 75L)</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18% (AC restaurants)</SelectItem>
                    <SelectItem value="28">28% (Luxury hotels)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">GST Council notification: non-AC restaurants = 5%, AC = 18%.</p>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium">Split GST (CGST + SGST)</p>
                  <p className="text-xs text-muted-foreground">Show GST as CGST {settings.gstRate / 2}% + SGST {settings.gstRate / 2}% on bills</p>
                </div>
                <Switch checked={settings.splitGst} onCheckedChange={v => set("splitGst", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Print */}
        <TabsContent value="print" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Bill Customization</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bill Header (appears on top of every bill)</Label>
                <Input value={settings.billHeader} onChange={e => set("billHeader", e.target.value)} placeholder="e.g. 'All prices are inclusive of applicable taxes'" />
              </div>
              <div className="space-y-1.5">
                <Label>Bill Footer</Label>
                <Input value={settings.billFooter} onChange={e => set("billFooter", e.target.value)} placeholder="e.g. 'Thank you for dining with us!'" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">KOT Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <p className="font-medium">Enable KOT Printing</p>
                  <p className="text-xs text-muted-foreground">Show "Print KOT" button in restaurant billing</p>
                </div>
                <Switch checked={settings.kotEnabled} onCheckedChange={v => set("kotEnabled", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Table Dialog */}
      <Dialog open={tableDialog.open} onOpenChange={o => setTableDialog(d => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tableDialog.table ? "Edit Table" : "Add Table"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Table Name</Label>
              <Input value={tableForm.name} onChange={e => setTableForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={tableForm.section} onValueChange={v => setTableForm(f => ({ ...f, section: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {settings.sections.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableDialog({ open: false, table: null })}>Cancel</Button>
            <Button onClick={saveTable} className="bg-orange-500 hover:bg-orange-600 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
