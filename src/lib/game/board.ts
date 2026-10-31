import type { Board, Dir, Edge, Island } from "./types";

/**
 * Board geometry: which islands see each other, which bridges would cross, and
 * where a pointer lands. Everything here depends only on the island layout, so
 * it is computed once per puzzle and shared by the solver, rules and renderer.
 */

/** Row / column steps for up, right, down, left. */
export const DR: readonly number[] = [-1, 0, 1, 0];
export const DC: readonly number[] = [0, 1, 0, -1];
export const DIRS: readonly Dir[] = [0, 1, 2, 3];

export function opposite(d: Dir): Dir {
  return ((d + 2) % 4) as Dir;
}

/**
 * Build the edge graph for a layout. Islands are re-sorted row-major so the
 * indexing is canonical no matter what order a generator produced them in.
 */
export function buildBoard(rows: number, cols: number, input: readonly Island[]): Board {
  const islands = [...input].sort((p, q) => p.r - q.r || p.c - q.c).map((i) => ({ ...i }));
  const islandAt = new Array<number>(rows * cols).fill(-1);
  islands.forEach((isl, i) => {
    if (isl.r < 0 || isl.r >= rows || isl.c < 0 || isl.c >= cols) {
      throw new Error(`island ${i} lies outside the ${rows}×${cols} grid`);
    }
    const cell = isl.r * cols + isl.c;
    if (islandAt[cell] !== -1) throw new Error(`two islands share cell ${isl.r},${isl.c}`);
    islandAt[cell] = i;
  });

  const edges: Edge[] = [];
  const links = islands.map(() => [-1, -1, -1, -1]);

  // Only scan right and down: each visible pair is then found exactly once,
  // from its left or top island.
  islands.forEach((isl, a) => {
    for (const d of [1, 2] as const) {
      const cells: number[] = [];
      let r = isl.r + DR[d];
      let c = isl.c + DC[d];
      while (r >= 0 && r < rows && c >= 0 && c < cols) {
        const cell = r * cols + c;
        const b = islandAt[cell];
        if (b !== -1) {
          const id = edges.length;
          edges.push({ a, b, horizontal: d === 1, cells });
          links[a][d] = id;
          links[b][opposite(d)] = id;
          break;
        }
        cells.push(cell);
        r += DR[d];
        c += DC[d];
      }
    }
  });

  const incident = links.map((row) => row.filter((e) => e !== -1));

  // Consecutive islands in a row split it into disjoint spans, so each cell is
  // covered by at most one horizontal and one vertical edge. Two edges cross
  // exactly when they share an interior cell.
  const hAt = new Array<number>(rows * cols).fill(-1);
  const vAt = new Array<number>(rows * cols).fill(-1);
  edges.forEach((e, id) => {
    for (const cell of e.cells) (e.horizontal ? hAt : vAt)[cell] = id;
  });
  const crossings = edges.map(() => [] as number[]);
  for (let cell = 0; cell < rows * cols; cell++) {
    const h = hAt[cell];
    const v = vAt[cell];
    if (h !== -1 && v !== -1) {
      crossings[h].push(v);
      crossings[v].push(h);
    }
  }

  return { rows, cols, islands, edges, links, incident, crossings, islandAt };
}

/**
 * Parse a text layout: a digit is an island with that number, anything else is
 * water. Handy for hand-made boards in tests and documentation.
 */
export function parseBoard(lines: readonly string[]): Board {
  const rows = lines.length;
  const cols = Math.max(0, ...lines.map((l) => l.length));
  const islands: Island[] = [];
  lines.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch >= "1" && ch <= "8") islands.push({ r, c, need: Number(ch) });
    }
  });
  return buildBoard(rows, cols, islands);
}

/** The island at the other end of edge `e` from island `i`. */
export function otherEnd(board: Board, e: number, i: number): number {
  const edge = board.edges[e];
  return edge.a === i ? edge.b : edge.a;
}

/** The edge joining islands `i` and `j`, or -1 if they cannot see each other. */
export function edgeBetween(board: Board, i: number, j: number): number {
  for (const e of board.incident[i]) {
    if (otherEnd(board, e, i) === j) return e;
  }
  return -1;
}

/**
 * The island a keyboard cursor should jump to from `from` in direction `d`:
 * the visible neighbour when there is one, otherwise the closest island in that
 * half of the board (sideways distance weighs double, so the jump stays close
 * to the line of travel). Returns -1 when nothing lies that way.
 */
export function stepIsland(board: Board, from: number, d: Dir): number {
  const link = board.links[from][d];
  if (link !== -1) return otherEnd(board, link, from);
  const o = board.islands[from];
  let best = -1;
  let bestScore = Infinity;
  board.islands.forEach((isl, i) => {
    if (i === from) return;
    const along = (isl.r - o.r) * DR[d] + (isl.c - o.c) * DC[d];
    if (along <= 0) return;
    const across = Math.abs(DR[d] === 0 ? isl.r - o.r : isl.c - o.c);
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Board-unit centre of an island (cells are 1×1, origin top-left). */
export function islandCenter(board: Board, i: number): { x: number; y: number } {
  const isl = board.islands[i];
  return { x: isl.c + 0.5, y: isl.r + 0.5 };
}

export type Hit = { kind: "island"; id: number } | { kind: "edge"; id: number } | null;

/**
 * What a pointer at board coordinates `(x, y)` is touching. Islands win over
 * bridges and are generous (the whole cell), so a tap never misses on a phone;
 * a bridge counts when the pointer is within `reach` of its centre line and
 * `hasBridge(e)` says one is drawn there.
 */
export function hitTest(
  board: Board,
  x: number,
  y: number,
  hasBridge: (e: number) => boolean,
  reach = 0.34
): Hit {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
    const at = board.islandAt[r * board.cols + c];
    if (at !== -1) return { kind: "island", id: at };
  }
  let best = -1;
  let bestDist = reach;
  for (let id = 0; id < board.edges.length; id++) {
    if (!hasBridge(id)) continue;
    const edge = board.edges[id];
    const a = islandCenter(board, edge.a);
    const b = islandCenter(board, edge.b);
    const inSpan = edge.horizontal ? x >= a.x && x <= b.x : y >= a.y && y <= b.y;
    if (!inSpan) continue;
    const dist = edge.horizontal ? Math.abs(y - a.y) : Math.abs(x - a.x);
    if (dist <= bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best === -1 ? null : { kind: "edge", id: best };
}
