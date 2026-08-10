// Mobile / Capacitor detection and safe browser/download helpers

export const isCapacitor = typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.());
export const isMobileApp = isCapacitor || /Android|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Safe alternative to window.open() for new-tab content.
 * On mobile/Capacitor, renders HTML into the current window temporarily.
 * On desktop, opens a new tab.
 */
export function openPrintWindow(htmlContent) {
  if (isCapacitor) {
    // In Capacitor webview, window.open is blocked — render in a fullscreen overlay instead
    const overlay = document.createElement("div");
    overlay.id = "print-overlay";
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:99999;
      overflow-y:auto;padding:0;
    `;
    overlay.innerHTML = htmlContent;

    // Add a close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.style.cssText = `
      position:fixed;top:12px;right:12px;z-index:100000;
      background:#ef4444;color:#fff;border:none;border-radius:8px;
      padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer;
    `;
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  } else {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(htmlContent);
    win.document.close();
  }
}

/**
 * Open an external URL safely.
 * On Capacitor, window.open("_blank") may be blocked — use "_system" to
 * hand off to the device browser / WhatsApp / etc.
 */
export function openExternalUrl(url) {
  if (isCapacitor) {
    window.open(url, "_system");
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Download a file from a blob/data-URI.
 * On Capacitor anchor-click downloads don't work — open in system browser instead.
 */
export function downloadFile(url, filename) {
  if (isCapacitor) {
    window.open(url, "_system");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/**
 * Download a PNG data-URI as a file.
 * On mobile, falls back to showing the image in the same tab.
 */
export function downloadOrShowPng(dataUri, filename) {
  if (isCapacitor) {
    // Open image in overlay so user can long-press save
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);
      z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    `;
    overlay.innerHTML = `
      <p style="color:#fff;font-size:13px;opacity:0.7;">Long-press the image to save</p>
      <img src="${dataUri}" style="max-width:90%;max-height:80vh;border-radius:8px;" />
      <button onclick="this.parentElement.remove()" style="color:#fff;background:#ef4444;border:none;border-radius:8px;padding:8px 20px;font-size:14px;cursor:pointer;">Close</button>
    `;
    document.body.appendChild(overlay);
  } else {
    const a = document.createElement("a");
    a.download = filename;
    a.href = dataUri;
    a.click();
  }
}
