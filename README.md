# 🌉 HASHI

A neon **Hashi** (Hashiwokakero, also called Bridges) — the island-linking logic puzzle by Nikoli. Join numbered islands with straight bridges, at most two between any pair and never crossing, until every island carries exactly its number and all of them form one connected network. Built with **Next.js 16**, **TypeScript** (strict) and **Tailwind CSS v4**; every board is grown from a seed and proven by the built-in solver to have exactly one solution, and each level is graded by the reasoning it needs, so a board always yields to logic and never to a guess.

## ✨ Features

| | |
| --- | --- |
| 🌉 Four levels | Easy 7×7 (~11 islands), Medium 10×10 (~20), Hard 13×13 (~30) and Expert 15×15 (~40) |
| 🎯 Unique solutions | A seeded generator grows a random bridge network; a propagation + backtracking solver proves one answer |
| 🧠 Graded by logic | Easy falls to counting, Medium needs connectivity reasoning, Hard and Expert need longer chains or a one-step lookahead |
| ✋ Drag, tap or type | Drag island to island or tap two islands; tap a bridge to cycle it; right-click or long-press removes |
| 🚫 Crossing guard | A bridge that would cross is refused with a buzz, a shake and the blocking bridge flashed |
| 💡 Forced hints | Each hint adds a bridge that is genuinely forced right now and says why — or removes a wrong bridge first |
| 🟢 Live feedback | Complete islands glow green, over-full ones turn red, a progress meter, and a note when every number is met but the map is still split |
| ↩️ Undo / redo / restart | Full history; even a restart can be undone |
| ⏱️ Best times | A timer that pauses while the tab is hidden, and per-level records saved locally and shown on the menu |
| 🔊 Procedural audio | Web Audio planks, chimes and buzzes — no asset files |
| 📱 Responsive | One-screen SVG board from 360 px phones to desktop, touch and keyboard, honours reduced motion |

## 🎮 How to play

1. Pick a level and start a puzzle.
2. Every circle is an island; its number says how many bridges must end there.
3. Drag from an island towards a neighbour it can see — or tap an island, then one of its highlighted neighbours — to lay a bridge. Repeat for a double bridge; a third time removes them.
4. Bridges run straight across or down, never cross each other or pass over an island, and a pair holds at most two.
5. Meet every number and join all islands into one network to win.

**Keys:** arrows move between islands · `Shift` + arrow builds that way · `Delete` / `Backspace` clears the selected island · `Esc` deselects · `H` hint · `Ctrl/⌘ + Z` undo · `Ctrl/⌘ + Y` redo. **Pointer:** tap a bridge to cycle it; right-click or long-press a bridge to remove it, or an island to clear all of its bridges.

## 🛠 Tech

- **Next.js 16** (App Router) + **React 19**
- **TypeScript 5**, strict mode
- **Tailwind CSS v4** via `@tailwindcss/postcss`
- **Vitest 3** for the core-logic unit tests
- Pure, framework-free game engine (rng, board geometry, rules, constraint-propagation solver, generator, hint, play reducer) under `src/lib/game`

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm test         # run the unit tests
npm run lint     # lint the project
```
