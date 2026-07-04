import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChefHat,
  Printer,
  Trash2,
  Plus,
  Minus,
  UtensilsCrossed,
  Receipt,
  X,
  Clock,
} from "lucide-react";

const NUM_TABLES = 10;
const GST_RATE = 18;
const HALF_GST = GST_RATE / 2;

function initTables() {
  const t = {};
  for (let i = 1; i <= NUM_TABLES; i++) t[i] = { items: [] };
  return t;
}

export default function Restaurant() {
  const [tables, setTables] = useState(initTables);
  const [activeTable, setActiveTable] = useState(1);
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("All");
  const [billDialog, setBillDialog] = useState({ open: false, invoice: null });
  const [generating, setGenerating] = useState(false);
  const billPrintRef = useRef(null);

  useEffect(() => {
    api
      .get("/products")
      .then((r) => setProducts(r.data?.data ?? r.data ?? []))
      .catch(() => toast.error("Failed to load menu items"));
  }, []);

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filteredProducts =
    category === "All" ? products : products.filter((p) => p.category === category);

  const currentOrder = tables[activeTable]?.items ?? [];

  function hasActiveOrder(tableNum) {
    return (tables[tableNum]?.items ?? []).length > 0;
  }

  function addItem(product) {
    setTables((prev) => {
      const items = [...(prev[activeTable]?.items ?? [])];
      const idx = items.findIndex((i) => i.id === product.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], qty: items[idx].qty + 1 };
      } else {
        items.push({
          id: product.id,
          name: product.name,
          price: parseFloat(product.price ?? product.sale_price ?? 0),
          qty: 1,
          unit: product.unit ?? "Nos",
          tax_rate: 18,
        });
      }
      return { ...prev, [activeTable]: { items } };
    });
  }

  function changeQty(itemId, delta) {
    setTables((prev) => {
      let items = [...(prev[activeTable]?.items ?? [])];
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx < 0) return prev;
      const newQty = items[idx].qty + delta;
      if (newQty <= 0) {
        items = items.filter((i) => i.id !== itemId);
      } else {
        items[idx] = { ...items[idx], qty: newQty };
      }
      return { ...prev, [activeTable]: { items } };
    });
  }

  function removeItem(itemId) {
    setTables((prev) => {
      const items = (prev[activeTable]?.items ?? []).filter((i) => i.id !== itemId);
      return { ...prev, [activeTable]: { items } };
    });
  }

  function clearTable() {
    setTables((prev) => ({ ...prev, [activeTable]: { items: [] } }));
    toast.success(`Table ${activeTable} cleared`);
  }

  const subtotal = currentOrder.reduce((s, i) => s + i.price * i.qty, 0);
  const cgst = (subtotal * HALF_GST) / 100;
  const sgst = cgst;
  const total = subtotal + cgst + sgst;

  function printKOT() {
    if (!currentOrder.length) {
      toast.warning("No items in order");
      return;
    }
    const now = new Date().toLocaleTimeString();
    const lines = currentOrder.map((i) => `${i.name} x${i.qty}`).join("\n");
    const content = `KOT - Table ${activeTable}\nTime: ${now}\n${"─".repeat(28)}\n${lines}\n${"─".repeat(28)}`;
    const win = window.open("", "_blank", "width=320,height=500");
    win.document.write(`<html><head><title>KOT</title><style>
      body { font-family: monospace; font-size: 14px; padding: 16px; white-space: pre; }
      @media print { body { margin: 0; } }
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async function generateBill() {
    if (!currentOrder.length) {
      toast.warning("No items in order");
      return;
    }
    setGenerating(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const payload = {
        party_id: null,
        date: today,
        due_date: today,
        notes: `Table ${activeTable} - Restaurant Bill`,
        items: currentOrder.map((p) => ({
          product_id: p.id,
          description: p.name,
          qty: p.qty,
          unit: p.unit ?? "Nos",
          price: p.price,
          tax_rate: 18,
        })),
      };
      const res = await api.post("/invoices", payload);
      const invoice = res.data?.data ?? res.data;
      setBillDialog({ open: true, invoice });
      clearTable();
      toast.success("Bill generated!");
    } catch (err) {
      toast.error(err?.response?.data?.message ?? "Failed to generate bill");
    } finally {
      setGenerating(false);
    }
  }

  function printBill() {
    const el = billPrintRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(`<html><head><title>Bill</title><style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 20px; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px 6px; text-align: left; }
      th { border-bottom: 1px solid #000; }
      .right { text-align: right; }
      .total-row td { font-weight: bold; border-top: 1px solid #000; padding-top: 6px; }
      h2, h3 { margin: 4px 0; }
      .center { text-align: center; }
      @media print { body { margin: 0; } }
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  const inv = billDialog.invoice;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-800 border-b shadow-sm">
        <UtensilsCrossed className="h-6 w-6 text-orange-500" />
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Restaurant POS</h1>
        <Badge variant="outline" className="ml-auto text-xs">
          GST {GST_RATE}%
        </Badge>
      </div>

      {/* Table Selector */}
      <div className="bg-gray-800 dark:bg-gray-950 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {Array.from({ length: NUM_TABLES }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setActiveTable(n)}
              className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                activeTable === n
                  ? "bg-orange-500 border-orange-400 text-white shadow-lg scale-105"
                  : "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
              }`}
            >
              Table {n}
              {hasActiveOrder(n) && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-400 border border-gray-800" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left: Menu */}
        <div className="flex flex-col flex-[2] overflow-hidden border-r dark:border-gray-700">
          {/* Category tabs */}
          <div className="flex gap-2 px-4 py-3 bg-white dark:bg-gray-800 border-b overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  category === cat
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-gray-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products grid */}
          <ScrollArea className="flex-1 p-4">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <ChefHat className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">No menu items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts.map((p) => {
                  const price = parseFloat(p.price ?? p.sale_price ?? 0);
                  const inOrder = currentOrder.find((o) => o.id === p.id);
                  return (
                    <Card
                      key={p.id}
                      onClick={() => addItem(p)}
                      className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 select-none ${
                        inOrder ? "ring-2 ring-orange-400" : ""
                      }`}
                    >
                      <CardContent className="p-3">
                        <div className="flex flex-col gap-1">
                          <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-1">
                            <UtensilsCrossed className="h-4 w-4 text-orange-500" />
                          </div>
                          <p className="font-semibold text-sm text-gray-800 dark:text-white leading-tight line-clamp-2">
                            {p.name}
                          </p>
                          {p.category && (
                            <Badge variant="secondary" className="text-[10px] w-fit px-1.5 py-0">
                              {p.category}
                            </Badge>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-orange-600 dark:text-orange-400 font-bold text-sm">
                              ₹{price.toFixed(2)}
                            </span>
                            {inOrder && (
                              <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0">
                                {inOrder.qty}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Order panel */}
        <div className="flex flex-col flex-[1] bg-white dark:bg-gray-800 min-w-[300px] max-w-[380px]">
          {/* Order header */}
          <div className="px-4 py-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Current Order</p>
                <p className="font-bold text-gray-800 dark:text-white text-lg">Table {activeTable}</p>
              </div>
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <Clock className="h-3 w-3" />
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>

          {/* Order items */}
          <ScrollArea className="flex-1">
            {currentOrder.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300 dark:text-gray-600">
                <Receipt className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No items yet</p>
                <p className="text-xs mt-1 opacity-60">Click menu items to add</p>
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-700">
                {currentOrder.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400">₹{item.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => changeQty(item.id, -1)}
                        className="h-6 w-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-300"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-gray-800 dark:text-white">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => changeQty(item.id, 1)}
                        className="h-6 w-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-600 dark:text-gray-300"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="w-16 text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">
                        ₹{(item.price * item.qty).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Totals */}
          <div className="border-t dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 space-y-1">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>CGST ({HALF_GST}%)</span>
              <span>₹{cgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>SGST ({HALF_GST}%)</span>
              <span>₹{sgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-800 dark:text-white border-t dark:border-gray-600 pt-2 mt-1">
              <span>Total</span>
              <span className="text-orange-600 dark:text-orange-400">₹{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-4 py-3 space-y-2 border-t dark:border-gray-700">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs gap-1.5"
                onClick={printKOT}
                disabled={!currentOrder.length}
              >
                <ChefHat className="h-3.5 w-3.5" />
                Print KOT
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-xs gap-1.5 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                onClick={clearTable}
                disabled={!currentOrder.length}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
              onClick={generateBill}
              disabled={!currentOrder.length || generating}
            >
              <Receipt className="h-4 w-4" />
              {generating ? "Generating..." : "Generate Bill"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bill Dialog */}
      <Dialog open={billDialog.open} onOpenChange={(o) => setBillDialog((b) => ({ ...b, open: o }))}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-500" />
              Bill Generated
            </DialogTitle>
          </DialogHeader>

          {/* Printable bill area */}
          <div ref={billPrintRef} className="space-y-3 text-sm">
            <div className="text-center border-b pb-3">
              <h2 className="font-bold text-lg">Restaurant</h2>
              <p className="text-xs text-gray-500">GST Invoice</p>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Table {activeTable || (inv?.notes?.match(/Table (\d+)/)?.[1] ?? "—")}
              </span>
              <span>{new Date().toLocaleString()}</span>
            </div>

            {inv && (
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>Invoice #: {inv.invoice_number ?? inv.id ?? "—"}</p>
              </div>
            )}

            {/* Items table */}
            <table className="w-full text-xs border-t pt-2">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">Item</th>
                  <th className="text-center py-1">Qty</th>
                  <th className="text-right py-1">Rate</th>
                  <th className="text-right py-1">Amt</th>
                </tr>
              </thead>
              <tbody>
                {(inv?.items ?? []).map((item, i) => {
                  const rate = parseFloat(item.price ?? item.rate ?? 0);
                  const qty = parseFloat(item.qty ?? 1);
                  return (
                    <tr key={i} className="border-b border-dashed">
                      <td className="py-1 pr-2">{item.description ?? item.name}</td>
                      <td className="py-1 text-center">{qty}</td>
                      <td className="py-1 text-right">₹{rate.toFixed(2)}</td>
                      <td className="py-1 text-right">₹{(rate * qty).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className="space-y-1 text-xs border-t pt-2">
              {(() => {
                const sub = parseFloat(inv?.subtotal ?? inv?.taxable_amount ?? subtotal ?? 0);
                const tax = parseFloat(inv?.tax_amount ?? inv?.total_tax ?? (sub * GST_RATE) / 100);
                const grand = parseFloat(inv?.total ?? sub + tax);
                const half = tax / 2;
                return (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal</span><span>₹{sub.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>CGST ({HALF_GST}%)</span><span>₹{half.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>SGST ({HALF_GST}%)</span><span>₹{half.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
                      <span>Grand Total</span>
                      <span className="text-orange-600">₹{grand.toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <p className="text-center text-xs text-gray-400 border-t pt-2">Thank you! Visit again.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={printBill}
            >
              <Printer className="h-4 w-4" />
              Print Bill
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => setBillDialog({ open: false, invoice: null })}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
