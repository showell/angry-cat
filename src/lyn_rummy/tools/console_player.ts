// LynRummy console player — talks to the Angry Gopher game host via HTTP.
//
// Tracks board and hand state by polling game events. Can send moves
// as any authenticated player. Used for spectating, advising, and
// playing via the command line.
//
// Required env vars:
//   GOPHER_URL      — base URL (e.g. http://localhost:9000)
//   GOPHER_EMAIL    — email for HTTP Basic auth
//   GOPHER_API_KEY  — api key for HTTP Basic auth
//
// CLI args:
//   --game-id N     — game to join/spectate
//   --player N      — 1 or 2 (default 2)
//
// Example:
//   GOPHER_URL=http://localhost:9000 \
//   GOPHER_EMAIL=apoorva@example.com \
//   GOPHER_API_KEY=... \
//   npx vite-node src/lyn_rummy/tools/console_player.ts -- --game-id 7

import {
    Card, type JsonCard, value_str, suit_emoji_str,
    Suit, OriginDeck,
} from "../core/card";
import type {
    JsonCardStack, JsonBoardCard, BoardLocation,
} from "../core/card_stack";

// --- Env / CLI ---

function require_env(name: string): string {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return v;
}

function parse_args(): { game_id: number; player: number } {
    const args = process.argv.slice(2);
    let game_id = 0;
    let player = 2;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--game-id" && args[i + 1]) {
            game_id = parseInt(args[i + 1]);
            i++;
        }
        if (args[i] === "--player" && args[i + 1]) {
            player = parseInt(args[i + 1]);
            i++;
        }
    }
    if (!game_id) {
        console.error("Usage: --game-id N [--player N]");
        process.exit(1);
    }
    return { game_id, player };
}

const GOPHER_URL = require_env("GOPHER_URL");
const GOPHER_EMAIL = require_env("GOPHER_EMAIL");
const GOPHER_API_KEY = require_env("GOPHER_API_KEY");

// --- Card display ---

const SUIT_NAMES: Record<number, string> = { 0: "C", 1: "D", 2: "S", 3: "H" };
const SUIT_ORDER = [3, 2, 1, 0]; // H, S, D, C

function card_label(card: JsonCard): string {
    return value_str(card.value) + SUIT_NAMES[card.suit] + ":" + (card.origin_deck + 1);
}

function show_hand(name: string, hand: JsonCard[]): void {
    console.log(`${name}:`);
    for (const suit of SUIT_ORDER) {
        const suit_cards = hand.filter(c => c.suit === suit);
        suit_cards.sort((a, b) => a.value - b.value);
        if (suit_cards.length > 0) {
            const cards = suit_cards.map(card_label).join(" ");
            console.log(`  ${SUIT_NAMES[suit]}: ${cards}`);
        }
    }
    console.log();
}

function board_fingerprint(board: JsonCardStack[]): string {
    const parts = board.map(s => {
        const cards = s.board_cards.map(bc => card_label(bc.card as JsonCard)).join(" ");
        return `(${s.loc.left},${s.loc.top}) [${cards}]`;
    });
    return parts.join(" | ");
}

function show_board(board: JsonCardStack[]): void {
    if (board.length === 0) {
        console.log("Board: (empty)");
        return;
    }
    console.log(`Board (${board.length} stacks):`);
    for (let i = 0; i < board.length; i++) {
        const s = board[i];
        const cards = s.board_cards.map(bc => card_label(bc.card as JsonCard)).join(" ");
        console.log(`  [${i}] (${s.loc.left}, ${s.loc.top}) ${cards}`);
    }
    console.log();
}

// --- Stack helpers ---

function cards_equal(a: JsonCard, b: JsonCard): boolean {
    return a.value === b.value && a.suit === b.suit && a.origin_deck === b.origin_deck;
}

function stacks_match(a: JsonCardStack, b: JsonCardStack): boolean {
    if (a.board_cards.length !== b.board_cards.length) return false;
    for (let i = 0; i < a.board_cards.length; i++) {
        if (!cards_equal(a.board_cards[i].card as JsonCard, b.board_cards[i].card as JsonCard)) {
            return false;
        }
    }
    return a.loc.top === b.loc.top && a.loc.left === b.loc.left;
}

function find_stack_by_cards(
    board: JsonCardStack[],
    card_tuples: [number, number, number][],
): JsonCardStack | undefined {
    for (const stack of board) {
        if (stack.board_cards.length !== card_tuples.length) continue;
        let match = true;
        for (let i = 0; i < card_tuples.length; i++) {
            const [v, s, d] = card_tuples[i];
            const c = stack.board_cards[i].card as JsonCard;
            if (c.value !== v || c.suit !== s || c.origin_deck !== d) {
                match = false;
                break;
            }
        }
        if (match) return stack;
    }
    return undefined;
}

// --- HTTP client ---

function auth_header(): Record<string, string> {
    const creds = `${GOPHER_EMAIL}:${GOPHER_API_KEY}`;
    const encoded = Buffer.from(creds).toString("base64");
    return { Authorization: `Basic ${encoded}` };
}

function gopher_url(path: string): string {
    return new URL(`/gopher/${path}`, GOPHER_URL).toString();
}

async function gopher_get(path: string): Promise<any> {
    const resp = await fetch(gopher_url(path), { headers: auth_header() });
    return resp.json();
}

async function gopher_post(path: string, body?: any): Promise<any> {
    const init: RequestInit = {
        method: "POST",
        headers: auth_header(),
    };
    if (body !== undefined) {
        init.headers = { ...init.headers, "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const resp = await fetch(gopher_url(path), init);
    return resp.json();
}

// --- Wire types ---

type WireGameSetup = {
    board: JsonCardStack[];
    hands: [JsonCard[], JsonCard[]];
    deck: JsonCard[];
};

type WireBoardEvent = {
    stacks_to_remove: JsonCardStack[];
    stacks_to_add: JsonCardStack[];
};

type WireEventRow = {
    json_game_event: {
        type: number;
        player_action?: {
            board_event: WireBoardEvent;
            hand_cards_to_release: JsonBoardCard[];
        };
    };
    addr: string;
};

type GopherEvent = {
    id: number;
    user_id: number;
    payload: any;
    created_at: number;
};

// --- Move construction ---

function make_board_card(card: JsonCard, state: number = 0): JsonBoardCard {
    return { card, state } as JsonBoardCard;
}

function make_stack(board_cards: JsonBoardCard[], loc: BoardLocation): JsonCardStack {
    return { board_cards, loc };
}

function make_board_event(
    stacks_to_remove: JsonCardStack[],
    stacks_to_add: JsonCardStack[],
): WireBoardEvent {
    return { stacks_to_remove, stacks_to_add };
}

function make_event_row(
    addr: string,
    board_event: WireBoardEvent,
    hand_cards?: JsonCard[],
): WireEventRow {
    const hand_cards_to_release: JsonBoardCard[] = [];
    if (hand_cards) {
        for (const c of hand_cards) {
            hand_cards_to_release.push(make_board_card(c, 0));
        }
    }
    return {
        json_game_event: {
            type: 2, // PLAYER_ACTION
            player_action: {
                board_event,
                hand_cards_to_release,
            },
        },
        addr,
    };
}

// --- Move helpers ---

export function extend_stack_right_event(
    stack: JsonCardStack, hand_card: JsonCard,
): WireBoardEvent {
    const new_board_cards = [...stack.board_cards, make_board_card(hand_card, 1)];
    return make_board_event([stack], [make_stack(new_board_cards, stack.loc)]);
}

export function extend_stack_left_event(
    stack: JsonCardStack, hand_card: JsonCard,
): WireBoardEvent {
    const new_board_cards = [make_board_card(hand_card, 1), ...stack.board_cards];
    return make_board_event([stack], [make_stack(new_board_cards, stack.loc)]);
}

export function place_new_stack_event(
    hand_cards: JsonCard[], loc: BoardLocation,
): WireBoardEvent {
    const board_cards = hand_cards.map(c => make_board_card(c, 1));
    return make_board_event([], [make_stack(board_cards, loc)]);
}

export function split_stack_event(
    stack: JsonCardStack, split_at: number,
    left_loc: BoardLocation, right_loc: BoardLocation,
): WireBoardEvent {
    const left = make_stack(stack.board_cards.slice(0, split_at), left_loc);
    const right = make_stack(stack.board_cards.slice(split_at), right_loc);
    return make_board_event([stack], [left, right]);
}

export function move_stack_event(
    stack: JsonCardStack, new_loc: BoardLocation,
): WireBoardEvent {
    return make_board_event([stack], [make_stack(stack.board_cards, new_loc)]);
}

// --- Game state tracker ---

class GameState {
    board: JsonCardStack[];
    hands: [JsonCard[], JsonCard[]];
    remaining_deck: JsonCard[];
    last_event_id: number;

    constructor(setup_event: GopherEvent) {
        const payload = setup_event.payload;

        if (payload.game_setup) {
            const setup: WireGameSetup = payload.game_setup;
            this.board = setup.board;
            this.hands = [setup.hands[0], setup.hands[1]];
            this.remaining_deck = setup.deck;
        } else if (payload.deck) {
            throw new Error("Legacy deck format not supported in TS player");
        } else {
            throw new Error("First event must be game_setup");
        }

        this.last_event_id = setup_event.id;
        console.log(`[board] ts setup: ${board_fingerprint(this.board)}`);
    }

    apply_event(event: GopherEvent): void {
        this.last_event_id = event.id;

        const payload = event.payload;
        if (!payload.json_game_event) return;

        const ge = payload.json_game_event;
        if (ge.type !== 2 || !ge.player_action) return;

        const be: WireBoardEvent = ge.player_action.board_event;
        const to_remove = be.stacks_to_remove;
        const to_add = be.stacks_to_add;

        // Validate all removes before applying.
        const indices_to_remove: number[] = [];
        for (const rem of to_remove) {
            let found = false;
            for (let i = 0; i < this.board.length; i++) {
                if (!indices_to_remove.includes(i) && stacks_match(this.board[i], rem)) {
                    indices_to_remove.push(i);
                    found = true;
                    break;
                }
            }
            if (!found) return; // invalid move — skip
        }

        // Remove in reverse order.
        for (const i of indices_to_remove.sort((a, b) => b - a)) {
            this.board.splice(i, 1);
        }

        for (const add of to_add) {
            this.board.push(add);
        }
    }

    show(player_index: number): void {
        show_board(this.board);
        show_hand("Player 1 hand", this.hands[0]);
        show_hand("Player 2 hand", this.hands[1]);
        console.log(`Deck: ${this.remaining_deck.length} cards remaining`);
    }

    async send_move(
        game_id: number, addr: string,
        board_event: WireBoardEvent, hand_cards?: JsonCard[],
    ): Promise<any> {
        console.log(`[board] ts before move: ${board_fingerprint(this.board)}`);
        const payload = make_event_row(addr, board_event, hand_cards);
        const result = await gopher_post(`games/${game_id}/events`, payload);
        const event_id = result.event_id;
        if (event_id) {
            console.log(`Sent event ${event_id}`);
            this.apply_event({ id: event_id, user_id: 0, payload, created_at: 0 });
        }
        return result;
    }
}

// --- Main ---

async function main(): Promise<void> {
    const { game_id, player } = parse_args();
    const player_index = player - 1;

    const data = await gopher_get(`games/${game_id}/events?after=0`);
    const events: GopherEvent[] = data.events || [];

    if (events.length === 0) {
        console.log("No events yet — waiting for game to start.");
        return;
    }

    const state = new GameState(events[0]);
    for (let i = 1; i < events.length; i++) {
        state.apply_event(events[i]);
    }

    state.show(player_index);
}

main();
