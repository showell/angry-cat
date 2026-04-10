// CLI tool to author a Lyn Rummy puzzle game on Angry Gopher.
//
// Reads a puzzle from src/lyn_rummy/stubborn_card_puzzles.json,
// runs the layout helper to assign on-screen positions to its
// pre-built stacks, and posts two HTTP requests to Angry Gopher:
//
//   1. POST /gopher/games  {puzzle_name: ...}
//      Creates the game shell with the puzzle label so the lobby
//      knows to show it as a puzzle.
//
//   2. POST /gopher/games/{id}/events  {puzzle_setup: ...}
//      Posts the puzzle setup snapshot as the very first event,
//      mirroring the deck-as-first-event pattern used by regular
//      games. The Angry Cat lobby's puzzle path fetches this and
//      hands it to start_game().
//
// Required env vars:
//   GOPHER_URL      — base URL (e.g. http://localhost:9001)
//   GOPHER_EMAIL    — email for HTTP Basic auth
//   GOPHER_API_KEY  — api key for HTTP Basic auth
//
// CLI args:
//   $1 — puzzle name (e.g. "puzzle_24"). Defaults to "puzzle_24".
//
// Example:
//   GOPHER_URL=http://localhost:9001 \
//   GOPHER_EMAIL=steve@example.com \
//   GOPHER_API_KEY=... \
//   npx vite-node src/lyn_rummy/puzzle_authoring.ts puzzle_24

import * as fs from "fs";
import { Card, OriginDeck, type JsonCard } from "./card";
import type { JsonCardStack } from "./card_stack";
import { layout_stacks_as_simple_rows } from "./puzzle_layout";
import { stack_viability } from "./viability";

type PuzzleFile = {
    name: string;
    stubborn_card: string;
    board: { cards: string[]; type: string; score: number }[];
    hand: string[];
}[];

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO
        : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

// Strip down to the JsonCard shape so the wire payload doesn't
// carry the runtime-only fields a Card class instance might have.
function card_to_json(c: Card): JsonCard {
    return {
        value: c.value,
        suit: c.suit,
        origin_deck: c.origin_deck,
    };
}

function require_env(name: string): string {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return v;
}

const GOPHER_URL = require_env("GOPHER_URL");
const GOPHER_EMAIL = require_env("GOPHER_EMAIL");
const GOPHER_API_KEY = require_env("GOPHER_API_KEY");

function auth_header(): Record<string, string> {
    const creds = `${GOPHER_EMAIL}:${GOPHER_API_KEY}`;
    const encoded = Buffer.from(creds).toString("base64");
    return { Authorization: `Basic ${encoded}` };
}

function gopher_url(path: string): string {
    return new URL(`/gopher/${path}`, GOPHER_URL).toString();
}

const puzzle_name_arg = process.argv[2] || "puzzle_24";

const puzzles_path = "src/lyn_rummy/stubborn_card_puzzles.json";
const all_puzzles: PuzzleFile = JSON.parse(
    fs.readFileSync(puzzles_path, "utf-8"),
);
const puzzle = all_puzzles.find((p) => p.name === puzzle_name_arg);
if (!puzzle) {
    console.error(
        `No puzzle named '${puzzle_name_arg}' in ${puzzles_path}`,
    );
    process.exit(1);
}

console.log(`Authoring puzzle: ${puzzle.name}`);
console.log(`  Board stacks: ${puzzle.board.length}`);
console.log(`  Hand cards:   ${puzzle.hand.length}`);

const raw_stacks: Card[][] = puzzle.board.map((s) => s.cards.map(parse_card));

// Sort stacks by viability so the most useful stacks land at
// the top of the board. For multi-hand puzzles, each stack's
// "usefulness" is the MAX viability across all hand cards: a
// stack that's great for placing any single stubborn card ranks
// highly even if it's mediocre for the others. Single-card
// puzzles fall through this naturally (max of one value = that
// value).
const targets = puzzle.hand.map(parse_card);
function best_viability(stack: Card[]): number {
    let best = -Infinity;
    for (const t of targets) {
        const v = stack_viability(t, stack);
        if (v > best) best = v;
    }
    return best;
}
raw_stacks.sort((a, b) => best_viability(b) - best_viability(a));

const positioned_stacks: JsonCardStack[] =
    layout_stacks_as_simple_rows(raw_stacks, 25);

// Re-serialize each board card with the bare JsonCard shape so
// the wire payload is identical to what the game itself would
// send if a second player were joining a regular game.
const board_stacks: JsonCardStack[] = positioned_stacks.map((s) => ({
    loc: s.loc,
    board_cards: s.board_cards.map((bc) => ({
        card: card_to_json(bc.card as Card),
        state: bc.state,
    })),
}));

const player1_hand: JsonCard[] = puzzle.hand
    .map(parse_card)
    .map(card_to_json);

const puzzle_setup = { board_stacks, player1_hand };

async function main(): Promise<void> {
    // 1. Create the puzzle game shell.
    console.log("POST /gopher/games  (create shell)");
    const create_resp = await fetch(gopher_url("games"), {
        method: "POST",
        headers: { ...auth_header(), "Content-Type": "application/json" },
        body: JSON.stringify({ puzzle_name: puzzle_name_arg }),
    });
    const create_data = await create_resp.json();
    if (create_data.result !== "success") {
        console.error("Create failed:", create_data);
        process.exit(1);
    }
    const game_id = create_data.game_id as number;
    console.log(`  -> game_id = ${game_id}`);

    // 2. Post the puzzle setup as the first event.
    console.log(`POST /gopher/games/${game_id}/events  (puzzle setup)`);
    const event_resp = await fetch(gopher_url(`games/${game_id}/events`), {
        method: "POST",
        headers: { ...auth_header(), "Content-Type": "application/json" },
        body: JSON.stringify({ puzzle_setup }),
    });
    const event_data = await event_resp.json();
    if (event_data.result !== "success") {
        console.error("Event post failed:", event_data);
        process.exit(1);
    }
    console.log(`  -> event_id = ${event_data.event_id ?? "(unknown)"}`);
    console.log("Done.");
}

main();
