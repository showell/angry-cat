// Tests that demonstrate and then fix wire event validation gaps.
//
// Part 1: Show that overlapping/out-of-bounds stacks are NOT
// caught when events are applied (the current bug).
//
// Part 2: Show that validate_wire_event catches them.

import * as assert from "assert";
import { Card, CardValue, Suit, OriginDeck } from "../core/card";
import { BoardCard, BoardCardState, CardStack } from "../core/card_stack";
import { validate_wire_event, DEFAULT_BOARD_BOUNDS } from "./wire_validation";

const D1 = OriginDeck.DECK_ONE;

function bc(value: CardValue, suit: Suit): BoardCard {
    return new BoardCard(
        new Card(value, suit, D1),
        BoardCardState.FIRMLY_ON_BOARD,
    );
}

function make_run_at(left: number, top: number): CardStack {
    return new CardStack(
        [bc(CardValue.FIVE, Suit.HEART), bc(CardValue.SIX, Suit.HEART), bc(CardValue.SEVEN, Suit.HEART)],
        { top, left },
    );
}

function make_set_at(left: number, top: number): CardStack {
    return new CardStack(
        [bc(CardValue.FIVE, Suit.HEART), bc(CardValue.FIVE, Suit.DIAMOND), bc(CardValue.FIVE, Suit.SPADE)],
        { top, left },
    );
}

// --- Geometry: overlapping stacks should be rejected ---

function test_overlap_rejected() {
    const board_before = [make_run_at(10, 10)];
    const stacks_to_remove: CardStack[] = [];
    const stacks_to_add = [make_set_at(10, 10)]; // same position!

    const errors = validate_wire_event(
        board_before, stacks_to_remove, stacks_to_add,
    );
    assert.ok(errors.length > 0, "Overlapping stacks should be rejected");
    assert.ok(errors.some(e => e.includes("overlap")),
        "Error should mention overlap: " + errors.join("; "));
}

// --- Geometry: out of bounds should be rejected ---

function test_out_of_bounds_rejected() {
    const board_before: CardStack[] = [];
    const stacks_to_add = [make_run_at(790, 10)]; // extends past edge

    const errors = validate_wire_event(
        board_before, [], stacks_to_add,
    );
    assert.ok(errors.length > 0, "Out-of-bounds stack should be rejected");
    assert.ok(errors.some(e => e.includes("outside")),
        "Error should mention bounds: " + errors.join("; "));
}

// --- Geometry: negative position should be rejected ---

function test_negative_position_rejected() {
    const errors = validate_wire_event(
        [], [], [make_run_at(-10, 10)],
    );
    assert.ok(errors.length > 0, "Negative position should be rejected");
}

// --- Valid event should pass ---

function test_valid_event_passes() {
    const board_before = [make_run_at(10, 10)];
    const stacks_to_remove = [make_run_at(10, 10)];
    const stacks_to_add = [
        make_run_at(10, 10),
        make_set_at(10, 100),
    ];

    const errors = validate_wire_event(
        board_before, stacks_to_remove, stacks_to_add,
    );
    assert.equal(errors.length, 0, "Valid event should pass: " + errors.join("; "));
}

// --- Adding to non-overlapping position is fine ---

function test_non_overlapping_add() {
    const board_before = [make_run_at(10, 10)];
    const stacks_to_add = [make_set_at(10, 100)];

    const errors = validate_wire_event(
        board_before, [], stacks_to_add,
    );
    assert.equal(errors.length, 0, "Non-overlapping add should pass");
}

// --- Replace stack at same position is fine ---

function test_replace_at_same_position() {
    const original = make_run_at(10, 10);
    const replacement = make_set_at(10, 10);

    const errors = validate_wire_event(
        [original], [original], [replacement],
    );
    assert.equal(errors.length, 0, "Replace at same position should pass");
}

// --- Run all ---

test_overlap_rejected();
test_out_of_bounds_rejected();
test_negative_position_rejected();
test_valid_event_passes();
test_non_overlapping_add();
test_replace_at_same_position();

console.log("wire_validation: all tests passed");
