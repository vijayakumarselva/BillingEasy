import { useEffect, useState, useRef, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Scan, ShoppingCart, Trash2, Plus, Minus, X, Printer,
  Tag, User, Search, Package, ChevronDown, LayoutGrid, Receipt,
  Banknote, Smartphone, CheckCircle2, IndianRupee, Edit2
} from "lucide-react";
import { todayISO } from "@/lib/format";

const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const timeNow = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export default function RetailPOS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [biz, setBiz] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDD, setShowCustomerDD] = useState(false);
  const [mobileTab, setMobileTab] = useState("products");

  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState({ type: "flat", value: 0 });
  const [editingPrice, setEditingPrice] = useState(null); // productId being price-edited

  const [sessionSales, setSessionSales] = useState(0);
  const [receiptDialog, setReceiptDialog] = useState({ open: false, invoice: null, paymentMethod: "cash" });
  const [paymentModal, setPaymentModal] = useState(false);
  const [billing, setBilling] = useState(false);
  const [cashTendered, setCashTendered] = useState("");

  const scanRef = useRef(null);
  const customerDDRef = useRef(null);

  const loadProducts = () => {
    setLoadingProducts(true);
    api.get("/products").then(r => setProducts(r.data || [])).finally(() => setLoadingProducts(false));
  };

  useEffect(() => {
    loadProducts();
    api.get("/parties", { params: { role: "customer" } }).then(r => setCustomers(r.data || []));
    api.get("/business").then(r => setBiz(r.data || {})).catch(() => {});
    // Reload products when user returns to this tab (e.g. after editing prices)
    const onVisible = () => { if (document.visibilityState === "visible") loadProducts(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (customerDDRef.current && !customerDDRef.current.contains(e.target)) setShowCustomerDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      return s + lineTaxable * ((c.product.gst_rate || c.product.tax_rate || 18) / 100);
    }, 0);
    const grandTotal = taxable + gstAmt;
    return { subtotal, discountAmt, taxable, gstAmt, grandTotal };
  }, [cart, discount]);

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const cashChange = cashTendered ? Math.max(0, parseFloat(cashTendered || 0) - totals.grandTotal) : 0;

  function addToCart(product) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, { product, qty: 1, price: product.sale_price || product.price || 0 }];
    });
    if (mobileTab === "products") setMobileTab("cart");
  }

  function updateQty(productId, qty) {
    const n = parseInt(qty, 10);
    if (isNaN(n) || n < 1) return;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, qty: n } : c));
  }

  function updatePrice(productId, price) {
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) return;
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, price: p } : c));
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  }

  function clearCart() {
    setCart([]); setDiscount({ type: "flat", value: 0 });
    setCustomerId(null); setSelectedCustomer(null); setCustomerSearch("");
  }

  function handleScanEnter(e) {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const product = products.find(
      p => p.upc === q || p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q
    );
    if (product) { addToCart(product); toast.success(`Added: ${product.name}`); setSearch(""); }
    else toast.error("Product not found for: " + search);
  }

  async function handleBill(paymentMethod) {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    setBilling(true);
    try {
      const payload = {
        party_id: customerId || null,
        date: todayISO(), due_date: todayISO(),
        notes: `POS sale — ${paymentMethod === "cash" ? "Cash" : "UPI/Online"}`,
        discount: Math.round(totals.discountAmt * 100) / 100,
        payment_method: paymentMethod,
        items: cart.map(c => ({
          product_id: c.product.id,
          description: c.product.name,
          qty: c.qty,
          unit: c.product.unit || "Nos",
          price: c.price,
          tax_rate: c.product.gst_rate || c.product.tax_rate || 18,
        })),
      };
      const res = await api.post("/invoices", payload);
      setSessionSales(s => s + 1);
      setPaymentModal(false);
      setReceiptDialog({ open: true, invoice: res.data, paymentMethod });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Billing failed");
    } finally {
      setBilling(false);
    }
  }

  function printReceipt() {
    const el = document.getElementById("pos-receipt-print");
    if (!el) return;
    const win = window.open("", "_blank", "width=400,height=700");
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
      @page{size:80mm auto;margin:0}*{box-sizing:border-box;font-family:'Courier New',monospace}
      body{width:80mm;margin:0;padding:8px;font-size:12px;color:#000}
      .center{text-align:center}.bold{font-weight:bold}
      .divider{border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between}
      .total-row{display:flex;justify-content:space-between;font-weight:bold;font-size:14px}
      h2{margin:0;font-size:16px}p{margin:2px 0}
    </style></head><body>${el.innerHTML}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    win.document.close();
  }

  function newSale() {
    clearCart(); setReceiptDialog({ open: false, invoice: null, paymentMethod: "cash" });
    setMobileTab("products"); setCashTendered("");
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  // ── Sub-components ────────────────────────────────────────────────────────

  const CustomerSelector = () => (
    <div className="relative" ref={customerDDRef}>
      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
      <Input
        value={selectedCustomer ? selectedCustomer.name : customerSearch}
        onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); setCustomerId(null); setShowCustomerDD(true); }}
        onFocus={() => setShowCustomerDD(true)}
        placeholder="Walk-in customer (optional)"
        className="pl-8 pr-8 h-10 text-sm"
      />
      {selectedCustomer && (
        <button onClick={() => { setSelectedCustomer(null); setCustomerId(null); setCustomerSearch(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {!selectedCustomer && <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5 pointer-events-none" />}
      {showCustomerDD && filteredCustomers.length > 0 && !selectedCustomer && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {filteredCustomers.map(c => (
            <button key={c.id}
              onClick={() => { setSelectedCustomer(c); setCustomerId(c.id); setCustomerSearch(""); setShowCustomerDD(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div><p className="font-medium text-gray-800">{c.name}</p>
                {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const CartItems = () => (
    cart.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-48 text-gray-300">
        <ShoppingCart className="w-12 h-12 mb-3" />
        <p className="text-sm">Cart is empty</p>
        <p className="text-xs mt-1">Tap a product to add it</p>
      </div>
    ) : (
      <div className="space-y-2">
        {cart.map((c) => (
          <div key={c.product.id} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{c.product.name}</p>
                {/* price row — tap to edit */}
                <div className="flex items-center gap-1.5 mt-1">
                  {editingPrice === c.product.id ? (
                    <div className="flex items-center gap-1">
                      <IndianRupee className="w-3 h-3 text-gray-400" />
                      <input
                        autoFocus
                        type="number"
                        value={c.price}
                        onChange={e => updatePrice(c.product.id, e.target.value)}
                        onBlur={() => setEditingPrice(null)}
                        onKeyDown={e => e.key === "Enter" && setEditingPrice(null)}
                        className="w-20 text-sm font-bold text-indigo-700 border-b border-indigo-400 bg-transparent outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingPrice(c.product.id)}
                      className="flex items-center gap-1 text-sm font-bold text-indigo-700 hover:text-indigo-900 group"
                      title="Tap to edit price"
                    >
                      {inr(c.price)}
                      <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  )}
                  <span className="text-xs text-gray-400">× {c.qty} = <span className="font-bold text-gray-700">{inr(c.qty * c.price)}</span></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => c.qty > 1 ? updateQty(c.product.id, c.qty - 1) : removeFromCart(c.product.id)}
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 active:scale-90 transition-all"
                >
                  <Minus className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <span className="w-7 text-center text-sm font-bold text-gray-800">{c.qty}</span>
                <button
                  onClick={() => updateQty(c.product.id, c.qty + 1)}
                  className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeFromCart(c.product.id)}
                  className="w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center ml-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  const CartFooter = () => (
    <div className="border-t border-gray-200 px-4 pt-3 pb-4 bg-white space-y-3">
      <CustomerSelector />

      {/* discount */}
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Discount</span>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
          <button onClick={() => setDiscount(d => ({ ...d, type: "flat" }))}
            className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${discount.type === "flat" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>₹</button>
          <button onClick={() => setDiscount(d => ({ ...d, type: "pct" }))}
            className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${discount.type === "pct" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>%</button>
        </div>
        <Input type="number" value={discount.value || ""} onChange={e => setDiscount(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))}
          placeholder="0" className="h-9 text-sm flex-1" min={0} max={discount.type === "pct" ? 100 : undefined} />
      </div>

      {/* totals summary */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
        {totals.discountAmt > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>- {inr(totals.discountAmt)}</span></div>}
        <div className="flex justify-between text-gray-600"><span>GST</span><span>{inr(totals.gstAmt)}</span></div>
        <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-base text-gray-900">
          <span>Grand Total</span><span className="text-indigo-700">{inr(totals.grandTotal)}</span>
        </div>
      </div>

      {/* charge button */}
      <Button
        onClick={() => { if (cart.length === 0) { toast.error("Cart is empty"); return; } setCashTendered(""); setPaymentModal(true); }}
        disabled={cart.length === 0}
        className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
      >
        <IndianRupee className="w-4 h-4 mr-2" />
        Charge {inr(totals.grandTotal)}
      </Button>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 overflow-hidden">

      {/* ── PRODUCTS PANEL ── */}
      <div className={`flex flex-col h-full border-r border-gray-200 bg-white w-full md:w-[60%]
        ${mobileTab === "products" ? "flex" : "hidden"} md:flex`}>

        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
            <ShoppingCart className="w-5 h-5" /><span>Retail POS</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm text-gray-500">
            <span className="font-medium text-gray-700 hidden sm:inline">{biz.name || "Retail Store"}</span>
            <span className="hidden sm:inline">{today()}</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full font-medium">Sales: {sessionSales}</span>
          </div>
        </div>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 w-5 h-5" />
            <Input ref={scanRef} value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={handleScanEnter} placeholder="Search product or scan barcode…"
              className="pl-10 pr-10 h-11 text-base border-indigo-200 focus:border-indigo-500" autoFocus />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                category === cat ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
              }`}>{cat}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-20 md:pb-4">
          {loadingProducts ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <Package className="w-6 h-6 mr-2 animate-pulse" /> Loading…
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Package className="w-8 h-8 mb-2" /><span>No products found</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
              {filteredProducts.map(product => {
                const price = product.sale_price || product.price || 0;
                const stock = product.stock_qty ?? product.stock ?? null;
                const lowStock = stock !== null && stock < 5;
                const cartItem = cart.find(c => c.product.id === product.id);
                const inCart = !!cartItem;
                return (
                  <button key={product.id} onClick={() => addToCart(product)}
                    className={`relative text-left rounded-2xl border p-3 transition-all hover:shadow-md active:scale-95 ${
                      inCart ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-gray-200 bg-white"
                    }`}>
                    {inCart && (
                      <span className="absolute top-2.5 right-2.5 min-w-[20px] h-5 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {cartItem.qty}
                      </span>
                    )}
                    {product.image_b64 ? (
                      <img src={product.image_b64.startsWith("data:") ? product.image_b64 : `data:image/jpeg;base64,${product.image_b64}`}
                        alt={product.name} className="w-full aspect-square object-cover rounded-xl mb-2" />
                    ) : (
                      <div className="w-full aspect-square rounded-xl bg-indigo-50 flex items-center justify-center mb-2">
                        <Package className="w-8 h-8 text-indigo-300" />
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">{product.name}</p>
                    {product.sku && <p className="text-[10px] text-gray-400 mb-1">{product.sku}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm font-bold text-indigo-700">{inr(price)}</p>
                      {stock !== null && (
                        <p className={`text-[10px] font-medium ${lowStock ? "text-red-500" : "text-gray-400"}`}>
                          {lowStock ? `⚠ ${stock}` : stock}
                        </p>
                      )}
                    </div>
                    <div className={`mt-2 w-full py-1.5 rounded-lg text-xs font-bold text-center transition-colors ${
                      inCart ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {inCart ? `In cart (${cartItem.qty})` : "Add +"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── CART PANEL ── */}
      <div className={`flex flex-col h-full bg-white w-full md:w-[40%]
        ${mobileTab === "cart" ? "flex" : "hidden"} md:flex`}>

        <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            <span className="font-semibold text-gray-800">Cart</span>
            {cartCount > 0 && <Badge className="bg-indigo-600 text-white text-xs px-2">{cartCount}</Badge>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">Today: <span className="font-bold text-gray-800">{sessionSales}</span></span>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-gray-800">Cart</span>
            {cartCount > 0 && <Badge className="bg-indigo-600 text-white px-2">{cartCount} items</Badge>}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-700 h-8">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3"><CartItems /></div>
        <CartFooter />
      </div>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-40">
        <button onClick={() => setMobileTab("products")}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${mobileTab === "products" ? "text-indigo-600" : "text-gray-400"}`}>
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Products</span>
        </button>
        <button onClick={() => setMobileTab("cart")}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative ${mobileTab === "cart" ? "text-indigo-600" : "text-gray-400"}`}>
          {cartCount > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-14px)] min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {cartCount}
            </span>
          )}
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] font-semibold">{cart.length > 0 ? `Cart • ${inr(totals.grandTotal)}` : "Cart"}</span>
        </button>
      </div>

      {/* ── PAYMENT MODAL ── */}
      <Dialog open={paymentModal} onOpenChange={setPaymentModal}>
        <DialogContent className="max-w-sm mx-4 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg">How is customer paying?</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
            {/* Grand total */}
            <div className="text-center bg-indigo-50 rounded-xl py-4">
              <p className="text-xs text-gray-500 mb-1">Amount to collect</p>
              <p className="text-3xl font-bold text-indigo-700">{inr(totals.grandTotal)}</p>
            </div>

            {/* Payment options */}
            <div className="grid grid-cols-2 gap-3">
              {/* Cash */}
              <div className="space-y-2">
                <button
                  onClick={() => { /* handled via confirm below */ }}
                  className="w-full flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-green-400 bg-green-50 hover:bg-green-100 transition-colors"
                >
                  <Banknote className="w-8 h-8 text-green-600" />
                  <span className="text-sm font-bold text-green-700">Cash</span>
                </button>
                <Input
                  type="number"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  placeholder={`Amount received`}
                  className="text-center font-mono text-sm"
                />
                {cashTendered && parseFloat(cashTendered) >= totals.grandTotal && (
                  <div className="text-center text-sm font-semibold text-green-700 bg-green-50 rounded-lg py-1.5">
                    Change: {inr(cashChange)}
                  </div>
                )}
                <Button
                  onClick={() => handleBill("cash")}
                  disabled={billing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl h-10"
                >
                  {billing ? "Processing…" : "Confirm Cash"}
                </Button>
              </div>

              {/* Online / UPI */}
              <div className="space-y-2">
                <div className="w-full flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-blue-400 bg-blue-50">
                  <Smartphone className="w-8 h-8 text-blue-600" />
                  <span className="text-sm font-bold text-blue-700">UPI / Online</span>
                </div>
                {biz.upi_qr_b64 ? (
                  <div className="flex justify-center">
                    <img src={biz.upi_qr_b64} alt="UPI QR" className="w-28 h-28 rounded-xl border object-contain bg-white" />
                  </div>
                ) : (
                  <div className="text-center text-xs text-gray-400 py-2 border border-dashed rounded-xl">
                    Upload UPI QR in<br />Settings → Business
                  </div>
                )}
                <Button
                  onClick={() => handleBill("upi")}
                  disabled={billing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-10"
                >
                  {billing ? "Processing…" : "Confirm UPI"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── RECEIPT DIALOG ── */}
      <Dialog open={receiptDialog.open} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm p-0 overflow-hidden mx-4">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Sale Complete
              <Badge className={`ml-auto text-xs ${receiptDialog.paymentMethod === "cash" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                {receiptDialog.paymentMethod === "cash" ? "Cash" : "UPI"}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="p-5">
              <div id="pos-receipt-print" className="font-mono text-xs bg-white border border-dashed border-gray-300 rounded-lg p-4">
                <div className="text-center mb-3">
                  <p className="font-bold text-base">{biz.name || "Retail Store"}</p>
                  {biz.address && <p className="text-gray-500">{biz.address}</p>}
                  {biz.gstin && <p>GSTIN: {biz.gstin}</p>}
                  {biz.phone && <p>Ph: {biz.phone}</p>}
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="space-y-0.5 mb-2">
                  <div className="flex justify-between"><span>Invoice#</span><span className="font-bold">{receiptDialog.invoice?.invoice_number || receiptDialog.invoice?.id || "—"}</span></div>
                  <div className="flex justify-between"><span>Date</span><span>{today()} {timeNow()}</span></div>
                  <div className="flex justify-between"><span>Payment</span><span className="font-bold">{receiptDialog.paymentMethod === "cash" ? "Cash" : "UPI/Online"}</span></div>
                  {selectedCustomer && <div className="flex justify-between"><span>Customer</span><span>{selectedCustomer.name}</span></div>}
                </div>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="mb-2">
                  <div className="flex justify-between font-bold mb-1">
                    <span className="flex-1">Item</span><span className="w-8 text-right">Qty</span>
                    <span className="w-14 text-right">Rate</span><span className="w-16 text-right">Amt</span>
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
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
                  {totals.discountAmt > 0 && <div className="flex justify-between"><span>Discount</span><span>- {inr(totals.discountAmt)}</span></div>}
                  <div className="flex justify-between"><span>GST</span><span>{inr(totals.gstAmt)}</span></div>
                  <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 mt-1">
                    <span>TOTAL</span><span>{inr(totals.grandTotal)}</span>
                  </div>
                  {receiptDialog.paymentMethod === "cash" && cashTendered && (
                    <>
                      <div className="flex justify-between"><span>Cash Paid</span><span>{inr(parseFloat(cashTendered))}</span></div>
                      <div className="flex justify-between font-bold"><span>Change</span><span>{inr(cashChange)}</span></div>
                    </>
                  )}
                </div>
                <div className="border-t border-dashed border-gray-400 my-3" />
                <div className="text-center text-gray-500">
                  <p className="font-bold">Thank you for shopping!</p>
                  <p>Visit again</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex gap-3 px-5 pb-5 pt-2">
            <Button variant="outline" onClick={printReceipt} className="flex-1 gap-2">
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button onClick={newSale} className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <ShoppingCart className="w-4 h-4" /> New Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
