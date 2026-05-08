"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  expiresAt: string;
  onExpired: () => void;
}

export function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const r = Math.max(
        0,
        (new Date(expiresAt).getTime() - Date.now()) / 1000
      );
      setRemaining(r);
      if (r <= 0) {
        clearInterval(timer);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);

  return (
    <span className="font-mono text-sm">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
