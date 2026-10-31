"use client";

import { cx } from "@/lib/cx";
import { DIFFICULTIES, LEVELS } from "@/lib/game/constants";
import { formatTime } from "@/lib/game/play";
import type { Difficulty } from "@/lib/game/types";

interface MenuScreenProps {
  difficulty: Difficulty;
  bestTimes: Record<string, number>;
  soundOn: boolean;
  /** A puzzle is being generated; Start waits for it. */
  busy: boolean;
  onDifficulty: (difficulty: Difficulty) => void;
  onStart: () => void;
  onRules: () => void;
  onToggleSound: () => void;
}

export function MenuScreen({
  difficulty,
  bestTimes,
  soundOn,
  busy,
  onDifficulty,
  onStart,
  onRules,
  onToggleSound,
}: MenuScreenProps) {
  return (
    <>
      <h1 className="hs-title">{"🌉 HASHI"}</h1>
      <p className="hs-subtitle">Bridge every island into one network. One solution, no guessing.</p>

      <div className="hs-card">
        <span className="hs-field-label">Difficulty</span>
        <div className="hs-level-row">
          {DIFFICULTIES.map((d) => {
            const level = LEVELS[d];
            return (
              <button
                key={d}
                type="button"
                className={cx("hs-level", d === difficulty && "is-on")}
                onClick={() => onDifficulty(d)}
                aria-pressed={d === difficulty}
              >
                <span className="hs-level-name">{level.label}</span>
                <span className="hs-level-meta">{`${level.size}×${level.size}`}</span>
                <span className="hs-level-meta">{`~${Math.round((level.islands[0] + level.islands[1]) / 2)} isles`}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="hs-primary" onClick={onStart} disabled={busy}>
          {busy ? "Charting islands…" : "Start puzzle"}
        </button>

        <span className="hs-field-label">Best times</span>
        <div className="hs-best-grid">
          {DIFFICULTIES.map((d) => {
            const best = bestTimes[d];
            return (
              <div key={d} className={cx("hs-best", d === difficulty && "is-on")}>
                <span className="hs-best-name">{LEVELS[d].label}</span>
                <span className="hs-best-time">{typeof best === "number" ? formatTime(best) : "—"}</span>
              </div>
            );
          })}
        </div>

        <div className="hs-menu-row">
          <button type="button" className="hs-ghost" onClick={onRules}>
            How to play
          </button>
          <button type="button" className="hs-ghost" onClick={onToggleSound} aria-pressed={soundOn}>
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        </div>
      </div>
    </>
  );
}
