"use client";

import { LEVELS } from "@/lib/game/constants";
import { formatTime } from "@/lib/game/play";
import type { Difficulty } from "@/lib/game/types";

interface WinPanelProps {
  difficulty: Difficulty;
  time: number;
  best: number;
  /** The record before this solve, or null on a first solve. */
  previousBest: number | null;
  isNewBest: boolean;
  hints: number;
  onPlayAgain: () => void;
  onMenu: () => void;
}

function verdict(time: number, previousBest: number | null, isNewBest: boolean): string {
  if (previousBest === null) return "First solve on this level — the record to beat.";
  if (isNewBest) return `Beat your old best of ${formatTime(previousBest)}.`;
  if (time === previousBest) return "Level with your best time.";
  return `${formatTime(time - previousBest)} behind your best.`;
}

export function WinPanel({
  difficulty,
  time,
  best,
  previousBest,
  isNewBest,
  hints,
  onPlayAgain,
  onMenu,
}: WinPanelProps) {
  const level = LEVELS[difficulty];
  return (
    <div className="hs-overlay" role="dialog" aria-modal aria-label="Puzzle solved">
      <div className="hs-dialog">
        <h2 className="hs-dialog-title">{"🌉 Bridged!"}</h2>
        {isNewBest ? <p className="hs-record">{"★ New record ★"}</p> : null}
        <p className="hs-win-time">{formatTime(time)}</p>
        <div className="hs-win-stats">
          <div className="hs-best">
            <span className="hs-best-name">Level</span>
            <span className="hs-best-time">{`${level.label} ${level.size}×${level.size}`}</span>
          </div>
          <div className="hs-best">
            <span className="hs-best-name">Best</span>
            <span className="hs-best-time">{formatTime(best)}</span>
          </div>
          <div className="hs-best">
            <span className="hs-best-name">Hints</span>
            <span className="hs-best-time">{hints}</span>
          </div>
        </div>
        <p className="hs-win-note">{verdict(time, previousBest, isNewBest)}</p>
        <button type="button" className="hs-primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="hs-ghost" onClick={onMenu}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
