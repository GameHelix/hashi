"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Board } from "./Board";
import { Controls } from "./Controls";
import { Hud } from "./Hud";
import { StatusBar } from "./StatusBar";
import { useSound } from "@/lib/hooks/useSound";
import { LEVELS } from "@/lib/game/constants";
import { createPlayState, playReducer } from "@/lib/game/play";
import { evaluate, partnersOf } from "@/lib/game/rules";
import { flashNotice, positionStatus } from "@/lib/game/status";
import type { Difficulty, Dir, Puzzle } from "@/lib/game/types";

interface PlayScreenProps {
  puzzle: Puzzle;
  soundOn: boolean;
  paused: boolean;
  /** A fresh puzzle is being generated. */
  busy: boolean;
  onWin: (difficulty: Difficulty, seconds: number, hints: number) => void;
  onNewPuzzle: () => void;
  onRules: () => void;
  onToggleSound: () => void;
  onExit: () => void;
}

/** How long a one-off notice (refused bridge, hint) stays before the summary returns. */
const NOTICE_MS = 2600;

const ARROWS: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

export function PlayScreen({
  puzzle,
  soundOn,
  paused,
  busy,
  onWin,
  onNewPuzzle,
  onRules,
  onToggleSound,
  onExit,
}: PlayScreenProps) {
  const [state, dispatch] = useReducer(playReducer, puzzle, createPlayState);
  const [seconds, setSeconds] = useState(0);
  // The flash nonce whose notice has run its course.
  const [noticeDone, setNoticeDone] = useState(0);
  const play = useSound(soundOn);

  const won = state.status === "won";

  // Timer: ticks while playing, not behind a dialog, and only while the tab is
  // visible — a hidden board cannot be worked on. Once solved the interval is
  // cleared, freezing the final time.
  useEffect(() => {
    if (won || paused) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [won, paused]);

  // Sound: play once per event, keyed by a monotonic nonce so toggling the
  // sound switch never replays the last effect.
  const lastVoice = useRef(0);
  useEffect(() => {
    if (state.voiceNonce !== lastVoice.current && state.voice) {
      lastVoice.current = state.voiceNonce;
      play(state.voice);
    }
  }, [state.voiceNonce, state.voice, play]);

  // Retire each notice after a moment so the standing summary comes back.
  useEffect(() => {
    if (state.flashNonce === 0) return;
    const nonce = state.flashNonce;
    const id = window.setTimeout(() => setNoticeDone(nonce), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [state.flashNonce]);

  // Report the win up exactly once; the parent owns best-time persistence and
  // the win panel.
  const reported = useRef(false);
  useEffect(() => {
    if (won && !reported.current) {
      reported.current = true;
      onWin(puzzle.difficulty, seconds, state.hints);
    }
  }, [won, seconds, state.hints, onWin, puzzle.difficulty]);

  // Keyboard: arrows move the cursor, Shift+arrow builds, Delete/Backspace
  // clears the selected island, Esc deselects, H hints, Ctrl/Cmd+Z / Y undo
  // and redo. Held keys may keep moving the cursor, but never repeat a
  // board-changing build or hint.
  useEffect(() => {
    if (paused || won) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const mod = e.metaKey || e.ctrlKey;
      const dir = ARROWS[k];
      if (dir !== undefined && !mod && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey && e.repeat) return;
        dispatch(e.shiftKey ? { type: "linkDir", dir } : { type: "move", dir });
      } else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        dispatch({ type: "clearIsland" });
      } else if (k === "Escape") {
        dispatch({ type: "select", island: null });
      } else if ((k === "z" || k === "Z") && mod) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if ((k === "y" || k === "Y") && mod) {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if ((k === "h" || k === "H") && !mod && !e.altKey && !e.repeat) {
        dispatch({ type: "hint" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, won]);

  const evaluation = useMemo(() => evaluate(puzzle, state.bridges), [puzzle, state.bridges]);
  const partners = useMemo(
    () => new Set(state.selected === null ? [] : partnersOf(puzzle, state.bridges, state.selected)),
    [puzzle, state.bridges, state.selected]
  );
  const total = puzzle.islands.length;
  // A flash (and its notice) is live until its timer retires it.
  const flash = state.flash && state.flashNonce !== noticeDone && !won ? state.flash : null;
  const status = flash ? flashNotice(puzzle, flash) : positionStatus(evaluation, total);

  const onTapIsland = useCallback((island: number) => dispatch({ type: "tapIsland", island }), []);
  const onLink = useCallback((from: number, to: number) => dispatch({ type: "link", from, to }), []);
  const onTapEdge = useCallback((edge: number) => dispatch({ type: "tapEdge", edge }), []);
  const onRemoveEdge = useCallback((edge: number) => dispatch({ type: "removeEdge", edge }), []);
  const onClearIsland = useCallback((island: number) => dispatch({ type: "clearIsland", island }), []);
  const onDeselect = useCallback(() => dispatch({ type: "select", island: null }), []);

  return (
    <div className="hs-play">
      <Hud
        seconds={seconds}
        level={LEVELS[puzzle.difficulty].label}
        done={evaluation.done}
        total={total}
        hints={state.hints}
      />

      <StatusBar status={status} progress={total === 0 ? 0 : evaluation.done / total} />

      <Board
        puzzle={puzzle}
        bridges={state.bridges}
        evaluation={evaluation}
        selected={state.selected}
        partners={partners}
        flash={flash}
        flashNonce={state.flashNonce}
        disabled={won || paused}
        onTapIsland={onTapIsland}
        onLink={onLink}
        onTapEdge={onTapEdge}
        onRemoveEdge={onRemoveEdge}
        onClearIsland={onClearIsland}
        onDeselect={onDeselect}
      />

      <Controls
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canRestart={state.bridges.some((n) => n > 0)}
        disabled={won}
        onHint={() => dispatch({ type: "hint" })}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onRestart={() => dispatch({ type: "restart" })}
      />

      <div className="hs-footer">
        <button type="button" className="hs-ghost" onClick={onNewPuzzle} disabled={busy}>
          {busy ? "Charting…" : "New puzzle"}
        </button>
        <button type="button" className="hs-ghost" onClick={onRules}>
          Rules
        </button>
        <button
          type="button"
          className="hs-ghost hs-icon-btn"
          onClick={onToggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? "Sound on" : "Sound off"}
          title={soundOn ? "Sound on" : "Sound off"}
        >
          {soundOn ? "🔊" : "🔇"}
        </button>
        <button type="button" className="hs-ghost" onClick={onExit}>
          Menu
        </button>
      </div>

      <p className="hs-keys" aria-hidden>
        Arrows move · Shift+arrow builds · Del clears · H hint · Ctrl/⌘+Z undo · Ctrl/⌘+Y redo
      </p>
    </div>
  );
}
