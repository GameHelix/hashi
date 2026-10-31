import { edgeBetween, stepIsland } from "./board";
import { findHint, type Hint } from "./hint";
import { blockerOf, cycleCount, emptyBridges, evaluate, islandLoads } from "./rules";
import type { Bridges, Dir, Puzzle } from "./types";

/**
 * The play-session reducer — pure and framework-free, so the whole interaction
 * model (linking, cycling, crossing rejection, hints, undo/redo, restart, win)
 * is testable without a DOM. The component layer only renders this state and
 * dispatches actions.
 *
 * Sound and visual flashes are modelled as data: each action that should be
 * heard or seen bumps a nonce, and the components react to the nonce. That
 * keeps the reducer pure while still driving audio and one-shot animations.
 */

export type SoundEvent =
  | "select"
  | "bridge"
  | "double"
  | "complete"
  | "remove"
  | "clear"
  | "reject"
  | "hint"
  | "undo"
  | "win";

/** A one-shot highlight on the board. */
export type Flash =
  /** A bridge on `edge` was refused because it would cross another. */
  | { kind: "reject"; edge: number; blocker: number }
  /** Shift+arrow pointed where no island is visible. */
  | { kind: "nolink"; island: number }
  /** A hint drew a forced bridge on `edge`. */
  | { kind: "hint"; edge: number; hint: Hint }
  /** A hint took away a wrong bridge; `count` is how many were drawn. */
  | { kind: "wrong"; edge: number; count: number; hint: Hint };

export interface PlayState {
  puzzle: Puzzle;
  bridges: Bridges;
  /** The selected island, which is also the keyboard cursor. */
  selected: number | null;
  hints: number;
  status: "playing" | "won";
  past: Bridges[];
  future: Bridges[];
  voice: SoundEvent | null;
  voiceNonce: number;
  flash: Flash | null;
  flashNonce: number;
}

export type PlayAction =
  /** Select an island, or clear the selection with `null`. */
  | { type: "select"; island: number | null }
  /** Tap: select, deselect, or link to a partner of the selected island. */
  | { type: "tapIsland"; island: number }
  /** Drag from one island to another: cycle the pair's bridges. */
  | { type: "link"; from: number; to: number }
  /** Tap on a drawn bridge: cycle it. */
  | { type: "tapEdge"; edge: number }
  /** Right-click or long-press on a bridge: remove it. */
  | { type: "removeEdge"; edge: number }
  /** Remove every bridge at an island (the selected one by default). */
  | { type: "clearIsland"; island?: number }
  /** Arrow key: move the cursor to the next island that way. */
  | { type: "move"; dir: Dir }
  /** Shift+arrow: cycle the bridge leaving the cursor island that way. */
  | { type: "linkDir"; dir: Dir }
  | { type: "hint" }
  | { type: "undo" }
  | { type: "redo" }
  /** Clear the board back to the start (undoable, the clock keeps running). */
  | { type: "restart" };

export function createPlayState(puzzle: Puzzle): PlayState {
  return {
    puzzle,
    bridges: emptyBridges(puzzle),
    selected: null,
    hints: 0,
    status: "playing",
    past: [],
    future: [],
    voice: null,
    voiceNonce: 0,
    flash: null,
    flashNonce: 0,
  };
}

function withVoice(state: PlayState, voice: SoundEvent): PlayState {
  return { ...state, voice, voiceNonce: state.voiceNonce + 1 };
}

function withFlash(state: PlayState, flash: Flash): PlayState {
  return { ...state, flash, flashNonce: state.flashNonce + 1 };
}

/** Did this change bring one of the edge's islands exactly to its number? */
function completesIsland(state: PlayState, edge: number, next: Bridges): boolean {
  const { a, b } = state.puzzle.edges[edge];
  const before = islandLoads(state.puzzle, state.bridges);
  const after = islandLoads(state.puzzle, next);
  return [a, b].some(
    (i) => after[i] === state.puzzle.islands[i].need && before[i] !== state.puzzle.islands[i].need
  );
}

/**
 * Record a new position: push history, then detect the win. The win fanfare
 * replaces whatever sound the move would have made. Any highlight from an
 * earlier event is dropped — once the board moves on it no longer applies.
 */
function commit(state: PlayState, bridges: Bridges, voice: SoundEvent, patch: Partial<PlayState> = {}): PlayState {
  const next: PlayState = {
    ...state,
    ...patch,
    bridges,
    past: [...state.past, state.bridges],
    future: [],
    flash: null,
  };
  if (evaluate(state.puzzle, bridges).won) {
    return withVoice({ ...next, status: "won", selected: null }, "win");
  }
  return withVoice(next, voice);
}

/** Cycle one pair 0 → 1 → 2 → 0, refusing a bridge that would cross another. */
function cycleEdge(state: PlayState, edge: number, patch: Partial<PlayState> = {}): PlayState {
  const current = state.bridges[edge];
  const count = cycleCount(current);
  if (count > 0) {
    const blocker = blockerOf(state.puzzle, state.bridges, edge);
    if (blocker !== -1) {
      return withVoice(withFlash({ ...state, ...patch }, { kind: "reject", edge, blocker }), "reject");
    }
  }
  const bridges = state.bridges.slice();
  bridges[edge] = count;
  let voice: SoundEvent = count === 0 ? "remove" : count === 2 ? "double" : "bridge";
  if (count > 0 && completesIsland(state, edge, bridges)) voice = "complete";
  return commit(state, bridges, voice, patch);
}

function setEdge(state: PlayState, edge: number, count: number, voice: SoundEvent): PlayState {
  if (state.bridges[edge] === count) return state;
  const bridges = state.bridges.slice();
  bridges[edge] = count;
  return commit(state, bridges, voice);
}

export function playReducer(state: PlayState, action: PlayAction): PlayState {
  const { puzzle } = state;
  const playing = state.status === "playing";

  switch (action.type) {
    case "select": {
      if (action.island === state.selected) return state;
      if (action.island === null) return { ...state, selected: null };
      if (action.island < 0 || action.island >= puzzle.islands.length) return state;
      return withVoice({ ...state, selected: action.island }, "select");
    }

    case "tapIsland": {
      if (!playing) return state;
      const i = action.island;
      if (i < 0 || i >= puzzle.islands.length) return state;
      const sel = state.selected;
      if (sel === i) return { ...state, selected: null };
      if (sel !== null) {
        const edge = edgeBetween(puzzle, sel, i);
        // Tapping a visible neighbour of the selection links the pair and
        // keeps the selection, so a second tap makes it double.
        if (edge !== -1) return cycleEdge(state, edge);
      }
      return withVoice({ ...state, selected: i }, "select");
    }

    case "link": {
      if (!playing) return state;
      const edge = edgeBetween(puzzle, action.from, action.to);
      if (edge === -1) return state;
      return cycleEdge(state, edge, { selected: null });
    }

    case "tapEdge": {
      if (!playing || action.edge < 0 || action.edge >= puzzle.edges.length) return state;
      return cycleEdge(state, action.edge);
    }

    case "removeEdge": {
      if (!playing || action.edge < 0 || action.edge >= puzzle.edges.length) return state;
      return setEdge(state, action.edge, 0, "remove");
    }

    case "clearIsland": {
      if (!playing) return state;
      const i = action.island ?? state.selected;
      if (i === null || i < 0 || i >= puzzle.islands.length) return state;
      const touched = puzzle.incident[i].filter((e) => state.bridges[e] > 0);
      if (touched.length === 0) return state;
      const bridges = state.bridges.slice();
      for (const e of touched) bridges[e] = 0;
      return commit(state, bridges, "clear");
    }

    case "move": {
      if (puzzle.islands.length === 0) return state;
      if (state.selected === null) return withVoice({ ...state, selected: 0 }, "select");
      const next = stepIsland(puzzle, state.selected, action.dir);
      if (next === -1) return state;
      return withVoice({ ...state, selected: next }, "select");
    }

    case "linkDir": {
      if (!playing) return state;
      if (state.selected === null) return withVoice({ ...state, selected: 0 }, "select");
      const edge = puzzle.links[state.selected][action.dir];
      if (edge === -1) {
        return withVoice(withFlash(state, { kind: "nolink", island: state.selected }), "reject");
      }
      return cycleEdge(state, edge);
    }

    case "hint": {
      if (!playing) return state;
      const hint = findHint(puzzle, state.bridges);
      if (!hint) return state;
      const bridges = state.bridges.slice();
      const drawn = bridges[hint.edge];
      bridges[hint.edge] = hint.count;
      const flash: Flash =
        hint.kind === "remove"
          ? { kind: "wrong", edge: hint.edge, count: drawn, hint }
          : { kind: "hint", edge: hint.edge, hint };
      return withFlash(commit(state, bridges, "hint", { hints: state.hints + 1 }), flash);
    }

    case "undo": {
      if (!playing || state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return withVoice(
        {
          ...state,
          bridges: prev,
          past: state.past.slice(0, -1),
          future: [state.bridges, ...state.future],
          flash: null,
        },
        "undo"
      );
    }

    case "redo": {
      if (!playing || state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      const redone: PlayState = {
        ...state,
        bridges: next,
        past: [...state.past, state.bridges],
        future: rest,
        flash: null,
      };
      if (evaluate(puzzle, next).won) return withVoice({ ...redone, status: "won", selected: null }, "win");
      return withVoice(redone, "undo");
    }

    case "restart": {
      if (!playing || state.bridges.every((n) => n === 0)) return state;
      return commit(state, emptyBridges(puzzle), "clear", { selected: null });
    }

    default:
      return state;
  }
}

/** mm:ss for the timer and best-time displays. */
export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
