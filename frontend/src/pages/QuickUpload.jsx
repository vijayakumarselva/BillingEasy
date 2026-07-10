/**
 * Mobile quick-upload — one tap to save a purchase bill.
 * URL: /quick-upload?token=<org-token>
 *
 * Flow: pick/drop file → AI scans → purchase auto-saved → done screen.
 * No login, no form, no review step.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, Receipt, RefreshCw, Upload } from "lucide-react";
import DropZone from "@/components/DropZone";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function QuickUpload() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [orgName, setOrgName] = useState("");
  const [tokenOk, setTokenOk] = useState(null); // null=loading true false
  const [phase, setPhase] = useState("idle");   // idle scanning saved error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (!token) { setTokenOk(false); return; }
    fetch(`${BACKEND}/api/public/upload-token/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setOrgName(d.org_name); setTokenOk(true); })
      .catch(() => setTokenOk(false));
  }, [token]);

  const handleFile = async (file) => {
    setPhase("scanning");
    setResult(null);
    setErrMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${BACKEND}/api/public/quick-upload/${token}`, {
        method: "POST", body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || `Error ${r.status}`);
      setResult(data);
      setPhase("saved");
    } catch (e) {
      setErrMsg(e.message || "Upload failed — please try again");
      setPhase("error");
    }
  };

  // ── States ──────────────────────────────────────────────

  if (tokenOk === null) {
    return <Screen><Loader2 className="h-10 w-10 animate-spin text-green-500" /><p className="text-gray-500 mt-2">Loading…</p></Screen>;
  }

  if (!tokenOk) {
    return (
      <Screen>
        <AlertCircle className="h-12 w-12 text-red-400 mb-2" />
        <h2 className="text-lg font-bold text-gray-800">Invalid Link</h2>
        <p className="text-sm text-gray-500 mt-1 text-center px-4">
          This upload link is invalid or expired.<br />Get a fresh link from Settings in BillingsEasy.
        </p>
      </Screen>
    );
  }

  if (phase === "scanning") {
    return (
      <Screen>
        <div className="relative">
          <Receipt className="h-16 w-16 text-green-200" />
          <Loader2 className="h-8 w-8 animate-spin text-green-600 absolute -bottom-1 -right-1" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mt-4">Reading your bill…</h2>
        <p className="text-sm text-gray-500 mt-1">AI is extracting and saving the details</p>
      </Screen>
    );
  }

  if (phase === "saved" && result) {
    return (
      <Screen>
        <div className="w-full max-w-sm space-y-4">
          {/* Success */}
          <div className="flex flex-col items-center py-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-2" />
            <h2 className="text-2xl font-bold text-gray-900">Bill Saved!</h2>
            <p className="text-sm text-gray-500 mt-1">Open the app to review it</p>
          </div>

          {/* Bill card */}
          <div className="rounded-2xl border-2 border-green-200 bg-white overflow-hidden shadow-sm">
            <div className="bg-green-600 text-white px-5 py-3">
              <p className="font-bold text-lg">{result.supplier}</p>
              <p className="text-xs opacity-80 mt-0.5">Bill #{result.bill_no}</p>
            </div>
            <div className="px-5 py-4 flex justify-between items-center">
              <span className="text-gray-500 text-sm">Total Amount</span>
              <span className="text-2xl font-bold text-green-700">
                ₹{Number(result.total || 0).toLocaleString("en-IN")}
              </span>
            </div>
            {result.ai_data?.items?.length > 0 && (
              <div className="border-t px-5 py-3 space-y-1">
                {result.ai_data.items.slice(0, 3).map((it, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-600">
                    <span className="truncate flex-1 mr-2">{it.name}</span>
                    <span className="font-mono shrink-0">{it.qty} × ₹{it.rate}</span>
                  </div>
                ))}
                {result.ai_data.items.length > 3 && (
                  <p className="text-xs text-gray-400">+{result.ai_data.items.length - 3} more items</p>
                )}
              </div>
            )}
          </div>

          {/* Upload another */}
          <button
            onClick={() => { setPhase("idle"); setResult(null); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-green-600 text-green-700 font-semibold text-base active:bg-green-50">
            <RefreshCw className="h-4 w-4" /> Upload Another Bill
          </button>
        </div>
      </Screen>
    );
  }

  if (phase === "error") {
    return (
      <Screen>
        <AlertCircle className="h-12 w-12 text-red-400 mb-2" />
        <h2 className="text-lg font-bold text-gray-800">Upload Failed</h2>
        <p className="text-sm text-red-500 mt-1 text-center px-6">{errMsg}</p>
        <button
          onClick={() => setPhase("idle")}
          className="mt-6 px-8 py-3 rounded-2xl bg-green-600 text-white font-semibold active:bg-green-700">
          Try Again
        </button>
      </Screen>
    );
  }

  // ── Idle — main upload UI ──────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col">
      {/* Header */}
      <div className="text-center pt-10 pb-5 px-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-green-600 shadow-lg mb-3">
          <Receipt className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Bill</h1>
        <p className="text-sm text-gray-400 mt-0.5">{orgName}</p>
      </div>

      <div className="flex-1 px-5 pb-8 max-w-sm mx-auto w-full flex flex-col gap-4">
        <DropZone
          accept="image/*,.pdf"
          onFile={handleFile}
          icon={Upload}
          label="Tap or drag your bill here"
          hint="PDF, JPG or PNG · max 10 MB"
          className="bg-white shadow-sm flex-1 min-h-[200px]"
        />

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 space-y-1.5">
          <p className="font-semibold">From WhatsApp:</p>
          <p>1. Open the PDF in WhatsApp</p>
          <p>2. Tap <strong>Share →</strong> then <strong>Open in Browser</strong></p>
          <p>3. This page opens with the file ready to upload</p>
          <p className="mt-1 font-semibold">Or bookmark this page and pick the file manually.</p>
        </div>
      </div>

      <p className="text-center pb-6 text-xs text-gray-400">BillingsEasy · Secure Upload</p>
    </div>
  );
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
