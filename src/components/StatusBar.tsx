"use client";

import { cx } from "@/lib/cx";
import type { StatusLine } from "@/lib/game/status";

interface StatusBarProps {
  status: StatusLine;
  /** Share of islands holding exactly their number, 0..1. */
  progress: number;
}

/** A slim progress meter with the live status sentence underneath. */
export function StatusBar({ status, progress }: StatusBarProps) {
  return (
    <div className="hs-status">
      <div
        className="hs-meter"
        role="progressbar"
        aria-label="Islands complete"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span className="hs-meter-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p className={cx("hs-status-text", `is-${status.tone}`)} aria-live="polite">
        {status.text}
      </p>
    </div>
  );
}
