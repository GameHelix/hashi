"use client";

import { formatTime } from "@/lib/game/play";

interface HudProps {
  seconds: number;
  /** Level name and grid, e.g. "Easy 7×7". */
  level: string;
  done: number;
  total: number;
  hints: number;
}

export function Hud({ seconds, level, done, total, hints }: HudProps) {
  return (
    <div className="hs-hud">
      <div className="hs-stat">
        <span className="hs-stat-label">Time</span>
        <span className="hs-stat-value">{formatTime(seconds)}</span>
      </div>
      <div className="hs-stat">
        <span className="hs-stat-label">Level</span>
        <span className="hs-stat-value hs-stat-small">{level}</span>
      </div>
      <div className="hs-stat">
        <span className="hs-stat-label">Islands</span>
        <span className="hs-stat-value">{`${done}/${total}`}</span>
      </div>
      <div className="hs-stat">
        <span className="hs-stat-label">Hints</span>
        <span className="hs-stat-value">{hints}</span>
      </div>
    </div>
  );
}
