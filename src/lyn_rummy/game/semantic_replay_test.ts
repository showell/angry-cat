import * as assert from "assert";
import { SemanticReplay, type SemanticStack, type SemanticMove } from "./semantic_replay";
import type { JsonCard } from "../core/card";
import { CardValue, Suit, OriginDeck } from "../core/card";

function card(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): JsonCard {
    return { value, suit, origin_deck: deck };
}

const C = Suit.CLUB;
const D = Suit.DIAMOND;
const S = Suit.SPADE;
const H = Suit.HEART;
const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function sstack(id: number, cards: JsonCard[]): SemanticStack {
    return { id, cards };
}

// --- Valid boards ---

function test_empty_board() {
    const engine = new SemanticReplay([]);
    assert.ok(engine.is_valid(), "Empty board is valid");
}

function test_valid_pure_run() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
            card(CardValue.SEVEN, H),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(engine.is_valid(), "Pure run should be valid");
}

function test_valid_set() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.FIVE, D),
            card(CardValue.FIVE, S),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(engine.is_valid(), "Set should be valid");
}

function test_valid_red_black_run() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H),  // red
            card(CardValue.SIX, S),   // black
            card(CardValue.SEVEN, D), // red
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(engine.is_valid(), "Red/black run should be valid");
}

function test_wrapping_run() {
    const board = [
        sstack(1, [
            card(CardValue.QUEEN, H),
            card(CardValue.KING, H),
            card(CardValue.ACE, H),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(engine.is_valid(), "Wrapping Q-K-A run should be valid");
}

// --- Invalid boards ---

function test_incomplete_stack() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(!engine.is_valid(), "Two-card stack is incomplete");
}

function test_bogus_stack() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SEVEN, H),
            card(CardValue.NINE, H),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(!engine.is_valid(), "Non-consecutive same-suit is bogus");
}

function test_set_with_duplicates() {
    const board = [
        sstack(1, [
            card(CardValue.FIVE, H, D1),
            card(CardValue.FIVE, H, D2), // same suit, different deck = dup
            card(CardValue.FIVE, D, D1),
        ]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(!engine.is_valid(), "Set with duplicate cards should fail");
}

function test_single_card() {
    const board = [
        sstack(1, [card(CardValue.ACE, H)]),
    ];
    const engine = new SemanticReplay(board);
    assert.ok(!engine.is_valid(), "Single card is incomplete");
}

// --- Move chains ---

function test_valid_move_adds_stack() {
    const engine = new SemanticReplay([
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
            card(CardValue.SEVEN, H),
        ]),
    ]);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [sstack(2, [
            card(CardValue.JACK, C),
            card(CardValue.JACK, D),
            card(CardValue.JACK, S),
        ])],
    });

    assert.ok(engine.is_valid(), "Adding a valid set");
    assert.equal(engine.get_board().length, 2);
}

function test_move_replaces_with_invalid() {
    const engine = new SemanticReplay([
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
            card(CardValue.SEVEN, H),
        ]),
    ]);

    // Replace valid run with a two-card incomplete.
    engine.apply_move({
        stacks_to_remove: [1],
        stacks_to_add: [sstack(2, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
        ])],
    });

    assert.ok(!engine.is_valid(), "Replacing with incomplete stack should fail");
}

function test_split_into_valid_stacks() {
    const engine = new SemanticReplay([
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
            card(CardValue.SEVEN, H),
            card(CardValue.EIGHT, H),
            card(CardValue.NINE, H),
            card(CardValue.TEN, H),
        ]),
    ]);

    engine.apply_move({
        stacks_to_remove: [1],
        stacks_to_add: [
            sstack(2, [
                card(CardValue.FIVE, H),
                card(CardValue.SIX, H),
                card(CardValue.SEVEN, H),
            ]),
            sstack(3, [
                card(CardValue.EIGHT, H),
                card(CardValue.NINE, H),
                card(CardValue.TEN, H),
            ]),
        ],
    });

    assert.ok(engine.is_valid(), "Split into two valid runs");
}

function test_multi_step_valid() {
    const engine = new SemanticReplay([]);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [sstack(1, [
            card(CardValue.ACE, C),
            card(CardValue.ACE, D),
            card(CardValue.ACE, S),
        ])],
    });

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [sstack(2, [
            card(CardValue.TEN, H),
            card(CardValue.JACK, H),
            card(CardValue.QUEEN, H),
        ])],
    });

    assert.ok(engine.is_valid(), "Two valid moves in sequence");
    assert.equal(engine.step, 2);
}

function test_step2_invalid_preserves_error() {
    const engine = new SemanticReplay([
        sstack(1, [
            card(CardValue.FIVE, H),
            card(CardValue.SIX, H),
            card(CardValue.SEVEN, H),
        ]),
    ]);
    assert.ok(engine.is_valid(), "Initial board valid");

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [sstack(2, [
            card(CardValue.TWO, C),
            card(CardValue.FOUR, D),
            card(CardValue.NINE, S),
        ])],
    });

    assert.ok(!engine.is_valid(), "Bogus stack at step 1");
}

function test_remove_nonexistent() {
    const engine = new SemanticReplay([]);
    engine.apply_move({
        stacks_to_remove: [99],
        stacks_to_add: [],
    });
    assert.ok(!engine.is_valid(), "Removing nonexistent stack should fail");
}

// --- Run all ---

test_empty_board();
test_valid_pure_run();
test_valid_set();
test_valid_red_black_run();
test_wrapping_run();
test_incomplete_stack();
test_bogus_stack();
test_set_with_duplicates();
test_single_card();
test_valid_move_adds_stack();
test_move_replaces_with_invalid();
test_split_into_valid_stacks();
test_multi_step_valid();
test_step2_invalid_preserves_error();
test_remove_nonexistent();

console.log("semantic_replay: all tests passed");
