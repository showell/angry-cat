// Per-trick coverage: for each registered Trick, verify that the
// bag finds a play on a hand-crafted fixture and that calling
// apply() on a cloned board actually plays the expected cards.
//
// Adding a trick to the bag without a fixture here is a test
// failure — forces documentation of what every trick accomplishes.

import assert from "node:assert/strict";
import { Card, OriginDeck } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import { direct_play } from "./direct_play";
import { rb_swap } from "./rb_swap";
import { pair_peel } from "./pair_peel";
import { hand_stacks } from "./hand_stacks";
import { split_for_set } from "./split_for_set";
import { peel_for_run } from "./peel_for_run";
import { loose_card_play } from "./loose_card_play";
import type { Trick } from "./trick";

function card(label: string, deck: OriginDeck = OriginDeck.DECK_ONE): Card {
    return Card.from(label, deck);
}
function hc(label: string, deck: OriginDeck = OriginDeck.DECK_ONE): HandCard {
    return new HandCard(card(label, deck), HandCardState.NORMAL);
}
function st(...cards: Card[]): CardStack {
    return new CardStack(
        cards.map(c => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)),
        { top: 0, left: 0 },
    );
}

type Fixture = {
    trick: Trick;
    hand: HandCard[];
    board: CardStack[];
    expected_card_count: number; // how many hand cards this play places
    description: string;
};

const FIXTURES: Fixture[] = [
    {
        trick: direct_play,
        description: "4♥ extends the heart run [A♥ 2♥ 3♥] at the right.",
        hand: [hc("4H")],
        board: [st(card("AH"), card("2H"), card("3H"))],
        expected_card_count: 1,
    },
    {
        trick: rb_swap,
        description: "5♦ swaps into rb run at 5♥; 5♥ is kicked onto pure-hearts run.",
        hand: [hc("5D")],
        board: [
            // rb run containing 5H at position 0
            st(card("5H"), card("6S"), card("7H"), card("8S")),
            // pure hearts run that can accept kicked 5H on the right
            st(card("2H"), card("3H"), card("4H")),
        ],
        expected_card_count: 1,
    },
    {
        trick: hand_stacks,
        description: "Hand already has 7♥+7♠+7♦ as a complete set — push it onto the board.",
        hand: [hc("7H"), hc("7S"), hc("7D"), hc("2C")],
        board: [st(card("AH"), card("2H"), card("3H"))],
        expected_card_count: 3,
    },
    {
        trick: split_for_set,
        description: "Hand 8♥; pull 8♠ and 8♦ off two pure runs; new 3-set [8♥ 8♠ 8♦].",
        hand: [hc("8H")],
        board: [
            // 8♠ peelable (right end of size-4 pure spades)
            st(card("5S"), card("6S"), card("7S"), card("8S")),
            // 8♦ peelable (right end of size-4 pure diamonds)
            st(card("5D"), card("6D"), card("7D"), card("8D")),
        ],
        expected_card_count: 1,
    },
    {
        trick: peel_for_run,
        description: "Hand 5♥; peel 4♥ and 6♥ from two different size-4 pure runs; new pure-heart 3-run [4♥ 5♥ 6♥].",
        hand: [hc("5H")],
        board: [
            // 4♥ at right end of size-4 set
            st(card("4S"), card("4C"), card("4D"), card("4H")),
            // 6♥ at right end of size-4 set
            st(card("6S"), card("6C"), card("6D"), card("6H")),
        ],
        expected_card_count: 1,
    },
    {
        trick: loose_card_play,
        description: "Move 7♥ from a 4-set onto the heart run, then 8♥ extends the new tail.",
        // Before: [4H 5H 6H] (heart run), [7S 7C 7D 7H] (4-set of 7s).
        // 8♥ doesn't directly extend either. But peeling 7♥ onto the
        // heart run gives [4H 5H 6H 7H], which 8♥ then extends.
        hand: [hc("8H")],
        board: [
            st(card("4H"), card("5H"), card("6H")),
            st(card("7S"), card("7C"), card("7D"), card("7H")),
        ],
        expected_card_count: 1,
    },
    {
        trick: pair_peel,
        description: "Pair J♠+Q♥ completes to rb triplet when K♠ is peeled from the big spade run.",
        hand: [hc("JS"), hc("QH"), hc("3C")],
        board: [
            st(card("KS"), card("AS"), card("2S"), card("3S")),
            st(card("TD"), card("JD"), card("QD"), card("KD")),
            st(card("2H"), card("3H"), card("4H")),
            st(card("7S"), card("7D"), card("7C")),
            st(card("AC"), card("AD"), card("AH")),
            st(card("2C"), card("3D"), card("4C"), card("5H"), card("6S"), card("7H")),
        ],
        expected_card_count: 2,
    },
];

for (const fx of FIXTURES) {
    const plays = fx.trick.find_plays(fx.hand, fx.board);
    assert.ok(
        plays.length > 0,
        `${fx.trick.id}: no plays found. Fixture: ${fx.description}`,
    );
    const play = plays[0];
    assert.equal(
        play.hand_cards.length, fx.expected_card_count,
        `${fx.trick.id}: play.hand_cards.length mismatch`,
    );

    // Apply on a cloned board. Expect a non-empty result.
    const clone = fx.board.map(s => s.clone());
    const played = play.apply(clone);
    assert.equal(
        played.length, fx.expected_card_count,
        `${fx.trick.id}: apply() returned ${played.length} cards, expected ${fx.expected_card_count}`,
    );

    // The cloned board should have changed from the original.
    const changed =
        clone.length !== fx.board.length ||
        clone.some((s, i) => !s.equals(fx.board[i]));
    assert.ok(changed, `${fx.trick.id}: apply() didn't mutate the board`);
}

console.log(`All trick coverage tests passed (${FIXTURES.length} tricks).`);
