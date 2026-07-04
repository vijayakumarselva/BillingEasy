import { useEffect, useState, useRef, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Scan, ShoppingCart, Trash2, Plus, Minus, X, Printer,
  Tag, User, Search, Package, ChevronDown
} from "lucide-react";
import { todayISO } from "@/lib/format";

// ─── helpers ─────────────────────────────────────────────────────────────────
const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const timeNow = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

// ─── component ────────────────────────────────────────────────────────────────
export default function RetailPOS() {
  // data
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [biz, setBiz] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  // UI state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDD, setShowCustomerDD] = useState(false);

  // cart
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState({ type: "flat", value: 0 });

  // session stats
  const [sessionSales, setSessionSales] = useState(0);

  // receipt
  const [receiptDialog, setReceiptDialog] = useState({ open: false, invoice: null });
  const [billing, setBilling] = useState(false);

  // refs
  const scanRef = useRef(null);
  const customerDDRef = useRef(null);

  // ── load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingProducts(true);
    api.get("/products").then(r => setProducts(r.data || [])).finally(() => setLoadingProducts(false));
    api.get("/parties", { params: { role: "customer" } }).then(r => setCustomers(r.data || []));
    api.get("/business").then(r => setBiz(r.data || {})).catch(() => {});
  }, []);

  // close customer dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (customerDDRef.current && !customerDDRef.current.contains(e.target)) {
        setShowCustomerDD(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    return ["All", ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (category !== "All") list = list.filter(p => p.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, category, search]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    ).slice(0, 8);
  }, [customers, customerSearch]);

  // ── cart totals ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
    const discountAmt =
      discount.type === "pct"
        ? (subtotal * Math.min(discount.value, 100)) / 100
        : Math.min(discount.value, subtotal);
    const taxable = subtotal - discountAmt;
    const gstAmt = cart.reduce((s, c) => {
      const lineTotal = c.qty * c.price;
      const proportion = subtotal > 0 ? lineTotal / subtotal : 0;
      const lineTaxable = proportion * taxable;
      return s + lineTaxable * ((c.product.tax_rate || 18) / 100);
    }, 0);
    const grandTotal = taxable + gstAmt;
    return { subtotal, discountAmt, taxable, gstAmt, grandTotal };
  }, [cart, discount]);

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  // ── cart actions ───────────────────────────────────────────────────────────
  function addToCart(product) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, { product, qty: 1, price: product.price || product.sale_price || 0 }];
    });
  }

  function updateQty(productId, qty) {
    const n = parseInt(qty, 10);
    if (isNaN(n) || n < 1) return;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, qty: n } : c));
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscount({ type: "flat", value: 0 });
    setCustomerId(null);
    setSelectedCustomer(null);
    setCustomerSearch("");
  }

  // ── barcode / search enter ─────────────────────────────────────────────────
  function handleScanEnter(e) {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const product = products.find(
      p => p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q
    );
    if (product) {
      addToCart(product);
      toast.success(`Added: ${product.name}`);
      setSearch("");
    } else {
      toast.error("Product not found for: " + search);
    }
  }

  // ── billing ────────────────────────────────────────────────────────────────
  async function handleBill() {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    setBilling(true);
    try {
      const payload = {
        party_id: customerId || null,
        date: todayISO(),
        due_date: todayISO(),
        notes: "Retail POS sale",
        discount: Math.round(totals.discountAmt * 100) / 100,
        items: cart.map(c => ({
          product_id: c.product.id,
          description: c.product.name,
          qty: c.qty,
          unit: c.product.unit || "Nos",
          price: c.price,
          tax_rate: c.product.tax_rate || 18,
        })),
      };
      const res = await api.post("/invoices", payload);
      const invoice = res.data;
      setSessionSales(s => s + 1);
      setReceiptDialog({ open: true, invoice });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Billing failed");
    } finally {
      setBilling(false);
    }
  }

  // ── print receipt ──────────────────────────────────────────────────────────
  function printReceipt() {
    const el = document.getElementById("pos-receipt-print");
    if (!el) return;
    const win = window.open("", "_blank", "width=400,height=700");
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; font-family: 'Courier New', monospace; }
          body { width: 80mm; margin: 0; padding: 8px; font-size: 12px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; }
          .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
          h2 { margin: 0; font-size: 16px; }
          p { margin: 2px 0; }
        </style>
      </head>
      <body>
        ${el.innerHTML}
        <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  // ── new sale ───────────────────────────────────────────────────────────────
  function newSale() {
    clearCart();
    setReceiptDialog({ open: false, invoice: null });
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <div className="flex flex-col w-[60%] h-full border-r border-gray-200 bg-white">

        {/* top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
            <ShoppingCart className="w-5 h-5" />
            <span>Retail POS</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{biz.name || "Retail Store"}</span>
            <span>{today()}</span>
          </div>
        </div>

        {/* scanner input */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 w-5 h-5" />
            <Input
              ref={scanRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleScanEnter}
              placeholder="Scan barcode / SKU or search product — press Enter to add"
              className="pl-10 pr-10 h-12 text-lg border-indigo-300 focus:border-indigo-500 focus:ring-indigo-200"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-1">
            <Search className="inline w-3 h-3 mr-0.5" /> Type to filter · Press Enter on exact SKU/barcode to add instantly
          </p>
        </div>

        {/* category chips */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                category === cat
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* product grid */}
        <ScrollArea className="flex-1 px-4 pb-4">
          {loadingProducts ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <Package className="w-6 h-6 mr-2 animate-pulse" /> Loading products…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Package className="w-8 h-8 mb-2" />
              <span>No products found</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
              {filteredProducts.map(product => {
                const price = product.price || product.sale_price || 0;
                const stock = product.stock_qty ?? product.stock ?? null;
                const lowStock = stock !== null && stock < 5;
                const inCart = cart.some(c => c.product.id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`relative text-left rounded-xl border p-3 transition-all hover:shadow-md hover:border-indigo-400 active:scale-95 ${
                      inCart ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    {inCart && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center mb-2">
                      <Package className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">
                      {product.name}
                    </p>
                    {product.sku && (
                      <p className="text-[10px] text-gray-400 mb-1">{product.sku}</p>
                    )}
                    <p className="text-sm font-bold text-indigo-700">{inr(price)}</p>
                    {stock !== null && (
                      <p className={`text-[10px] mt-0.5 font-medium ${lowStock ? "text-red-500" : "text-gray-400"}`}>
                        Stock: {stock} {lowStock && "⚠"}
                      </p>
                    )}
                    {product.tax_rate && (
                      <Badge variant="outline" className="mt-1 text-[9px] px-1 py-0 h-4">
                        GST {product.tax_rate}%
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── RIGHT PANEL (cart) ── */}
      <div className="flex flex-col w-[40%] h-full bg-white">

        {/* cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            <span className="font-semibold text-gray-800">Cart</span>
            {cartCount > 0 && (
              <Badge className="bg-indigo-600 text-white text-xs px-2">{cartCount}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">
              Today's sales: <span className="font-bold text-gray-800">{sessionSales}</span>
            </span>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* customer selector */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100" ref={customerDDRef}>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChange={e => {
                setCustomerSearch(e.target.value);
                setSelectedCustomer(null);
                setCustomerId(null);
                setShowCustomerDD(true);
              }}
              onFocus={() => setShowCustomerDD(true)}
              placeholder="Walk-in customer (optional)"
              className="pl-8 pr-8 h-9 text-sm"
            />
            {selectedCustomer && (
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerId(null); setCustomerSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {!selectedCustomer && <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 pointer-events-none" />}
          </div>
          {showCustomerDD && filteredCustomers.length > 0 && !selectedCustomer && (
            <div className="absolute z-50 mt-1 w-[calc(40%-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {filteredCustomers.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setCustomerId(c.id);
                    setCustomerSearch("");
                    setShowCustomerDD(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                >
                  <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* cart items */}
        <ScrollArea className="flex-1 px-4 py-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-300">
              <ShoppingCart className="w-12 h-12 mb-3" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Click a product or scan a barcode</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((c, idx) => (
                <div key={c.product.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.product.name}</p>
                    <p className="text-xs text-gray-400">{inr(c.price)} × {c.qty} = <span className="font-semibold text-gray-700">{inr(c.qty * c.price)}</span></p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => c.qty > 1 ? updateQty(c.product.id, c.qty - 1) : removeFromCart(c.product.id)}
                      className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input
                      type="number"
                      value={c.qty}
                      onChange={e => updateQty(c.product.id, e.target.value)}
                      className="w-12 h-6 text-center text-xs px-1 border-gray-200"
                      min={1}
                    />
                    <button
                      onClick={() => updateQty(c.product.id, c.qty + 1)}
                      className="w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(c.product.id)}
                      className="w-6 h-6 rounded-md text-red-400 hover:bg-red-50 flex items-center justify-center ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* discount + totals + bill */}
        <div className="border-t border-gray-200 px-4 pt-3 pb-4 bg-white">

          {/* discount row */}
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">Discount</span>
            <div className="flex rounded-md overflow-hidden border border-gray-200 shrink-0">
              <button
                onClick={() => setDiscount(d => ({ ...d, type: "flat" }))}
                className={`px-2 py-1 text-xs font-medium transition-colors ${discount.type === "flat" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >₹</button>
              <button
                onClick={() => setDiscount(d => ({ ...d, type: "pct" }))}
                className={`px-2 py-1 text-xs font-medium transition-colors ${discount.type === "pct" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >%</button>
            </div>
            <Input
              type="number"
              value={discount.value || ""}
              onChange={e => setDiscount(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))}
              placeholder="0"
              className="h-8 text-sm w-24"
              min={0}
              max={discount.type === "pct" ? 100 : undefined}
            />
          </div>

          {/* totals */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 mb-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{inr(totals.subtotal)}</span>
            </div>
            {totals.discountAmt > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>- {inr(totals.discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>GST</span>
              <span>{inr(totals.gstAmt)}</span>
            </div>
            <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-base text-gray-900">
              <span>Grand Total</span>
              <span className="text-indigo-700">{inr(totals.grandTotal)}</span>
            </div>
          </div>

          {/* bill button */}
          <Button
            onClick={handleBill}
            disabled={cart.length === 0 || billing}
            className="w-full h-11 text-base bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            <Printer className="w-4 h-4 mr-2" />
            {billing ? "Processing…" : "Print & Bill"}
          </Button>
        </div>
      </div>

      {/* ── RECEIPT DIALOG ── */}
      <Dialog open={receiptDialog.open} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-indigo-600" />
              Bill Generated
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            <div className="p-6">
              {/* receipt preview */}
              <div
                id="pos-receipt-print"
                className="font-mono text-xs bg-white border border-dashed border-gray-300 rounded-lg p-4"
              >
                {/* header */}
                <div className="text-center mb-3">
                  <p className="font-bold text-base">{biz.name || "Retail Store"}</p>
                  {biz.address && <p className="text-gray-500">{biz.address}</p>}
                  {biz.gstin && <p>GSTIN: {biz.gstin}</p>}
                  {biz.phone && <p>Ph: {biz.phone}</p>}
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="space-y-0.5 mb-2">
                  <div className="flex justify-between">
                    <span>Invoice#</span>
                    <span className="font-bold">{receiptDialog.invoice?.invoice_number || receiptDialog.invoice?.id || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date</span>
                    <span>{today()} {timeNow()}</span>
                  </div>
                  {selectedCustomer && (
                    <div className="flex justify-between">
                      <span>Customer</span>
                      <span>{selectedCustomer.name}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                {/* items */}
                <div className="mb-2">
                  <div className="flex justify-between font-bold mb-1">
                    <span className="flex-1">Item</span>
                    <span className="w-8 text-right">Qty</span>
                    <span className="w-14 text-right">Rate</span>
                    <span className="w-16 text-right">Amt</span>
                  </div>
                  {cart.map(c => (
                    <div key={c.product.id} className="flex justify-between py-0.5">
                      <span className="flex-1 truncate pr-1">{c.product.name}</span>
                      <span className="w-8 text-right">{c.qty}</span>
                      <span className="w-14 text-right">₹{c.price}</span>
                      <span className="w-16 text-right">₹{(c.qty * c.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                {/* totals */}
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{inr(totals.subtotal)}</span>
                  </div>
                  {totals.discountAmt > 0 && (
                    <div className="flex justify-between">
                      <span>Discount</span>
                      <span>- {inr(totals.discountAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span>{inr(totals.gstAmt)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 mt-1">
                    <span>TOTAL</span>
                    <span>{inr(totals.grandTotal)}</span>
                  </div>
                </div>
                <div className="border-t border-dashed border-gray-400 my-3" />
                <div className="text-center text-gray-500">
                  <p className="font-bold">Thank you for shopping!</p>
                  <p>Visit again 😊</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* actions */}
          <div className="flex gap-3 px-6 pb-6 pt-2">
            <Button
              variant="outline"
              onClick={printReceipt}
              className="flex-1 gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </Button>
            <Button
              onClick={newSale}
              className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <ShoppingCart className="w-4 h-4" />
              New Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
