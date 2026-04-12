// Play a single random game and dump a move-by-move log.
// No Angry Cat UI — pure offline sim.
//
// Output: one line per move with turn, player, hint level,
// played cards, and board state after.
//
// Usage: npx vite-node src/lyn_rummy/tools/record_game.ts

import { Card, OriginDeck, Suit, value_str, build_full_double_deck } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import { get_hint, HintLevel, join_adjacent_runs } from "../hints/hints";
import { execute_complex_hint } from "../hints/execute_complex";

const DUMMY_LOC = { top: 0, left: 0 };
const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S", [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
const card_str = (c: Card) => value_str(c.value) + suit_letter[c.suit];
const card_deck_str = (c: Card) =>
    card_str(c) + (c.origin_deck === OriginDeck.DECK_TWO ? "ʹ" : "");
const hand_str = (hand: HandCard[]) =>
    hand.map(hc => card_deck_str(hc.card)).join(" ");

function pull(deck: Card[], label: string, origin: OriginDeck): Card {
    const t = Card.from(label, origin);
    const idx = deck.findIndex(c =>
        c.value === t.value && c.suit === t.suit && c.origin_deck === t.origin_deck);
    return deck.splice(idx, 1)[0];
}

function build_initial_board(deck: Card[]): CardStack[] {
    const sigs = [
        ["KS","AS","2S","3S"], ["TD","JD","QD","KD"],
        ["2H","3H","4H"], ["7S","7D","7C"],
        ["AC","AD","AH"], ["2C","3D","4C","5H","6S","7H"],
    ];
    return sigs.map(labels => {
        const bcs = labels.map(l =>
            new BoardCard(pull(deck, l, OriginDeck.DECK_ONE), BoardCardState.FIRMLY_ON_BOARD));
        return new CardStack(bcs, DUMMY_LOC);
    });
}

function deal(deck: Card[], n: number): HandCard[] {
    const out: HandCard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
        out.push(new HandCard(deck.shift()!, HandCardState.NORMAL));
    }
    return out;
}

const board_str = (board: CardStack[]) =>
    board.map(s => `[${s.get_cards().map(card_deck_str).join(" ")}]`).join("  ");

// --- Run the game ---

const deck = build_full_double_deck();
const board = build_initial_board(deck);
const hands: [HandCard[], HandCard[]] = [deal(deck, 15), deal(deck, 15)];

{
    const cleaned = join_adjacent_runs(board);
    if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
}

console.log(`=== INITIAL ===`);
console.log(`P0 hand: ${hand_str(hands[0])}`);
console.log(`P1 hand: ${hand_str(hands[1])}`);
console.log(`Board (${board.length} stacks):`);
for (const s of board) console.log(`  [${s.get_cards().map(card_deck_str).join(" ")}]`);
console.log();

let turn = 0;
let consecutive_stuck = 0;
let total_played = 0;

while (turn < 200) {
    turn++;
    const p = (turn - 1) % 2;
    let turn_played = 0;
    const turn_moves: string[] = [];

    while (hands[p].length > 0) {
        const hint = get_hint(hands[p], board);
        if (hint.level === HintLevel.NO_MOVES || hint.level === HintLevel.REARRANGE_PLAY) break;
        const hand_before = hand_str(hands[p]);
        const cards = execute_complex_hint(hint, board);
        if (cards.length === 0) break;
        const used = new Set(cards);
        hands[p] = hands[p].filter(hc => !used.has(hc));
        turn_played += cards.length;
        // Short level tag: first word/phrase of the level string.
        const tag = level_tag(hint.level);
        turn_moves.push(`${tag} | played ${cards.map(hc => card_deck_str(hc.card)).join("+")}`);
    }

    {
        const cleaned = join_adjacent_runs(board);
        if (cleaned.changed) { board.length = 0; for (const s of cleaned.board) board.push(s); }
    }

    total_played += turn_played;
    const drew = turn_played === 0 ? "  (stuck, draw 3)"
               : hands[p].length === 0 ? "  (hand empty, draw 5)" : "";
    console.log(`T${String(turn).padStart(2)} P${p}  played=${turn_played} deck=${deck.length} hand=${hands[p].length}${drew}`);
    for (const m of turn_moves) console.log(`       ${m}`);

    if (turn_played === 0) {
        hands[p] = hands[p].concat(deal(deck, 3));
        consecutive_stuck++;
    } else if (hands[p].length === 0) {
        hands[p] = hands[p].concat(deal(deck, 5));
        consecutive_stuck = 0;
    } else {
        consecutive_stuck = 0;
    }

    if (hands[0].length === 0 && hands[1].length === 0 && deck.length === 0) break;
    if (consecutive_stuck >= 4) break;
}

console.log(`\n=== FINAL ===`);
console.log(`Total plays across both players: ${total_played}`);
console.log(`P0 hand: ${hand_str(hands[0])} (${hands[0].length})`);
console.log(`P1 hand: ${hand_str(hands[1])} (${hands[1].length})`);
console.log(`Deck: ${deck.length}`);
console.log(`Board (${board.length} stacks):`);
for (const s of board) console.log(`  [${s.get_cards().map(card_deck_str).join(" ")}]`);

function level_tag(level: string): string {
    // Abbreviate the verbose enum-value strings.
    if (level.startsWith("You have")) return "HAND_STACK";
    if (level.startsWith("You can play")) return "DIRECT     ";
    if (level.startsWith("Swap"))        return "SWAP       ";
    if (level.startsWith("Move a board")) return "LOOSE      ";
    if (level.startsWith("Split a run to form")) return "SPLIT_SET  ";
    if (level.startsWith("Split a run and inject")) return "SPLIT_INJ  ";
    if (level.startsWith("Peel two"))    return "PEEL_RUN   ";
    if (level.startsWith("Peel a board")) return "PAIR_PEEL  ";
    if (level.startsWith("Dissolve"))    return "PAIR_DISS  ";
    if (level.startsWith("Merge two"))   return "SIX_TO_FOUR";
    return level.slice(0, 14);
}
