import type { Difficulty } from "./types";

/** Menu order, gentlest first. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

/** The level the menu opens on. */
export const DEFAULT_DIFFICULTY: Difficulty = "easy";

export interface LevelInfo {
  label: string;
  /** Grid side; boards are square. */
  size: number;
  /** Inclusive island-count range the generator aims for. */
  islands: readonly [number, number];
}

export const LEVELS: Record<Difficulty, LevelInfo> = {
  easy: { label: "Easy", size: 7, islands: [10, 12] },
  medium: { label: "Medium", size: 10, islands: [18, 22] },
  hard: { label: "Hard", size: 13, islands: [28, 32] },
  expert: { label: "Expert", size: 15, islands: [38, 42] },
};

/** localStorage key holding the best time (seconds) per difficulty. */
export const BEST_TIMES_KEY = "hashi.best.v1";

/** localStorage key for the sound switch. */
export const SOUND_KEY = "hashi.sound.v1";
