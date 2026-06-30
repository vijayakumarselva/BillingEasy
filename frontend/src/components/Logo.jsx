import React from "react";

// Logo B — BE hexagon monogram
export function LogoMark({ size = 36, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BillingEasy"
      className={className}
    >
      <defs>
        <linearGradient id="be-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      {/* Hexagon */}
      <polygon
        points="32,3 59,18 59,46 32,61 5,46 5,18"
        fill="url(#be-grad)"
      />
      {/* BE monogram */}
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="26"
        fill="white"
        letterSpacing="-1"
      >
        BE
      </text>
    </svg>
  );
}

export default function Logo({ withWordmark = false, size = 36, className = "", wordmarkClassName = "" }) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-semibold tracking-tight ${wordmarkClassName}`} style={{ fontFamily: "Outfit, sans-serif" }}>
        Billing<span className="text-blue-600">Easy</span>
      </span>
    </span>
  );
}
