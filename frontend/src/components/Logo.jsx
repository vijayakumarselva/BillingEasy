// BillEasy logo — a stylized invoice card with an integrated ₹ rupee mark.
// Designed to read as "B" + "₹" + "invoice lines" simultaneously.
// Use <Logo /> for icon-only or <Logo withWordmark /> for icon + "BillEasy".
import React from "react";

export function LogoMark({ size = 36, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BillEasy"
      className={className}
    >
      <defs>
        <linearGradient id="be-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      {/* Rounded invoice card */}
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#be-grad)" />
      {/* Ledger lines */}
      <rect x="14" y="42" width="20" height="3" rx="1.5" fill="#ffffff" fillOpacity="0.35" />
      <rect x="14" y="49" width="14" height="3" rx="1.5" fill="#ffffff" fillOpacity="0.22" />
      {/* Stylized ₹ / B */}
      <path
        d="M22 16 H40 a8 8 0 0 1 0 16 H28
           M22 24 H38
           M22 32 L40 44"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tiny check-mark accent for 'Easy' */}
      <path
        d="M42 16 l3 3 l6 -6"
        fill="none"
        stroke="#22D3EE"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ withWordmark = false, size = 36, className = "", wordmarkClassName = "" }) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-semibold tracking-tight ${wordmarkClassName}`} style={{ fontFamily: "Outfit, sans-serif" }}>
        Bill<span className="text-blue-600">Easy</span>
      </span>
    </span>
  );
}
