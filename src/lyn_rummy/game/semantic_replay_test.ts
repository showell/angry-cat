import * as assert from "assert";
import { SemanticReplay } from "./semantic_replay";
import { Card, CardValue, Suit, OriginDeck } from "../core/card";
import { BoardCard, BoardCardState, CardStack } from "../core/card_stack";

const C = Suit.CLUB;
const D = Suit.DIAMOND;
const S = Suit.SPADE;
const H = Suit.HEART;
const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function bc(value: CardValue, suit: Suit, deck: OriginDeck = D1): BoardCard {
    return new BoardCard(new Card(value, suit, deck), BoardCardState.FIRMLY_ON_BOARD);
}

// Location doesn't matter for semantics, but CardStack requires it.
const loc = { top: 0, left: 0 };

function run(cards: BoardCard[]): CardStack {
    return new CardStack(cards, loc);
}

// --- Valid boards ---

function test_empty_board() {
    const engine = new SemanticReplay([]);
    assert.ok(engine.is_valid(), "Empty board");
}

function test_valid_pure_run() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H), bc(CardValue.SEVEN, H)]),
    ]);
    assert.ok(engine.is_valid(), "Pure run");
}

function test_valid_set() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.FIVE, D), bc(CardValue.FIVE, S)]),
    ]);
    assert.ok(engine.is_valid(), "Set");
}

function test_valid_red_black_run() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.SIX, S), bc(CardValue.SEVEN, D)]),
    ]);
    assert.ok(engine.is_valid(), "Red/black run");
}

function test_wrapping_run() {
    const engine = new SemanticReplay([
        run([bc(CardValue.QUEEN, H), bc(CardValue.KING, H), bc(CardValue.ACE, H)]),
    ]);
    assert.ok(engine.is_valid(), "Wrapping Q-K-A");
}

// --- Invalid boards ---

function test_incomplete_stack() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H)]),
    ]);
    assert.ok(!engine.is_valid(), "Two-card stack is incomplete");
}

function test_bogus_stack() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.SEVEN, H), bc(CardValue.NINE, H)]),
    ]);
    assert.ok(!engine.is_valid(), "Non-consecutive is bogus");
}

function test_set_with_duplicates() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H, D1), bc(CardValue.FIVE, H, D2), bc(CardValue.FIVE, D, D1)]),
    ]);
    assert.ok(!engine.is_valid(), "Set with dup cards");
}

// --- Move chains ---

function test_valid_move_adds_stack() {
    const engine = new SemanticReplay([
        run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H), bc(CardValue.SEVEN, H)]),
    ]);
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run([bc(CardValue.JACK, C), bc(CardValue.JACK, D), bc(CardValue.JACK, S)])],
    });
    assert.ok(engine.is_valid(), "Add valid set");
    assert.equal(engine.get_board().length, 2);
}

function test_move_replaces_with_invalid() {
    const original = run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H), bc(CardValue.SEVEN, H)]);
    const engine = new SemanticReplay([original]);
    engine.apply_move({
        stacks_to_remove: [original],
        stacks_to_add: [run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H)])],
    });
    assert.ok(!engine.is_valid(), "Replace with incomplete");
}

function test_split_into_valid() {
    const original = run([
        bc(CardValue.FIVE, H), bc(CardValue.SIX, H), bc(CardValue.SEVEN, H),
        bc(CardValue.EIGHT, H), bc(CardValue.NINE, H), bc(CardValue.TEN, H),
    ]);
    const engine = new SemanticReplay([original]);
    engine.apply_move({
        stacks_to_remove: [original],
        stacks_to_add: [
            run([bc(CardValue.FIVE, H), bc(CardValue.SIX, H), bc(CardValue.SEVEN, H)]),
            run([bc(CardValue.EIGHT, H), bc(CardValue.NINE, H), bc(CardValue.TEN, H)]),
        ],
    });
    assert.ok(engine.is_valid(), "Split into two valid runs");
}

function test_multi_step_valid() {
    const engine = new SemanticReplay([]);
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run([bc(CardValue.ACE, C), bc(CardValue.ACE, D), bc(CardValue.ACE, S)])],
    });
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run([bc(CardValue.TEN, H), bc(CardValue.JACK, H), bc(CardValue.QUEEN, H)])],
    });
    assert.ok(engine.is_valid(), "Two valid moves");
    assert.equal(engine.step, 2);
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
test_valid_move_adds_stack();
test_move_replaces_with_invalid();
test_split_into_valid();
test_multi_step_valid();

console.log("semantic_replay: all tests passed");
