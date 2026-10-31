"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuScreen } from "./MenuScreen";
import { PlayScreen } from "./PlayScreen";
import { RulesPanel } from "./RulesPanel";
import { WinPanel } from "./WinPanel";
import { BEST_TIMES_KEY, DEFAULT_DIFFICULTY, SOUND_KEY } from "@/lib/game/constants";
import { generatePuzzle } from "@/lib/game/generator";
import { randomSeed } from "@/lib/game/rng";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import type { Difficulty, Puzzle } from "@/lib/game/types";

/** Pause between the winning move and the win panel. */
const WIN_REVEAL_MS = 900;

interface ActiveGame {
  puzzle: Puzzle;
  /** Bumped on every new puzzle so PlayScreen remounts with a clean state. */
  nonce: number;
}

interface WinResult {
  difficulty: Difficulty;
  time: number;
  best: number;
  previousBest: number | null;
  isNewBest: boolean;
  hints: number;
}

/**
 * Top-level orchestrator: routes between the menu and a play session, owns the
 * persisted best times and sound switch, the rules dialog and the win panel.
 * Puzzles are only generated in response to a user action, so nothing random
 * runs during SSR and the first paint always matches the server markup.
 */
export function HashiGame() {
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [win, setWin] = useState<WinResult | null>(null);
  const { value: soundOn, store: storeSound } = useLocalStorage<boolean>(SOUND_KEY, true);
  const { value: bestTimes, store: storeBestTimes } = useLocalStorage<Record<string, number>>(
    BEST_TIMES_KEY,
    {}
  );
  const pending = useRef<number | null>(null);
  const reveal = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
      if (reveal.current !== null) window.clearTimeout(reveal.current);
    },
    []
  );

  const cancelReveal = useCallback(() => {
    if (reveal.current !== null) window.clearTimeout(reveal.current);
    reveal.current = null;
  }, []);

  const startPuzzle = useCallback((level: Difficulty) => {
    cancelReveal();
    setWin(null);
    setBusy(true);
    if (pending.current !== null) window.clearTimeout(pending.current);
    // Yield one frame first so the "charting" state paints before the
    // generator and its uniqueness proofs run.
    pending.current = window.setTimeout(() => {
      pending.current = null;
      const puzzle = generatePuzzle({ difficulty: level, seed: randomSeed() });
      setGame((prev) => ({ puzzle, nonce: (prev?.nonce ?? 0) + 1 }));
      setBusy(false);
    }, 16);
  }, [cancelReveal]);

  const handleStart = useCallback(() => startPuzzle(difficulty), [difficulty, startPuzzle]);

  const handleExit = useCallback(() => {
    cancelReveal();
    setWin(null);
    setGame(null);
  }, [cancelReveal]);

  const handleWin = useCallback(
    (level: Difficulty, seconds: number, hints: number) => {
      const prev = bestTimes[level];
      const previousBest = typeof prev === "number" ? prev : null;
      const isNewBest = previousBest === null || seconds < previousBest;
      if (isNewBest) storeBestTimes({ ...bestTimes, [level]: seconds });
      const result: WinResult = {
        difficulty: level,
        time: seconds,
        best: isNewBest ? seconds : (previousBest ?? seconds),
        previousBest,
        isNewBest,
        hints,
      };
      // Let the finished board glow for a beat before the panel covers it;
      // this also keeps a tap that lands just after the winning move from
      // hitting the panel's buttons.
      cancelReveal();
      reveal.current = window.setTimeout(() => {
        reveal.current = null;
        setWin(result);
      }, WIN_REVEAL_MS);
    },
    [bestTimes, storeBestTimes, cancelReveal]
  );

  const toggleSound = useCallback(() => storeSound(!soundOn), [soundOn, storeSound]);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);

  return (
    <main className="hs-app">
      {game ? (
        <PlayScreen
          key={game.nonce}
          puzzle={game.puzzle}
          soundOn={soundOn}
          paused={rulesOpen || win !== null}
          busy={busy}
          onWin={handleWin}
          onNewPuzzle={handleStart}
          onRules={openRules}
          onToggleSound={toggleSound}
          onExit={handleExit}
        />
      ) : (
        <MenuScreen
          difficulty={difficulty}
          bestTimes={bestTimes}
          soundOn={soundOn}
          busy={busy}
          onDifficulty={setDifficulty}
          onStart={handleStart}
          onRules={openRules}
          onToggleSound={toggleSound}
        />
      )}

      {win ? (
        <WinPanel
          difficulty={win.difficulty}
          time={win.time}
          best={win.best}
          previousBest={win.previousBest}
          isNewBest={win.isNewBest}
          hints={win.hints}
          onPlayAgain={handleStart}
          onMenu={handleExit}
        />
      ) : null}

      {rulesOpen ? <RulesPanel onClose={closeRules} /> : null}
    </main>
  );
}
