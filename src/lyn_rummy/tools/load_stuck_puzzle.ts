// Load a stuck puzzle saved by the console player and post it
// to Angry Gopher as a playable puzzle game.
//
// Usage:
//   GOPHER_URL=http://localhost:9000 \
//   GOPHER_EMAIL=showell30@yahoo.com \
//   GOPHER_API_KEY=58dd546fcd388a2c673206126ad92e07 \
//   npx vite-node src/lyn_rummy/tools/load_stuck_puzzle.ts -- PATH

import * as fs from "fs";
import { Card, OriginDeck, type JsonCard } from "../core/card";
import { BoardCardState, type JsonCardStack, CARD_WIDTH } from "../core/card_stack";

function require_env(name: string): string {
    const v = process.env[name];
    if (!v) { console.error(`Missing: ${name}`); process.exit(1); }
    return v;
}

const GOPHER_URL = require_env("GOPHER_URL");
const GOPHER_EMAIL = require_env("GOPHER_EMAIL");
const GOPHER_API_KEY = require_env("GOPHER_API_KEY");

function auth_header(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${GOPHER_EMAIL}:${GOPHER_API_KEY}`).toString("base64")}` };
}

// Parse "TS:2" → JsonCard
function parse_label(label: string): JsonCard {
    const [cardPart, deckPart] = label.split(":");
    const deck = deckPart === "2" ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    const c = Card.from(cardPart, deck);
    return { value: c.value, suit: c.suit, origin_deck: c.origin_deck };
}

// Layout stacks in rows.
const CARD_PITCH = CARD_WIDTH + 6;
const GAP = Math.round(2.5 * CARD_PITCH);
const ROW_H = 56;

function stack_width(n: number): number {
    return CARD_WIDTH + (n - 1) * CARD_PITCH;
}

function layout(stacks: JsonCard[][]): JsonCardStack[] {
    const result: JsonCardStack[] = [];
    let row = 0, left = 20;

    for (const cards of stacks) {
        const w = stack_width(cards.length);
        if (left + w > 780 && left > 20) {
            row++;
            left = 20;
        }
        result.push({
            board_cards: cards.map(c => ({ card: c, state: BoardCardState.FIRMLY_ON_BOARD })),
            loc: { top: 20 + row * ROW_H, left },
        });
        left += w + GAP;
    }
    return result;
}

// Parse args: PATH [--name NAME]
let path = "";
let puzzle_name = "";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) {
        puzzle_name = args[i + 1];
        i++;
    } else if (!args[i].startsWith("-")) {
        path = args[i];
    }
}
if (!path) { console.error("Usage: load_stuck_puzzle.ts PATH [--name NAME]"); process.exit(1); }

const puzzle = JSON.parse(fs.readFileSync(path, "utf-8"));
console.log(`Loading puzzle from ${path}`);
console.log(`  Hand: ${puzzle.hand.join(" ")}`);
console.log(`  Board: ${puzzle.board.length} stacks`);

const hand_cards = puzzle.hand.map(parse_label);
const board_cards = puzzle.board.map((s: any) => s.cards.map(parse_label));
const board_stacks = layout(board_cards);

const puzzle_setup = { board_stacks, player1_hand: hand_cards };

async function main() {
    // Create puzzle game.
    const name = puzzle_name || `puzzle_${new Date().toISOString().slice(5, 16).replace(/[T:]/g, "_")}`;
    const resp = await fetch(`${GOPHER_URL}/gopher/games`, {
        method: "POST",
        headers: { ...auth_header(), "Content-Type": "application/json" },
        body: JSON.stringify({ puzzle_name: name }),
    });
    const data = await resp.json();
    const game_id = data.game_id;
    console.log(`Created game ${game_id} (${name})`);

    // Post puzzle setup.
    const resp2 = await fetch(`${GOPHER_URL}/gopher/games/${game_id}/events`, {
        method: "POST",
        headers: { ...auth_header(), "Content-Type": "application/json" },
        body: JSON.stringify({ puzzle_setup }),
    });
    const data2 = await resp2.json();
    console.log(`Posted setup: event ${data2.event_id}`);
    console.log(`\nPlay at: ${GOPHER_URL}/gopher/game-lobby?id=${game_id}`);
    console.log(`Or in Angry Cat: look for "${name}" in the lobby.`);
}

main();
