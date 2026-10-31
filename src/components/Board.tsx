"use client";

import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cx } from "@/lib/cx";
import { hitTest, islandCenter, otherEnd, type Hit } from "@/lib/game/board";
import type { Flash } from "@/lib/game/play";
import { blockerOf, cycleCount, type Evaluation } from "@/lib/game/rules";
import type { Bridges, Dir, Puzzle } from "@/lib/game/types";

/** Island radius, in cells. */
const R = 0.37;
/** Half the spacing between the two lines of a double bridge. */
const GAP = 0.1;
/** Margin around the grid so glows at the border are not clipped. */
const PAD = 0.3;
/** Finger travel (CSS px) before a press becomes a drag. */
const DRAG_PX = 9;
/** Hold time for a touch long-press. */
const LONG_PRESS_MS = 480;

interface BoardProps {
  puzzle: Puzzle;
  bridges: Bridges;
  evaluation: Evaluation;
  selected: number | null;
  /** Islands the selected island may link to right now. */
  partners: ReadonlySet<number>;
  flash: Flash | null;
  flashNonce: number;
  disabled: boolean;
  onTapIsland: (island: number) => void;
  onLink: (from: number, to: number) => void;
  onTapEdge: (edge: number) => void;
  onRemoveEdge: (edge: number) => void;
  onClearIsland: (island: number) => void;
  onDeselect: () => void;
}

interface Gesture {
  pointerId: number;
  hit: Hit;
  clientX: number;
  clientY: number;
  dragging: boolean;
  /** A long-press already acted; the release must do nothing. */
  spent: boolean;
  timer: number | null;
}

interface Preview {
  from: number;
  dir: Dir;
  /** Target island, or -1 when nothing lies that way. */
  to: number;
  mode: "add" | "remove" | "blocked" | "none";
}

/** Endpoints of the line(s) a bridge draws, trimmed to the island rims. */
function bridgeLines(puzzle: Puzzle, edge: number, count: number) {
  const { a, b, horizontal } = puzzle.edges[edge];
  const p = islandCenter(puzzle, a);
  const q = islandCenter(puzzle, b);
  const offsets = count === 2 ? [-GAP, GAP] : [0];
  return offsets.map((o) =>
    horizontal
      ? { x1: p.x + R, y1: p.y + o, x2: q.x - R, y2: q.y + o }
      : { x1: p.x + o, y1: p.y + R, x2: q.x + o, y2: q.y - R }
  );
}

function dirOf(dx: number, dy: number): Dir {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/**
 * The SVG board. Pointer input is hit-tested geometrically (islands own their
 * whole cell, bridges a band around their line) rather than through DOM
 * targets, which keeps taps forgiving on a phone and lets one handler set tell
 * taps, drags, right-clicks and long-presses apart.
 */
function BoardComponent({
  puzzle,
  bridges,
  evaluation,
  selected,
  partners,
  flash,
  flashNonce,
  disabled,
  onTapIsland,
  onLink,
  onTapEdge,
  onRemoveEdge,
  onClearIsland,
  onDeselect,
}: BoardProps) {
  // useId output is not a safe fragment identifier; keep it to word characters.
  const uid = `hs${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const { rows, cols } = puzzle;

  useEffect(
    () => () => {
      const g = gesture.current;
      if (g?.timer) window.clearTimeout(g.timer);
    },
    []
  );

  const dots = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (puzzle.islandAt[r * cols + c] === -1) out.push({ x: c + 0.5, y: r + 0.5 });
      }
    }
    return out;
  }, [puzzle, rows, cols]);

  const toBoard = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const stopTimer = (g: Gesture) => {
    if (g.timer !== null) {
      window.clearTimeout(g.timer);
      g.timer = null;
    }
  };

  /** Which way a drag from `g` currently points, and what releasing would do. */
  const aim = (g: Gesture, clientX: number, clientY: number): Preview | null => {
    if (g.hit?.kind !== "island") return null;
    const dx = clientX - g.clientX;
    const dy = clientY - g.clientY;
    if (Math.hypot(dx, dy) < DRAG_PX) return null;
    const from = g.hit.id;
    const dir = dirOf(dx, dy);
    const edge = puzzle.links[from][dir];
    if (edge === -1) return { from, dir, to: -1, mode: "none" };
    const to = otherEnd(puzzle, edge, from);
    const next = cycleCount(bridges[edge]);
    const mode =
      next === 0 ? "remove" : bridges[edge] === 0 && blockerOf(puzzle, bridges, edge) !== -1 ? "blocked" : "add";
    return { from, dir, to, mode };
  };

  const handleDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const p = toBoard(e.clientX, e.clientY);
    if (!p) return;
    const hit = hitTest(puzzle, p.x, p.y, (id) => bridges[id] > 0);
    if (e.button === 2) {
      // Right-click removes: a bridge outright, or every bridge at an island.
      e.preventDefault();
      if (hit?.kind === "edge") onRemoveEdge(hit.id);
      else if (hit?.kind === "island") onClearIsland(hit.id);
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const prev = gesture.current;
    if (prev) stopTimer(prev);
    const g: Gesture = {
      pointerId: e.pointerId,
      hit,
      clientX: e.clientX,
      clientY: e.clientY,
      dragging: false,
      spent: false,
      timer: null,
    };
    if (hit && e.pointerType !== "mouse") {
      g.timer = window.setTimeout(() => {
        g.timer = null;
        if (g.dragging) return;
        g.spent = true;
        if (hit.kind === "edge") onRemoveEdge(hit.id);
        else onClearIsland(hit.id);
        navigator.vibrate?.(24);
      }, LONG_PRESS_MS);
    }
    gesture.current = g;
  };

  const handleMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || g.spent) return;
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.clientX, e.clientY - g.clientY) < DRAG_PX) return;
      g.dragging = true;
      stopTimer(g);
    }
    const next = aim(g, e.clientX, e.clientY);
    setPreview((cur) =>
      cur && next && cur.from === next.from && cur.dir === next.dir && cur.to === next.to && cur.mode === next.mode
        ? cur
        : next
    );
  };

  const handleUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    stopTimer(g);
    gesture.current = null;
    setPreview(null);
    if (g.spent || disabled) return;
    if (g.dragging) {
      const shot = aim(g, e.clientX, e.clientY);
      if (shot && shot.to !== -1) onLink(shot.from, shot.to);
      return;
    }
    if (!g.hit) onDeselect();
    else if (g.hit.kind === "island") onTapIsland(g.hit.id);
    else onTapEdge(g.hit.id);
  };

  const handleCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    stopTimer(g);
    gesture.current = null;
    setPreview(null);
  };

  const shake = flash?.kind === "reject" || flash?.kind === "nolink";

  return (
    <div
      className={cx("hs-board", shake && (flashNonce % 2 ? "is-shake-a" : "is-shake-b"), evaluation.won && "is-won")}
    >
      <svg
        ref={svgRef}
        className="hs-svg"
        viewBox={`${-PAD} ${-PAD} ${cols + 2 * PAD} ${rows + 2 * PAD}`}
        role="img"
        aria-label={`Hashi board, ${cols} by ${rows}, ${puzzle.islands.length} islands, ${evaluation.done} complete`}
        data-rows={rows}
        data-cols={cols}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onLostPointerCapture={handleCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <radialGradient id={`${uid}-halo-ok`}>
            <stop offset="45%" stopColor="#34d399" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-halo-bad`}>
            <stop offset="45%" stopColor="#fb7185" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-halo-sel`}>
            <stop offset="40%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect
          className="hs-water"
          x={-PAD}
          y={-PAD}
          width={cols + 2 * PAD}
          height={rows + 2 * PAD}
          rx={0.35}
        />
        <g className="hs-dots" aria-hidden>
          {dots.map((d) => (
            <circle key={`${d.x}:${d.y}`} cx={d.x} cy={d.y} r={0.045} />
          ))}
        </g>

        {selected !== null ? (
          <g className="hs-guides" aria-hidden>
            {puzzle.incident[selected].map((edge) => {
              const to = otherEnd(puzzle, edge, selected);
              if (!partners.has(to) || bridges[edge] > 0) return null;
              const [line] = bridgeLines(puzzle, edge, 1);
              return <line key={edge} {...line} />;
            })}
          </g>
        ) : null}

        <g className="hs-bridges" aria-hidden>
          {puzzle.edges.map((_, edge) => {
            const count = bridges[edge];
            if (count === 0) return null;
            return (
              <g key={edge} className="hs-bridge" data-edge={edge} data-count={count}>
                {bridgeLines(puzzle, edge, count).map((l, k) => (
                  <g key={k}>
                    <line className="hs-bridge-glow" {...l} />
                    <line className="hs-bridge-core" {...l} />
                  </g>
                ))}
              </g>
            );
          })}
        </g>

        {flash && flash.kind === "reject" ? (
          <g key={`f${flashNonce}`} className="hs-ghost is-reject" aria-hidden>
            {bridgeLines(puzzle, flash.edge, 1).map((l, k) => (
              <line key={k} {...l} />
            ))}
            {bridgeLines(puzzle, flash.blocker, Math.max(1, bridges[flash.blocker])).map((l, k) => (
              <line key={`b${k}`} className="hs-ghost-blocker" {...l} />
            ))}
          </g>
        ) : null}
        {flash && flash.kind === "wrong" ? (
          <g key={`f${flashNonce}`} className="hs-ghost is-wrong" aria-hidden>
            {bridgeLines(puzzle, flash.edge, flash.count).map((l, k) => (
              <line key={k} {...l} />
            ))}
          </g>
        ) : null}
        {flash && flash.kind === "hint" ? (
          <g key={`f${flashNonce}`} className="hs-ghost is-hint" aria-hidden>
            {bridgeLines(puzzle, flash.edge, bridges[flash.edge] || 1).map((l, k) => (
              <line key={k} {...l} />
            ))}
          </g>
        ) : null}

        {preview && preview.to !== -1 ? (
          <g className={cx("hs-preview", `is-${preview.mode}`)} aria-hidden>
            {(() => {
              const edge = puzzle.links[preview.from][preview.dir];
              const [l] = bridgeLines(puzzle, edge, 1);
              return <line {...l} />;
            })()}
          </g>
        ) : null}

        <g className="hs-islands">
          {puzzle.islands.map((isl, i) => {
            const { x, y } = islandCenter(puzzle, i);
            const done = evaluation.satisfied[i];
            const over = evaluation.over[i];
            const isSel = selected === i;
            const isPartner = !isSel && partners.has(i);
            const targetMode = preview !== null && preview.to === i ? preview.mode : null;
            const isNoLink = flash?.kind === "nolink" && flash.island === i;
            const halo = over ? "bad" : isSel ? "sel" : done ? "ok" : null;
            return (
              <g
                key={i}
                className={cx(
                  "hs-island",
                  done && "is-done",
                  over && "is-over",
                  isSel && "is-selected",
                  isPartner && "is-partner",
                  targetMode && `is-target is-target-${targetMode}`,
                  isNoLink && "is-nolink"
                )}
                transform={`translate(${x} ${y})`}
                data-island={i}
                data-r={isl.r}
                data-c={isl.c}
                data-need={isl.need}
                aria-label={`Island ${isl.need} at row ${isl.r + 1}, column ${isl.c + 1}: ${evaluation.loads[i]} of ${isl.need} bridges`}
              >
                {halo ? <circle className="hs-halo" r={R + 0.3} fill={`url(#${uid}-halo-${halo})`} /> : null}
                {isPartner ? <circle className="hs-partner-ring" r={R + 0.09} /> : null}
                {isSel ? <circle className="hs-sel-ring" r={R + 0.11} /> : null}
                <circle className="hs-disc" r={R} />
                <text className="hs-num" textAnchor="middle" dominantBaseline="central" fontSize={0.5}>
                  {isl.need}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export const Board = memo(BoardComponent);
