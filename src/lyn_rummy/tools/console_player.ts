// LynRummy console player — talks to the Angry Gopher game host via HTTP.
//
// Tracks board and hand state by polling game events. Can send moves
// as any authenticated player. Uses the hints system to find plays.
//
// Required env vars:
//   GOPHER_URL      — base URL (e.g. http://localhost:9000)
//   GOPHER_EMAIL    — email for HTTP Basic auth
//   GOPHER_API_KEY  — api key for HTTP Basic auth
//
// CLI args:
//   --game-id N     — game to join/spectate
//   --player N      — 1 or 2 (default 2)
//   --play          — auto-play a turn using hints
//
// Example:
//   GOPHER_URL=http://localhost:9000 \
//   GOPHER_EMAIL=apoorva@example.com \
//   GOPHER_API_KEY=... \
//   npx vite-node src/lyn_rummy/tools/console_player.ts -- --game-id 7 --play

import {
    Card, type JsonCard, value_str,
    Suit, OriginDeck,
} from "../core/card";
import {
    CardStack, HandCard, HandCardState, BoardCardState,
    type JsonCardStack, type JsonBoardCard, type BoardLocation,
} from "../core/card_stack";
import { get_hint, HintLevel } from "../hints/hints";
import { find_open_loc, type BoardBounds } from "../game/place_stack";

// --- Env / CLI ---

function require_env(name: string): string {
    const v = process.env[name];
    if (!v) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return v;
}

function parse_args(): { game_id: number; player: number; play: boolean } {
    const args = process.argv.slice(2);
    let game_id = 0;
    let player = 2;
    let play = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--game-id" && args[i + 1]) {
            game_id = parseInt(args[i + 1]);
            i++;
        }
        if (args[i] === "--player" && args[i + 1]) {
            player = parseInt(args[i + 1]);
            i++;
        }
        if (args[i] === "--play") {
            play = true;
        }
    }
    if (!game_id) {
        console.error("Usage: --game-id N [--player N] [--play]");
        process.exit(1);
    }
    return { game_id, player, play };
}

const GOPHER_URL = require_env("GOPHER_URL");
const GOPHER_EMAIL = require_env("GOPHER_EMAIL");
const GOPHER_API_KEY = require_env("GOPHER_API_KEY");

const BOARD_BOUNDS: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
    step: 10,
};

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

function json_cards_equal(a: JsonCard, b: JsonCard): boolean {
    return a.value === b.value && a.suit === b.suit && a.origin_deck === b.origin_deck;
}

function stacks_match(a: JsonCardStack, b: JsonCardStack): boolean {
    if (a.board_cards.length !== b.board_cards.length) return false;
    for (let i = 0; i < a.board_cards.length; i++) {
        if (!json_cards_equal(a.board_cards[i].card as JsonCard, b.board_cards[i].card as JsonCard)) {
            return false;
        }
    }
    return a.loc.top === b.loc.top && a.loc.left === b.loc.left;
}

// --- Type conversion ---
// The hints system works with CardStack/HandCard objects.
// The wire format uses plain JSON. These functions convert.

function json_to_card_stacks(board: JsonCardStack[]): CardStack[] {
    return board.map(s => CardStack.from_json(s));
}

function json_to_hand_cards(hand: JsonCard[]): HandCard[] {
    return hand.map(c => new HandCard(Card.from_json(c), HandCardState.NORMAL));
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
            type: 2,
            player_action: {
                board_event,
                hand_cards_to_release,
            },
        },
        addr,
    };
}

// --- Game state tracker ---

class GameState {
    board: JsonCardStack[];
    hands: [JsonCard[], JsonCard[]];
    remaining_deck: JsonCard[];
    last_event_id: number;
    played_cards: [JsonCard[], JsonCard[]]; // track cards played from each hand

    constructor(setup_event: GopherEvent) {
        const payload = setup_event.payload;

        if (payload.game_setup) {
            const setup: WireGameSetup = payload.game_setup;
            this.board = setup.board;
            this.hands = [setup.hands[0], setup.hands[1]];
            this.remaining_deck = setup.deck;
        } else {
            throw new Error("First event must be game_setup");
        }

        this.last_event_id = setup_event.id;
        this.played_cards = [[], []];
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

        // Track hand cards played.
        const released = ge.player_action.hand_cards_to_release || [];
        for (const hc of released) {
            const card = hc.card as JsonCard;
            // Figure out which hand this card came from.
            for (let p = 0; p < 2; p++) {
                const idx = this.hands[p].findIndex(c => json_cards_equal(c, card));
                if (idx >= 0) {
                    this.played_cards[p].push(card);
                    break;
                }
            }
        }

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
            if (!found) return;
        }

        for (const i of indices_to_remove.sort((a, b) => b - a)) {
            this.board.splice(i, 1);
        }

        for (const add of to_add) {
            this.board.push(add);
        }
    }

    get_remaining_hand(player_index: number): JsonCard[] {
        const initial = this.hands[player_index];
        const played = this.played_cards[player_index];
        const remaining: JsonCard[] = [];
        const used = [...played];
        for (const c of initial) {
            const idx = used.findIndex(u => json_cards_equal(u, c));
            if (idx >= 0) {
                used.splice(idx, 1);
            } else {
                remaining.push(c);
            }
        }
        return remaining;
    }

    show(player_index: number): void {
        show_board(this.board);
        const hand = this.get_remaining_hand(player_index);
        show_hand(`Player ${player_index + 1} hand (${hand.length} cards)`, hand);
        console.log(`Deck: ${this.remaining_deck.length} cards remaining`);
    }

    async send_move(
        game_id: number, addr: string,
        board_event: WireBoardEvent, hand_cards?: JsonCard[],
    ): Promise<any> {
        const payload = make_event_row(addr, board_event, hand_cards);
        const result = await gopher_post(`games/${game_id}/events`, payload);
        const event_id = result.event_id;
        if (event_id) {
            console.log(`  -> event ${event_id}`);
            this.apply_event({ id: event_id, user_id: 0, payload, created_at: 0 });
        } else if (result.result === "error") {
            console.log(`  -> REJECTED: ${result.msg}`);
        }
        return result;
    }

    async send_turn_complete(game_id: number, addr: string): Promise<void> {
        const r1 = await gopher_post(`games/${game_id}/events`,
            { json_game_event: { type: 1 }, addr });
        console.log(`MAYBE_COMPLETE_TURN: event ${r1.event_id}`);

        const r2 = await gopher_post(`games/${game_id}/events`,
            { json_game_event: { type: 0 }, addr });
        console.log(`ADVANCE_TURN: event ${r2.event_id}`);
    }
}

// --- Auto-play using hints ---

async function auto_play_turn(
    state: GameState,
    game_id: number,
    player_index: number,
    addr: string,
): Promise<void> {
    let moves_played = 0;

    while (true) {
        const hand_json = state.get_remaining_hand(player_index);
        if (hand_json.length === 0) break;

        const hand_cards = json_to_hand_cards(hand_json);
        const board_stacks = json_to_card_stacks(state.board);

        const hint = get_hint(hand_cards, board_stacks);

        if (hint.level === HintLevel.NO_MOVES ||
            hint.level === HintLevel.REARRANGE_PLAY) {
            console.log(`Hint: ${hint.level}`);
            break;
        }

        console.log(`Hint: ${hint.level}`);

        switch (hint.level) {
            case HintLevel.HAND_STACKS: {
                const group = hint.hand_stacks[0];
                const cards_json = group.cards.map(hc => hc.card.toJSON());
                const loc = find_open_loc(state.board, group.cards.length, BOARD_BOUNDS);
                const board_cards = cards_json.map(c => make_board_card(c, BoardCardState.FRESHLY_PLAYED));
                const new_stack = make_stack(board_cards, loc);
                const be = make_board_event([], [new_stack]);
                await state.send_move(game_id, addr, be, cards_json);
                moves_played += group.cards.length;
                break;
            }

            case HintLevel.DIRECT_PLAY: {
                const hc = hint.playable_cards[0];
                const card_json = hc.card.toJSON();
                const single = CardStack.from_hand_card(hc, { top: 0, left: 0 });

                // Find which board stack this card merges onto.
                let played = false;
                for (let i = 0; i < board_stacks.length; i++) {
                    const merged = board_stacks[i].left_merge(single)
                        ?? board_stacks[i].right_merge(single);
                    if (merged) {
                        const old_stack = state.board[i];
                        const new_stack_json = merged.toJSON();
                        // Preserve the board stack's location.
                        new_stack_json.loc = old_stack.loc;
                        const be = make_board_event([old_stack], [new_stack_json]);
                        await state.send_move(game_id, addr, be, [card_json]);
                        moves_played++;
                        played = true;
                        break;
                    }
                }
                if (!played) {
                    console.log(`  Could not find merge target for ${card_label(card_json)}`);
                    return;
                }
                break;
            }

            default: {
                // For complex hints (swap, split, peel, etc.) we stop
                // and let the human handle it for now.
                console.log(`  (complex hint — stopping auto-play)`);
                if (moves_played > 0) {
                    await state.send_turn_complete(game_id, addr);
                }
                return;
            }
        }
    }

    console.log(`\nPlayed ${moves_played} cards. Completing turn.`);
    await state.send_turn_complete(game_id, addr);
}

// --- Main ---

async function main(): Promise<void> {
    const { game_id, player, play } = parse_args();
    const player_index = player - 1;
    // addr is the Gopher user_id. We derive it from the email.
    // For now, use a simple lookup since we know our users.
    const addr = GOPHER_EMAIL.includes("apoorva") ? "2"
        : GOPHER_EMAIL.includes("showell") ? "3"
        : "1";

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

    if (play) {
        console.log("\n--- Auto-playing turn ---\n");
        await auto_play_turn(state, game_id, player_index, addr);
        console.log("\n--- After turn ---\n");
        state.show(player_index);
    }
}

main();
