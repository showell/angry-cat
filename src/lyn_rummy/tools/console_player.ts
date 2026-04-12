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

import * as fs from "fs";
import {
    Card, type JsonCard, value_str,
    Suit, OriginDeck,
} from "../core/card";
import {
    BoardCard as BoardCardClass,
    CardStack, HandCard, HandCardState, BoardCardState,
    type JsonCardStack, type JsonBoardCard, type BoardLocation,
} from "../core/card_stack";
import { CardStackType, get_stack_type, predecessor, successor } from "../core/stack_type";
import { get_hint, HintLevel, can_extract, type LooseCardPlay } from "../hints/hints";
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

// --- Board diff ---
//
// Run a mutation function on a cloned board, then diff the original
// and mutated boards to produce wire events.

function board_diff(
    original: CardStack[],
    mutated: CardStack[],
): { stacks_to_remove: JsonCardStack[]; stacks_to_add: JsonCardStack[] } {
    // Find stacks in original that are not in mutated (removed).
    const stacks_to_remove: JsonCardStack[] = [];
    const mutated_used = new Array(mutated.length).fill(false);

    for (const orig of original) {
        let found = false;
        for (let j = 0; j < mutated.length; j++) {
            if (!mutated_used[j] && orig.equals(mutated[j])) {
                mutated_used[j] = true;
                found = true;
                break;
            }
        }
        if (!found) {
            stacks_to_remove.push(orig.toJSON());
        }
    }

    // Remaining mutated stacks are additions.
    const stacks_to_add: JsonCardStack[] = [];
    for (let j = 0; j < mutated.length; j++) {
        if (!mutated_used[j]) {
            stacks_to_add.push(mutated[j].toJSON());
        }
    }

    return { stacks_to_remove, stacks_to_add };
}

// --- Complex hint execution ---
//
// These mutate a cloned board in place (like play_game.ts does),
// then we diff to get wire events.

const DUMMY_LOC = { top: 0, left: 0 };

function extract_card(board: CardStack[], stack_idx: number, card_idx: number): BoardCardClass | undefined {
    const stack = board[stack_idx];
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.stack_type;

    if (card_idx === 0 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(1), stack.loc);
        return cards[0];
    }
    if (card_idx === size - 1 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(0, -1), stack.loc);
        return cards[size - 1];
    }
    if (st === CardStackType.SET && size >= 4) {
        const remaining = cards.filter((_, i) => i !== card_idx);
        board[stack_idx] = new CardStack(remaining, stack.loc);
        return cards[card_idx];
    }
    return undefined;
}

// Execute a complex hint by mutating a cloned board.
// Returns the hand cards that were played, or [] if it failed.
function execute_complex_hint(
    hint: ReturnType<typeof get_hint>,
    board: CardStack[],
): HandCard[] {
    switch (hint.level) {
        case HintLevel.SWAP: {
            // Swap: replace a same-color, same-value card in an rb run,
            // kick the replaced card to a set or pure run.
            const hc = hint.playable_cards[0];
            for (let si = 0; si < board.length; si++) {
                const stack = board[si];
                if (stack.stack_type !== CardStackType.RED_BLACK_RUN) continue;
                const cards = stack.get_cards();

                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.value !== hc.card.value) continue;
                    if (bc.color !== hc.card.color) continue;
                    if (bc.suit === hc.card.suit) continue;

                    // Verify the hand card fits in this position.
                    const swapped = cards.map((c, i) => i === ci ? hc.card : c);
                    if (get_stack_type(swapped) !== CardStackType.RED_BLACK_RUN) continue;

                    // Find a home for the kicked card (set or pure run).
                    const kicked = bc;
                    let kicked_dest = -1;
                    for (let j = 0; j < board.length; j++) {
                        if (j === si) continue;
                        const target = board[j];
                        const tst = target.stack_type;
                        if (tst === CardStackType.SET && target.board_cards.length < 4) {
                            const suits = target.board_cards.map(b => b.card.suit);
                            if (target.board_cards[0].card.value === kicked.value &&
                                !suits.includes(kicked.suit)) {
                                kicked_dest = j;
                                break;
                            }
                        }
                        if (tst === CardStackType.PURE_RUN) {
                            const single = CardStack.from_hand_card(
                                { card: kicked, state: 0 } as HandCard,
                                DUMMY_LOC,
                            );
                            if (target.left_merge(single) || target.right_merge(single)) {
                                kicked_dest = j;
                                break;
                            }
                        }
                    }
                    if (kicked_dest < 0) continue;

                    // Execute: replace in the run.
                    const new_run_cards = stack.board_cards.map((b, i) =>
                        i === ci ? new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED) : b);
                    board[si] = new CardStack(new_run_cards, stack.loc);

                    // Kick the old card to its destination.
                    const dest = board[kicked_dest];
                    if (dest.stack_type === CardStackType.SET) {
                        const new_set = new CardStack(
                            [...dest.board_cards, new BoardCardClass(kicked, BoardCardState.FIRMLY_ON_BOARD)],
                            dest.loc);
                        board[kicked_dest] = new_set;
                    } else {
                        const single = CardStack.from_hand_card({ card: kicked, state: 0 } as HandCard, DUMMY_LOC);
                        const merged = dest.left_merge(single) ?? dest.right_merge(single);
                        if (merged) board[kicked_dest] = merged;
                    }

                    return [hc];
                }
            }
            return [];
        }

        case HintLevel.SPLIT_FOR_SET: {
            const hc = hint.playable_cards[0];
            const v = hc.card.value;
            const hc_suit = hc.card.suit;

            const candidates: { si: number; ci: number; suit: number }[] = [];
            for (let si = 0; si < board.length; si++) {
                const cards = board[si].get_cards();
                for (let ci = 0; ci < cards.length; ci++) {
                    if (cards[ci].value === v && cards[ci].suit !== hc_suit &&
                        can_extract(board[si], ci)) {
                        candidates.push({ si, ci, suit: cards[ci].suit });
                    }
                }
            }

            const suits_used = new Set([hc_suit]);
            const to_extract: { si: number; ci: number }[] = [];
            for (const c of candidates) {
                if (!suits_used.has(c.suit)) {
                    suits_used.add(c.suit);
                    to_extract.push({ si: c.si, ci: c.ci });
                    if (to_extract.length >= 2) break;
                }
            }
            if (to_extract.length < 2) return [];

            to_extract.sort((a, b) => b.si - a.si || b.ci - a.ci);
            const extracted: BoardCardClass[] = [];
            for (const { si, ci } of to_extract) {
                const bc = extract_card(board, si, ci);
                if (bc) extracted.push(bc);
            }
            if (extracted.length < 2) return [];

            const set_cards = [
                new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED),
                ...extracted,
            ];
            board.push(new CardStack(set_cards, DUMMY_LOC));
            return [hc];
        }

        case HintLevel.LOOSE_CARD_PLAY: {
            const play = (hint as any).plays[0] as LooseCardPlay;
            const hc = play.playable_cards[0];
            board.length = 0;
            for (const s of play.resulting_board) board.push(s);
            const single = CardStack.from_hand_card(hc, DUMMY_LOC);
            for (let i = 0; i < board.length; i++) {
                const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
                if (merged) { board[i] = merged; return [hc]; }
            }
            return [];
        }

        case HintLevel.SPLIT_AND_INJECT: {
            const hc = hint.playable_cards[0];
            for (let si = 0; si < board.length; si++) {
                const stack = board[si];
                const st = stack.stack_type;
                if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;
                const cards = stack.board_cards;
                const size = cards.length;

                for (let split = 2; split <= size - 2; split++) {
                    const left = new CardStack(cards.slice(0, split), stack.loc);
                    const right = new CardStack(cards.slice(split), DUMMY_LOC);
                    if (left.problematic() || right.problematic()) continue;

                    const single = CardStack.from_hand_card(hc, DUMMY_LOC);
                    if (!left.incomplete()) {
                        const extended = right.left_merge(single);
                        if (extended && !extended.incomplete() && !extended.problematic()) {
                            board[si] = left;
                            board.push(extended);
                            return [hc];
                        }
                    }
                    if (!right.incomplete()) {
                        const extended = left.right_merge(single);
                        if (extended && !extended.incomplete() && !extended.problematic()) {
                            board[si] = extended;
                            board.push(right);
                            return [hc];
                        }
                    }
                }
            }
            return [];
        }

        case HintLevel.PEEL_FOR_RUN: {
            const hc = hint.playable_cards[0];
            const v = hc.card.value;
            type Candidate = { si: number; ci: number; card: Card };
            const neighbors: Candidate[] = [];

            for (let si = 0; si < board.length; si++) {
                const cards = board[si].get_cards();
                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.equals(hc.card)) continue;
                    if (bc.value === predecessor(v) || bc.value === successor(v)) {
                        if (can_extract(board[si], ci)) {
                            neighbors.push({ si, ci, card: bc });
                        }
                    }
                }
            }

            for (let i = 0; i < neighbors.length; i++) {
                for (let j = i + 1; j < neighbors.length; j++) {
                    if (neighbors[i].si === neighbors[j].si) continue;
                    const triple = [neighbors[i].card, hc.card, neighbors[j].card]
                        .sort((a, b) => a.value - b.value);
                    const st = get_stack_type(triple);
                    if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;

                    const extracts = [neighbors[i], neighbors[j]].sort((a, b) => b.si - a.si || b.ci - a.ci);
                    const extracted: BoardCardClass[] = [];
                    for (const ex of extracts) {
                        const bc = extract_card(board, ex.si, ex.ci);
                        if (bc) extracted.push(bc);
                    }
                    if (extracted.length < 2) continue;

                    const run_cards = [
                        new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED),
                        ...extracted,
                    ].sort((a, b) => a.card.value - b.card.value);
                    const new_stack = new CardStack(run_cards, DUMMY_LOC);
                    if (!new_stack.incomplete() && !new_stack.problematic()) {
                        board.push(new_stack);
                        return [hc];
                    }
                }
            }
            return [];
        }

        case HintLevel.PAIR_PEEL:
        case HintLevel.PAIR_DISSOLVE:
        case HintLevel.SIX_TO_FOUR: {
            const playable = hint.playable_cards;
            for (let i = 0; i < playable.length; i++) {
                for (let j = i + 1; j < playable.length; j++) {
                    const a = playable[i].card;
                    const b = playable[j].card;
                    if (a.equals(b)) continue;

                    // Set pair: same value different suit.
                    if (a.value === b.value && a.suit !== b.suit) {
                        const needed_suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]
                            .filter(s => s !== a.suit && s !== b.suit);
                        for (let si = 0; si < board.length; si++) {
                            const cards = board[si].get_cards();
                            for (let ci = 0; ci < cards.length; ci++) {
                                const bc = cards[ci];
                                if (bc.value === a.value && needed_suits.includes(bc.suit) &&
                                    can_extract(board[si], ci)) {
                                    const extracted = extract_card(board, si, ci);
                                    if (extracted) {
                                        board.push(new CardStack([
                                            new BoardCardClass(a, BoardCardState.FRESHLY_PLAYED),
                                            new BoardCardClass(b, BoardCardState.FRESHLY_PLAYED),
                                            extracted,
                                        ], DUMMY_LOC));
                                        return [playable[i], playable[j]];
                                    }
                                }
                            }
                        }
                    }

                    // Run pair: same suit, consecutive.
                    if (a.suit === b.suit) {
                        const lo = a.value < b.value ? a : b;
                        const hi = a.value < b.value ? b : a;
                        if (hi.value !== successor(lo.value)) continue;

                        const needed = [
                            { value: predecessor(lo.value), suit: lo.suit },
                            { value: successor(hi.value), suit: hi.suit },
                        ];
                        for (const need of needed) {
                            for (let si = 0; si < board.length; si++) {
                                const cards = board[si].get_cards();
                                for (let ci = 0; ci < cards.length; ci++) {
                                    const bc = cards[ci];
                                    if (bc.value === need.value && bc.suit === need.suit &&
                                        can_extract(board[si], ci)) {
                                        const extracted = extract_card(board, si, ci);
                                        if (extracted) {
                                            const run = [
                                                new BoardCardClass(a, BoardCardState.FRESHLY_PLAYED),
                                                new BoardCardClass(b, BoardCardState.FRESHLY_PLAYED),
                                                extracted,
                                            ].sort((x, y) => x.card.value - y.card.value);
                                            board.push(new CardStack(run, DUMMY_LOC));
                                            return [playable[i], playable[j]];
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return [];
        }

        default:
            return [];
    }
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
    current_player: number; // 0 or 1
    cards_played_this_turn: number;
    last_clean_board: JsonCardStack[]; // snapshot from last turn boundary

    constructor(setup_event: GopherEvent) {
        const payload = setup_event.payload;

        if (payload.game_setup) {
            const setup: WireGameSetup = payload.game_setup;
            this.board = setup.board;
            this.hands = [[...setup.hands[0]], [...setup.hands[1]]];
            this.remaining_deck = [...setup.deck];
        } else {
            throw new Error("First event must be game_setup");
        }

        this.last_event_id = setup_event.id;
        this.played_cards = [[], []];
        this.current_player = 0;
        this.cards_played_this_turn = 0;
        this.last_clean_board = JSON.parse(JSON.stringify(this.board));
        console.log(`[board] ts setup: ${board_fingerprint(this.board)}`);
    }

    quiet: boolean = true; // suppress logs during initial replay

    draw_cards(player: number, count: number): void {
        const drawn = this.remaining_deck.splice(0, count);
        this.hands[player].push(...drawn);
        if (drawn.length > 0 && !this.quiet) {
            console.log(`  Player ${player + 1} draws ${drawn.length} cards (deck: ${this.remaining_deck.length})`);
        }
    }

    apply_event(event: GopherEvent): void {
        this.last_event_id = event.id;

        const payload = event.payload;
        if (!payload.json_game_event) return;

        const ge = payload.json_game_event;

        // Turn completion: determine if cards need to be drawn.
        if (ge.type === 1) { // MAYBE_COMPLETE_TURN
            const p = this.current_player;
            if (this.cards_played_this_turn === 0) {
                // Stuck — draw 3.
                this.draw_cards(p, 3);
            } else if (this.get_remaining_hand(p).length === 0) {
                // Emptied hand — draw 5.
                this.draw_cards(p, 5);
            }
            return;
        }

        if (ge.type === 0) { // ADVANCE_TURN
            this.current_player = (this.current_player + 1) % 2;
            this.cards_played_this_turn = 0;
            // Only snapshot if the board is actually clean (all stacks valid).
            const is_clean = this.board.every(s =>
                json_to_card_stacks([s])[0].stack_type !== CardStackType.INCOMPLETE &&
                json_to_card_stacks([s])[0].stack_type !== CardStackType.BOGUS &&
                json_to_card_stacks([s])[0].stack_type !== CardStackType.DUP
            );
            if (is_clean) {
                this.last_clean_board = JSON.parse(JSON.stringify(this.board));
            }
            return;
        }

        if (ge.type !== 2 || !ge.player_action) return;

        const be: WireBoardEvent = ge.player_action.board_event;
        const to_remove = be.stacks_to_remove;
        const to_add = be.stacks_to_add;

        // Track hand cards played and remove from hand.
        const released = ge.player_action.hand_cards_to_release || [];
        for (const hc of released) {
            const card = hc.card as JsonCard;
            const p = this.current_player;
            const idx = this.hands[p].findIndex(c => json_cards_equal(c, card));
            if (idx >= 0) {
                this.hands[p].splice(idx, 1);
                this.cards_played_this_turn++;
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
        return this.hands[player_index];
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
    ): Promise<boolean> {
        const payload = make_event_row(addr, board_event, hand_cards);
        const result = await gopher_post(`games/${game_id}/events`, payload);
        const event_id = result.event_id;
        if (event_id) {
            console.log(`  -> event ${event_id}`);
            this.apply_event({ id: event_id, user_id: 0, payload, created_at: 0 });
            return true;
        }
        console.log(`  -> REJECTED: ${result.msg}`);
        return false;
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

// --- Board geometry helpers ---
//
// Human-like placement: nudge neighbors to make room, place new
// stacks near existing ones, only do a full tidy when needed.

const CARD_PITCH_PX = 27 + 6; // CARD_WIDTH + gap between cards in a stack
const MARGIN = 10; // breathing room between stacks
const CARD_HEIGHT = 40;
const MAX_BOARD_WIDTH = 800;
const MAX_BOARD_HEIGHT = 600;

function stack_pixel_width(card_count: number): number {
    if (card_count <= 0) return 0;
    return 27 + (card_count - 1) * CARD_PITCH_PX;
}

type Rect = { left: number; top: number; right: number; bottom: number };

function stack_rect(s: JsonCardStack): Rect {
    return {
        left: s.loc.left,
        top: s.loc.top,
        right: s.loc.left + stack_pixel_width(s.board_cards.length),
        bottom: s.loc.top + CARD_HEIGHT,
    };
}

function rects_overlap(a: Rect, b: Rect): boolean {
    return a.left < b.right + MARGIN && a.right + MARGIN > b.left &&
           a.top < b.bottom + MARGIN && a.bottom + MARGIN > b.top;
}

// Find a spot near an existing stack — try below it first, then
// to its right, then fall back to find_open_loc.
function find_nearby_loc(
    board: JsonCardStack[],
    card_count: number,
    near: JsonCardStack,
): BoardLocation {
    const w = stack_pixel_width(card_count);
    const nearRect = stack_rect(near);

    // Try below the target stack.
    const candidates: BoardLocation[] = [
        { top: nearRect.bottom + MARGIN, left: near.loc.left },
        { top: near.loc.top, left: nearRect.right + MARGIN + 20 },
        { top: nearRect.bottom + MARGIN, left: 20 },
    ];

    for (const loc of candidates) {
        if (loc.left + w > MAX_BOARD_WIDTH || loc.top + CARD_HEIGHT > MAX_BOARD_HEIGHT) continue;
        if (loc.left < 0 || loc.top < 0) continue;

        const candidate: Rect = {
            left: loc.left, top: loc.top,
            right: loc.left + w, bottom: loc.top + CARD_HEIGHT,
        };
        let collides = false;
        for (const s of board) {
            if (rects_overlap(candidate, stack_rect(s))) {
                collides = true;
                break;
            }
        }
        if (!collides) return loc;
    }

    // Fall back to grid scan.
    return find_open_loc(board, card_count, BOARD_BOUNDS);
}

// Nudge: after extending a stack, check if it now overlaps any
// neighbor. If so, push the neighbor rightward just enough.
// Returns the list of stacks that moved (for sending as events).
function compute_nudges(board: JsonCardStack[]): { from: JsonCardStack; to: JsonCardStack }[] {
    const nudges: { from: JsonCardStack; to: JsonCardStack }[] = [];
    const moved = new Set<number>();

    for (let i = 0; i < board.length; i++) {
        const ri = stack_rect(board[i]);
        for (let j = 0; j < board.length; j++) {
            if (i === j || moved.has(j)) continue;
            const rj = stack_rect(board[j]);
            if (rects_overlap(ri, rj)) {
                // Nudge j to the right of i.
                const new_left = ri.right + MARGIN;
                if (new_left + stack_pixel_width(board[j].board_cards.length) <= MAX_BOARD_WIDTH) {
                    const nudged = { ...board[j], loc: { top: board[j].loc.top, left: new_left } };
                    nudges.push({ from: board[j], to: nudged });
                    moved.add(j);
                }
            }
        }
    }
    return nudges;
}

// Full tidy: re-layout in neat rows. Used only at end of turn.
function compute_tidy_locations(board: JsonCardStack[]): BoardLocation[] {
    const locs: BoardLocation[] = [];
    const ROW_SPACING = 56;
    const GAP = Math.round(2.5 * CARD_PITCH_PX);
    let row = 0, cards_in_row = 0, left = 20;

    for (const s of board) {
        const n = s.board_cards.length;
        if (cards_in_row > 0 && left + stack_pixel_width(n) > MAX_BOARD_WIDTH - 20) {
            row++;
            cards_in_row = 0;
            left = 20;
        }
        locs.push({ top: 20 + row * ROW_SPACING, left });
        left += stack_pixel_width(n) + GAP;
        cards_in_row += n;
    }
    return locs;
}

async function tidy_board(
    state: GameState, game_id: number, addr: string,
): Promise<void> {
    const tidy_locs = compute_tidy_locations(state.board);

    let needs_tidy = false;
    for (let i = 0; i < state.board.length; i++) {
        const s = state.board[i];
        const loc = tidy_locs[i];
        if (s.loc.top !== loc.top || s.loc.left !== loc.left) {
            needs_tidy = true;
            break;
        }
    }
    if (!needs_tidy) return;

    const old_stacks = [...state.board];
    const new_stacks = old_stacks.map((s, i) => ({
        ...s,
        loc: tidy_locs[i],
    }));

    const be = make_board_event(old_stacks, new_stacks);
    await state.send_move(game_id, addr, be);
    console.log(`Tidied ${state.board.length} stacks.`);
}

async function nudge_if_needed(
    state: GameState, game_id: number, addr: string,
): Promise<void> {
    const nudges = compute_nudges(state.board);
    if (nudges.length === 0) return;

    const removes = nudges.map(n => n.from);
    const adds = nudges.map(n => n.to);
    const be = make_board_event(removes, adds);
    await state.send_move(game_id, addr, be);
    console.log(`Nudged ${nudges.length} stack(s).`);
}

// --- Auto-play using hints ---

// --- Stats feedback loop ---
//
// Accumulate stats across games so we can see what's working.
// Written to src/lyn_rummy/stats.json and appended to.

type TurnStats = {
    game_id: number;
    player: number;
    cards_played: number;
    hint_types: Record<string, number>;
    idioms_fired: Record<string, number>;
    fumbles: number;
    got_stuck: boolean;
    timestamp: string;
};

let current_turn_stats: TurnStats | null = null;

function start_turn_stats(game_id: number, player: number): void {
    current_turn_stats = {
        game_id, player: player + 1,
        cards_played: 0,
        hint_types: {},
        idioms_fired: {},
        fumbles: 0,
        got_stuck: false,
        timestamp: new Date().toISOString(),
    };
}

function record_hint(hint_level: string): void {
    if (!current_turn_stats) return;
    current_turn_stats.hint_types[hint_level] = (current_turn_stats.hint_types[hint_level] || 0) + 1;
}

function record_idiom(name: string): void {
    if (!current_turn_stats) return;
    current_turn_stats.idioms_fired[name] = (current_turn_stats.idioms_fired[name] || 0) + 1;
}

function record_fumble(): void {
    if (!current_turn_stats) return;
    current_turn_stats.fumbles += 1;
}

function record_cards_played(n: number): void {
    if (!current_turn_stats) return;
    current_turn_stats.cards_played = n;
}

function record_got_stuck(): void {
    if (!current_turn_stats) return;
    current_turn_stats.got_stuck = true;
}

function save_turn_stats(): void {
    if (!current_turn_stats) return;
    const path = "src/lyn_rummy/stats.jsonl";
    fs.appendFileSync(path, JSON.stringify(current_turn_stats) + "\n");
    current_turn_stats = null;
}

// --- Puzzle saving ---
//
// When stuck, save the board + hand as a puzzle file for human analysis.

function save_puzzle(board: JsonCardStack[], hand: JsonCard[], player_index: number): void {
    const SUIT_L: Record<number, string> = { 0: "C", 1: "D", 2: "S", 3: "H" };
    const VAL_L: Record<number, string> = {
        1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
        8: "8", 9: "9", 10: "T", 11: "J", 12: "Q", 13: "K",
    };
    function cl(c: JsonCard): string {
        const dk = c.origin_deck === 0 ? "1" : "2";
        return VAL_L[c.value] + SUIT_L[c.suit] + ":" + dk;
    }

    const puzzle = {
        saved_at: new Date().toISOString(),
        player: player_index + 1,
        hand: hand.map(cl),
        board: board.map(s => ({
            cards: s.board_cards.map(bc => cl(bc.card as JsonCard)),
        })),
    };

    const dir = "src/lyn_rummy/puzzles";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename = `${dir}/stuck_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(puzzle, null, 2));
    console.log(`\nSaved puzzle: ${filename}`);
    console.log(`  Hand: ${hand.map(cl).join(" ")}`);
    console.log(`  Board: ${board.length} stacks`);
}

// --- Three-step idioms (JIT-compiled patterns) ---
//
// These are atomic move sequences that humans recognize as single
// plays. When the basic hint cascade fails, we try these before
// falling back to fumbling.

// Idiom: peel-redirect-replace.
//
// A hand card of value V, suit S, color C is looking for a home.
// There's a board run that ENDS with a card of value V, different
// suit, opposite color — call it X. If X can join an existing set
// (same value, that suit not yet in the set), then:
//   1. Peel X off the run end → still valid (3+ cards)
//   2. Merge X into the set
//   3. Play the hand card in X's vacated spot
//
// All three steps in one compound move (diff-based).
function try_peel_redirect_replace(
    hand_cards: HandCard[],
    board: CardStack[],
): { played: HandCard[]; mutated: CardStack[] } | null {
    for (const hc of hand_cards) {
        const h_card = hc.card;

        // Find runs ending with a same-value, different-suit, opposite-color card.
        for (let si = 0; si < board.length; si++) {
            const stack = board[si];
            const st = stack.stack_type;
            if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;
            if (stack.board_cards.length < 4) continue; // need 3+ left after peel

            const cards = stack.get_cards();
            // Try both ends.
            for (const end of ["left", "right"] as const) {
                const idx = end === "left" ? 0 : cards.length - 1;
                const end_card = cards[idx];

                if (end_card.value !== h_card.value) continue;
                if (end_card.suit === h_card.suit) continue;
                if (end_card.color === h_card.color) continue;

                // Would the hand card legally replace this position?
                // In an rb run, the neighbor at idx+1 (or idx-1) has opposite color
                // to end_card, so hand card (same color as end_card? no, opposite to
                // end_card means opposite to neighbor... wait).
                // Simpler test: simulate the play and check validity.
                const clone = board.map(s => s.clone());
                const cloned_stack = clone[si];
                const cloned_cards = cloned_stack.board_cards;

                // Peel the end card.
                const peeled = end === "left"
                    ? cloned_cards[0]
                    : cloned_cards[cloned_cards.length - 1];
                const after_peel = end === "left"
                    ? cloned_cards.slice(1)
                    : cloned_cards.slice(0, -1);
                const peeled_stack = new CardStack(after_peel, cloned_stack.loc);
                if (peeled_stack.problematic() || peeled_stack.incomplete()) continue;

                // Find a set to redirect the peeled card into.
                let set_idx = -1;
                for (let j = 0; j < clone.length; j++) {
                    if (j === si) continue;
                    const s = clone[j];
                    if (s.stack_type !== CardStackType.SET) continue;
                    if (s.board_cards.length >= 4) continue;
                    const first = s.board_cards[0].card;
                    if (first.value !== peeled.card.value) continue;
                    const suits = s.board_cards.map(bc => bc.card.suit);
                    if (suits.includes(peeled.card.suit)) continue;
                    set_idx = j;
                    break;
                }
                if (set_idx < 0) continue;

                // Apply all three steps on the clone.
                clone[si] = peeled_stack;
                const old_set = clone[set_idx];
                const new_set_cards = [...old_set.board_cards, peeled];
                clone[set_idx] = new CardStack(new_set_cards, old_set.loc);

                // Place the hand card in the peeled position.
                const new_stack_cards = end === "left"
                    ? [new BoardCardClass(h_card, BoardCardState.FRESHLY_PLAYED), ...clone[si].board_cards]
                    : [...clone[si].board_cards, new BoardCardClass(h_card, BoardCardState.FRESHLY_PLAYED)];
                const final_stack = new CardStack(new_stack_cards, clone[si].loc);
                if (final_stack.problematic() || final_stack.incomplete()) continue;
                clone[si] = final_stack;

                return { played: [hc], mutated: clone };
            }
        }
    }
    return null;
}

// Try all known idioms. Returns the first match.
function try_idioms(
    hand_cards: HandCard[],
    board: CardStack[],
): { played: HandCard[]; mutated: CardStack[]; name: string } | null {
    const p = try_peel_redirect_replace(hand_cards, board);
    if (p) return { ...p, name: "peel-redirect-replace" };
    return null;
}

// --- Fumble mode ---
//
// When stuck, try random board manipulations like a human would:
// split a 4-card set, free a card, see if that unlocks new hints.
// If nothing works, put it back. Fumbling is thinking with your hands.

function find_splittable_stacks(board: CardStack[]): { index: number; split_at: number }[] {
    const candidates: { index: number; split_at: number }[] = [];
    for (let i = 0; i < board.length; i++) {
        const s = board[i];
        const n = s.board_cards.length;
        const st = s.stack_type;

        // 4-card set: can remove any card, leaving a 3-card set.
        if (st === CardStackType.SET && n === 4) {
            // Try removing each end.
            candidates.push({ index: i, split_at: 1 });  // peel first card
            candidates.push({ index: i, split_at: n - 1 }); // peel last card
        }

        // Long run (5+): can peel from either end.
        if ((st === CardStackType.PURE_RUN || st === CardStackType.RED_BLACK_RUN) && n >= 5) {
            candidates.push({ index: i, split_at: 1 });  // peel first
            candidates.push({ index: i, split_at: n - 1 }); // peel last
        }

        // Splittable run (6+): can split in the middle.
        if ((st === CardStackType.PURE_RUN || st === CardStackType.RED_BLACK_RUN) && n >= 6) {
            candidates.push({ index: i, split_at: 3 }); // split at midpoint-ish
        }
    }
    return candidates;
}

function try_fumble(
    hand_cards: HandCard[],
    board: CardStack[],
): { mutated_board: CardStack[]; description: string } | null {
    const candidates = find_splittable_stacks(board);

    // Level 1: single split.
    for (const { index, split_at } of candidates) {
        const clone = board.map(s => s.clone());
        const stack = clone[index];
        const left = new CardStack(stack.board_cards.slice(0, split_at), stack.loc);
        const right = new CardStack(stack.board_cards.slice(split_at), DUMMY_LOC);
        clone.splice(index, 1, left, right);

        const hint = get_hint(hand_cards, clone);
        if (hint.level !== HintLevel.NO_MOVES && hint.level !== HintLevel.REARRANGE_PLAY) {
            const desc = `Fumble: split [${stack.board_cards.map(bc => bc.card.str()).join(" ")}] → ${hint.level}`;
            return { mutated_board: clone, description: desc };
        }

        // Level 2: also check idioms on the split board.
        const idiom = try_idioms(hand_cards, clone);
        if (idiom) {
            const desc = `Fumble: split [${stack.board_cards.map(bc => bc.card.str()).join(" ")}] → idiom ${idiom.name}`;
            return { mutated_board: clone, description: desc };
        }
    }

    // Level 3: try two-level splits. Fumble on top of fumble.
    // This is more expensive but captures "shuffle around, then peek" humans.
    for (const first of candidates) {
        const clone1 = board.map(s => s.clone());
        const s1 = clone1[first.index];
        clone1.splice(first.index, 1,
            new CardStack(s1.board_cards.slice(0, first.split_at), s1.loc),
            new CardStack(s1.board_cards.slice(first.split_at), DUMMY_LOC));

        const candidates2 = find_splittable_stacks(clone1);
        for (const second of candidates2) {
            const clone2 = clone1.map(s => s.clone());
            const s2 = clone2[second.index];
            clone2.splice(second.index, 1,
                new CardStack(s2.board_cards.slice(0, second.split_at), s2.loc),
                new CardStack(s2.board_cards.slice(second.split_at), DUMMY_LOC));

            const hint = get_hint(hand_cards, clone2);
            if (hint.level !== HintLevel.NO_MOVES && hint.level !== HintLevel.REARRANGE_PLAY) {
                const desc = `Deep fumble: 2 splits → ${hint.level}`;
                return { mutated_board: clone2, description: desc };
            }
        }
    }

    return null;
}

async function auto_play_turn(
    state: GameState,
    game_id: number,
    player_index: number,
    addr: string,
): Promise<void> {
    start_turn_stats(game_id, player_index);
    let moves_played = 0;

    let consecutive_failures = 0;
    let done = false;

    while (!done) {
        const hand_json = state.get_remaining_hand(player_index);
        if (hand_json.length === 0) break;

        // Nudge overlapping stacks — a local fix, not a full rebuild.
        await nudge_if_needed(state, game_id, addr);

        const hand_cards = json_to_hand_cards(hand_json);
        const board_stacks = json_to_card_stacks(state.board);

        const hint = get_hint(hand_cards, board_stacks);

        if (hint.level === HintLevel.NO_MOVES ||
            hint.level === HintLevel.REARRANGE_PLAY) {
            // Try three-step idioms before fumbling.
            const idiom = try_idioms(hand_cards, board_stacks);
            if (idiom) {
                console.log(`Idiom: ${idiom.name}`);
                record_idiom(idiom.name);
                const diff = board_diff(board_stacks, idiom.mutated);
                for (const s of diff.stacks_to_add) {
                    if (s.loc.top === 0 && s.loc.left === 0) {
                        const near = state.board.length > 0 ? state.board[state.board.length - 1] : undefined;
                        s.loc = near
                            ? find_nearby_loc(state.board, s.board_cards.length, near)
                            : find_open_loc(state.board, s.board_cards.length, BOARD_BOUNDS);
                    }
                }
                const real_removes: JsonCardStack[] = [];
                for (const rem of diff.stacks_to_remove) {
                    const rem_key = rem.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                    for (const bs of state.board) {
                        const bs_key = bs.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                        if (rem_key === bs_key) { real_removes.push(bs); break; }
                    }
                }
                const cards_json = idiom.played.map(hc => hc.card.toJSON());
                const be = make_board_event(real_removes, diff.stacks_to_add);
                const ok = await state.send_move(game_id, addr, be, cards_json);
                if (ok) {
                    moves_played += idiom.played.length;
                    consecutive_failures = 0;
                    continue;
                }
            }

            // Try fumbling before giving up.
            const fumble = try_fumble(hand_cards, board_stacks);
            if (fumble) {
                console.log(fumble.description);
                record_fumble();
                // Apply the fumble (split) to the real board via diff.
                const diff = board_diff(board_stacks, fumble.mutated_board);
                for (const s of diff.stacks_to_add) {
                    if (s.loc.top === 0 && s.loc.left === 0) {
                        const near = state.board.length > 0 ? state.board[state.board.length - 1] : undefined;
                        s.loc = near
                            ? find_nearby_loc(state.board, s.board_cards.length, near)
                            : find_open_loc(state.board, s.board_cards.length, BOARD_BOUNDS);
                    }
                }
                const real_removes: JsonCardStack[] = [];
                for (const rem of diff.stacks_to_remove) {
                    const rem_key = rem.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                    for (const bs of state.board) {
                        const bs_key = bs.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                        if (rem_key === bs_key) { real_removes.push(bs); break; }
                    }
                }
                const be = make_board_event(real_removes, diff.stacks_to_add);
                await state.send_move(game_id, addr, be);
                continue; // re-check hints with the new board
            }
            console.log(`Hint: ${hint.level}`);
            break;
        }

        if (consecutive_failures >= 3) {
            console.log("Too many failures, stopping.");
            break;
        }

        console.log(`Hint: ${hint.level}`);
        record_hint(hint.level);

        switch (hint.level) {
            case HintLevel.HAND_STACKS: {
                const group = hint.hand_stacks[0];
                const cards_json = group.cards.map(hc => hc.card.toJSON());
                // Place near the last stack on the board — think with your hands.
                const near = state.board.length > 0 ? state.board[state.board.length - 1] : undefined;
                const loc = near
                    ? find_nearby_loc(state.board, group.cards.length, near)
                    : find_open_loc(state.board, group.cards.length, BOARD_BOUNDS);
                const board_cards = cards_json.map(c => make_board_card(c, BoardCardState.FRESHLY_PLAYED));
                const new_stack = make_stack(board_cards, loc);
                const be = make_board_event([], [new_stack]);
                const ok = await state.send_move(game_id, addr, be, cards_json);
                if (ok) {
                    moves_played += group.cards.length;
                    consecutive_failures = 0;
                } else {
                    consecutive_failures++;
                }
                break;
            }

            case HintLevel.DIRECT_PLAY: {
                const hc = hint.playable_cards[0];
                const card_json = hc.card.toJSON();
                const single = CardStack.from_hand_card(hc, { top: 0, left: 0 });

                let played = false;
                for (let i = 0; i < board_stacks.length; i++) {
                    const right = board_stacks[i].right_merge(single);
                    const left = right ? null : board_stacks[i].left_merge(single);
                    const merged = right ?? left;
                    if (merged) {
                        const old_stack = state.board[i];
                        const new_stack_json = merged.toJSON();

                        // Look ahead: will the extended stack overlap a neighbor?
                        // If so, make room FIRST — like a human would.
                        const preview_rect: Rect = {
                            left: new_stack_json.loc.left,
                            top: new_stack_json.loc.top,
                            right: new_stack_json.loc.left + stack_pixel_width(new_stack_json.board_cards.length),
                            bottom: new_stack_json.loc.top + CARD_HEIGHT,
                        };
                        for (let j = 0; j < state.board.length; j++) {
                            if (j === i) continue;
                            const neighbor = state.board[j];
                            if (rects_overlap(preview_rect, stack_rect(neighbor))) {
                                // Shove the neighbor out of the way.
                                const new_left = preview_rect.right + MARGIN;
                                if (new_left + stack_pixel_width(neighbor.board_cards.length) <= MAX_BOARD_WIDTH) {
                                    const moved = { ...neighbor, loc: { top: neighbor.loc.top, left: new_left } };
                                    const nudge_be = make_board_event([neighbor], [moved]);
                                    await state.send_move(game_id, addr, nudge_be);
                                    // Refresh board_stacks after nudge.
                                    break;
                                }
                            }
                        }

                        // Now play the card into the cleared space.
                        // Re-read old_stack from state.board since nudging may have changed indices.
                        const current_old = state.board.find(s => stacks_match(s, old_stack));
                        if (!current_old) {
                            consecutive_failures++;
                            played = true;
                            break;
                        }
                        const be = make_board_event([current_old], [new_stack_json]);
                        const ok = await state.send_move(game_id, addr, be, [card_json]);
                        if (ok) {
                            moves_played++;
                            consecutive_failures = 0;
                        } else {
                            consecutive_failures++;
                        }
                        played = true;
                        break;
                    }
                }
                if (!played) {
                    console.log(`  Could not find merge target for ${card_label(card_json)}`);
                    consecutive_failures++;
                    continue;
                }
                break;
            }

            case HintLevel.SWAP:
            case HintLevel.SPLIT_FOR_SET:
            case HintLevel.LOOSE_CARD_PLAY:
            case HintLevel.SPLIT_AND_INJECT:
            case HintLevel.PEEL_FOR_RUN:
            case HintLevel.PAIR_PEEL:
            case HintLevel.PAIR_DISSOLVE:
            case HintLevel.SIX_TO_FOUR: {
                // Complex hints: clone the board, run the mutation,
                // diff to get wire events.
                const board_clone = board_stacks.map(s => s.clone());
                const played_hcs = execute_complex_hint(hint, board_clone);
                if (played_hcs.length === 0) {
                    console.log("  (complex hint failed)");
                    consecutive_failures++;
                    break;
                }

                const diff = board_diff(board_stacks, board_clone);
                // Assign real locations to new stacks (those with DUMMY_LOC).
                for (const s of diff.stacks_to_add) {
                    if (s.loc.top === 0 && s.loc.left === 0) {
                        const near_stack = state.board.length > 0
                            ? state.board[state.board.length - 1]
                            : undefined;
                        s.loc = near_stack
                            ? find_nearby_loc(state.board, s.board_cards.length, near_stack)
                            : find_open_loc(state.board, s.board_cards.length, BOARD_BOUNDS);
                    }
                }

                // Match stacks_to_remove against the actual board (with real locations).
                const real_removes: JsonCardStack[] = [];
                for (const rem of diff.stacks_to_remove) {
                    for (const bs of state.board) {
                        // Match by cards only (locations may differ between clone and real board).
                        const rem_cards = rem.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                        const bs_cards = bs.board_cards.map(bc => `${(bc.card as JsonCard).value},${(bc.card as JsonCard).suit},${(bc.card as JsonCard).origin_deck}`).join("|");
                        if (rem_cards === bs_cards) {
                            real_removes.push(bs);
                            break;
                        }
                    }
                }

                const cards_json = played_hcs.map(hc => hc.card.toJSON());
                const be = make_board_event(real_removes, diff.stacks_to_add);
                const ok = await state.send_move(game_id, addr, be, cards_json);
                if (ok) {
                    moves_played += played_hcs.length;
                    consecutive_failures = 0;
                } else {
                    consecutive_failures++;
                }
                break;
            }

        }
        if (done) break;
    }

    record_cards_played(moves_played);

    // Save puzzle if stuck with cards remaining.
    // Use last_clean_board so the puzzle presents a valid board.
    const remaining = state.get_remaining_hand(player_index);
    if (remaining.length > 0 && moves_played === 0) {
        record_got_stuck();
        save_puzzle(state.last_clean_board, remaining, player_index);
    }

    save_turn_stats();

    // Tidy at end of turn — the one time we do a full relayout.
    console.log(`\nPlayed ${moves_played} cards.`);
    await tidy_board(state, game_id, addr);
    console.log("Completing turn.");
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
    state.quiet = false;

    state.show(player_index);

    if (play) {
        console.log("\n--- Auto-playing turn ---\n");
        await auto_play_turn(state, game_id, player_index, addr);
        console.log("\n--- After turn ---\n");
        state.show(player_index);
    }
}

main();
