// Plugin-driven auto-player that talks to Angry Gopher via HTTP.
//
// Fetches the game state, asks the TrickBag for a play, applies it to
// a cloned board, diffs the old and new boards, and POSTs a PlayRecord
// to /gopher/games/{id}/plays. No cascade, no fumble, no idioms —
// just the three ported tricks.
//
// Required env:
//   GOPHER_URL      base URL (e.g. http://localhost:9000)
//   GOPHER_EMAIL    basic-auth email
//   GOPHER_API_KEY  basic-auth api key
//
// CLI:
//   --game-id N     which game to play in (required)
//   --player N      1 or 2 (default 1)
//   --max-turns N   safety cap (default 50)

import { Card, OriginDeck, Suit, type JsonCard } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type JsonCardStack, type BoardLocation,
} from "../core/card_stack";
import { find_open_loc, type BoardBounds } from "../game/place_stack";
import { TrickBag } from "../tricks/bag";
import { direct_play } from "../tricks/direct_play";
import { rb_swap } from "../tricks/rb_swap";
import { pair_peel } from "../tricks/pair_peel";
import { hand_stacks } from "../tricks/hand_stacks";
import type { PlayRecord, BoardEventPayload } from "../tricks/serialize";

// --- Config ---

const GOPHER_URL = require_env("GOPHER_URL");
const GOPHER_EMAIL = require_env("GOPHER_EMAIL");
const GOPHER_API_KEY = require_env("GOPHER_API_KEY");

const BOARD_BOUNDS: BoardBounds = {
    max_width: 800, max_height: 600, margin: 5, step: 20,
};

const BAG = new TrickBag([hand_stacks, direct_play, rb_swap, pair_peel]);

const { game_id, player, max_turns } = parse_args();

// --- HTTP ---

function require_env(name: string): string {
    const v = process.env[name];
    if (!v) { console.error(`Missing env: ${name}`); process.exit(1); }
    return v;
}

function parse_args(): { game_id: number; player: number; max_turns: number } {
    const args = process.argv.slice(2);
    let game_id = 0, player = 1, max_turns = 50;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--game-id" && args[i + 1]) { game_id = parseInt(args[++i]); continue; }
        if (args[i] === "--player"  && args[i + 1]) { player  = parseInt(args[++i]); continue; }
        if (args[i] === "--max-turns" && args[i + 1]) { max_turns = parseInt(args[++i]); continue; }
    }
    if (!game_id) { console.error("Usage: --game-id N [--player N] [--max-turns N]"); process.exit(1); }
    return { game_id, player, max_turns };
}

function auth_header(): HeadersInit {
    const creds = Buffer.from(`${GOPHER_EMAIL}:${GOPHER_API_KEY}`).toString("base64");
    return { Authorization: `Basic ${creds}`, "Content-Type": "application/json" };
}

async function http_get(path: string): Promise<any> {
    const res = await fetch(`${GOPHER_URL}${path}`, { headers: auth_header() });
    return res.json();
}

async function http_post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${GOPHER_URL}${path}`, {
        method: "POST", headers: auth_header(), body: JSON.stringify(body),
    });
    return res.json();
}

// --- State derivation ---

type GameState = {
    board: JsonCardStack[];
    hands: [JsonCard[], JsonCard[]];
    last_event_id: number;
};

function cards_equal(a: JsonCard, b: JsonCard): boolean {
    return a.value === b.value && a.suit === b.suit && a.origin_deck === b.origin_deck;
}

// Apply an event payload to the tracked state. Handles the initial
// game_setup + subsequent board_event updates. Minimal — the server
// is the source of truth; we just mirror it.
function apply_event(state: GameState, ev: any): void {
    const p = ev.payload;
    if (p.game_setup) {
        state.board = p.game_setup.board.slice();
        state.hands = [p.game_setup.hands[0].slice(), p.game_setup.hands[1].slice()];
    } else if (p.puzzle_setup) {
        // Puzzle games: one human-controlled hand, no second player.
        state.board = p.puzzle_setup.board_stacks.slice();
        state.hands = [p.puzzle_setup.player1_hand.slice(), []];
    } else if (p.json_game_event?.player_action) {
        const be = p.json_game_event.player_action.board_event;
        const released = p.json_game_event.player_action.hand_cards_to_release ?? [];
        // Remove matching stacks.
        for (const rem of be.stacks_to_remove ?? []) {
            const idx = state.board.findIndex(s =>
                s.board_cards.length === rem.board_cards.length &&
                s.board_cards.every((bc, i) => cards_equal(bc.card, rem.board_cards[i].card)));
            if (idx >= 0) state.board.splice(idx, 1);
        }
        for (const add of be.stacks_to_add ?? []) state.board.push(add);
        // Remove released cards from the acting player's hand. The
        // server tags events with addr "1" or "2" == 1-based player.
        const actor = parseInt(p.addr ?? "1") - 1;
        for (const bc of released) {
            const hi = state.hands[actor].findIndex(c => cards_equal(c, bc.card));
            if (hi >= 0) state.hands[actor].splice(hi, 1);
        }
    }
    state.last_event_id = ev.id;
}

async function fetch_state(): Promise<GameState> {
    const state: GameState = { board: [], hands: [[], []], last_event_id: 0 };
    const res = await http_get(`/gopher/games/${game_id}/events`);
    for (const ev of res.events ?? []) apply_event(state, ev);
    return state;
}

// --- Convert wire JSON to typed objects ---

function json_to_card(c: JsonCard): Card {
    return new Card(c.value as any, c.suit as Suit, c.origin_deck as OriginDeck);
}

function hand_from_json(hand_json: JsonCard[]): HandCard[] {
    return hand_json.map(c => new HandCard(json_to_card(c), HandCardState.NORMAL));
}

function board_from_json(board_json: JsonCardStack[]): CardStack[] {
    return board_json.map(s => new CardStack(
        s.board_cards.map(bc => new BoardCard(json_to_card(bc.card), BoardCardState.FIRMLY_ON_BOARD)),
        s.loc,
    ));
}

// --- Diff pre/post boards into a wire BoardEvent ---

function board_diff(pre: CardStack[], post: CardStack[]): BoardEventPayload {
    const removed: JsonCardStack[] = [];
    const used = new Array(post.length).fill(false);
    for (const p of pre) {
        let found = false;
        for (let j = 0; j < post.length; j++) {
            if (!used[j] && p.equals(post[j])) { used[j] = true; found = true; break; }
        }
        if (!found) removed.push(p.toJSON());
    }
    const added: JsonCardStack[] = [];
    for (let j = 0; j < post.length; j++) {
        if (!used[j]) added.push(post[j].toJSON());
    }
    // Assign real locations to new stacks that arrived at DUMMY_LOC.
    for (const a of added) {
        if (a.loc.top === 0 && a.loc.left === 0) {
            a.loc = find_open_loc(board_before_from_removed(pre, removed), a.board_cards.length, BOARD_BOUNDS);
        }
    }
    return { stacks_to_remove: removed, stacks_to_add: added };
}

// Compute the board-before-add layout (pre minus removed) so
// find_open_loc doesn't re-collide with stacks that are about
// to disappear.
function board_before_from_removed(
    pre: CardStack[], removed: JsonCardStack[],
): JsonCardStack[] {
    const out = pre.map(s => s.toJSON());
    for (const rem of removed) {
        const idx = out.findIndex(s =>
            s.board_cards.length === rem.board_cards.length &&
            s.board_cards.every((bc, i) => cards_equal(bc.card, rem.board_cards[i].card)));
        if (idx >= 0) out.splice(idx, 1);
    }
    return out;
}

// --- Play loop ---

async function play_one_move(state: GameState): Promise<"played" | "no-play"> {
    const hand = hand_from_json(state.hands[player - 1]);
    const board = board_from_json(state.board);
    const play = BAG.first_play(hand, board);
    if (!play) return "no-play";

    const mutated = board.map(s => s.clone());
    const played = play.apply(mutated);
    if (played.length === 0) {
        console.log(`[${play.trick.id}] executor returned no cards — drift bug`);
        return "no-play";
    }

    const board_event = board_diff(board, mutated);
    // The replay viewer expects the wrapped wire format:
    //   { json_game_event: { type: 2, player_action: { board_event, hand_cards_to_release } }, addr }
    // Wrap here so the stored payload round-trips through the existing
    // replay code unchanged.
    const wrapped = {
        json_game_event: {
            type: 2,
            player_action: {
                board_event,
                hand_cards_to_release: played.map(hc => ({
                    card: hc.card.toJSON(),
                    state: BoardCardState.FRESHLY_PLAYED,
                })),
            },
        },
        addr: String(player),
    };
    const record: PlayRecord = {
        trick_id: play.trick.id,
        description: play.trick.description,
        hand_cards: played.map(hc => hc.card.toJSON()),
        board_cards: [],
        detail: null,
        player: player - 1,
        board_event: wrapped as unknown as typeof record["board_event"],
    };

    const res = await http_post(`/gopher/games/${game_id}/plays`, record);
    if (res.result !== "success") {
        console.log(`POST /plays rejected: ${res.msg}`);
        return "no-play";
    }
    const event_id = res.event_id;
    console.log(`[${play.trick.id}] ${played.map(hc => card_str(hc.card)).join(" ")}  (event ${event_id})`);
    // Refetch state so subsequent plays see the new board.
    return "played";
}

const SUIT_LETTER: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S", [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function card_str(c: Card): string {
    const deck = c.origin_deck === OriginDeck.DECK_TWO ? "ʹ" : "";
    const val = c.value === 1 ? "A" :
                c.value === 10 ? "T" :
                c.value === 11 ? "J" :
                c.value === 12 ? "Q" :
                c.value === 13 ? "K" : String(c.value);
    return val + SUIT_LETTER[c.suit as Suit] + deck;
}

// --- Main ---

(async () => {
    console.log(`Auto-player: game ${game_id}, player ${player}`);
    let turns = 0;
    while (turns < max_turns) {
        const state = await fetch_state();
        const result = await play_one_move(state);
        if (result === "no-play") {
            console.log("No play available — stopping.");
            break;
        }
        turns++;
    }
    console.log(`Done. ${turns} moves made.`);
})();
