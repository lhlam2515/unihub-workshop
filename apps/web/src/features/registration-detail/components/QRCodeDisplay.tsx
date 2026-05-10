"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface QRCodeDisplayProps {
  qrCode: string;
  size?: number;
}

export function QRCodeDisplay({ qrCode, size = 256 }: QRCodeDisplayProps) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(qrCode, { type: "svg", width: size, margin: 2 }).then(
      (str) => {
        if (!cancelled) setSvg(str);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [qrCode, size]);

  if (!svg)
    return (
      <div
        className="bg-muted animate-pulse rounded-lg"
        style={{ width: size, height: size }}
      />
    );

  return (
    <div
      data-testid="qr-code"
      className="inline-block rounded-lg bg-white p-2"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
