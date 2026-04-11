import * as assert from "assert";
import type { JsonCardStack } from "../core/card_stack";
import {
    validate_board_geometry,
    classify_board_geometry,
    BoardGeometryStatus,
    stack_width,
    STACK_HEIGHT,
    type BoardBounds,
} from "./board_geometry";

// Helper to make a stack at a given location with N cards.
function make_stack(left: number, top: number, card_count: number): JsonCardStack {
    const board_cards = [];
    for (let i = 0; i < card_count; i++) {
        board_cards.push({
            card: { value: i + 1, suit: 0, origin_deck: 0 },
            state: 0,
        });
    }
    return { board_cards, loc: { top, left } };
}

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

// --- Valid boards ---

function test_empty_board() {
    const errors = validate_board_geometry([], bounds);
    assert.equal(errors.length, 0, "Empty board should be valid");
}

function test_single_stack() {
    const stacks = [make_stack(10, 10, 3)];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 0, "Single stack within bounds should be valid");
}

function test_two_stacks_apart() {
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10, 100, 4),
    ];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 0, "Two non-overlapping stacks should be valid");
}

function test_stacks_side_by_side() {
    const w = stack_width(3);
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10 + w + bounds.margin + 1, 10, 3),
    ];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 0, "Side-by-side stacks with margin should be valid");
}

// --- Out of bounds ---

function test_stack_extends_right() {
    const stacks = [make_stack(780, 10, 3)];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 1, "Stack extending past right edge");
    assert.equal(errors[0].type, "out_of_bounds");
}

function test_stack_extends_below() {
    const stacks = [make_stack(10, 570, 3)];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 1, "Stack extending past bottom edge");
    assert.equal(errors[0].type, "out_of_bounds");
}

function test_stack_negative_position() {
    const stacks = [make_stack(-5, 10, 3)];
    const errors = validate_board_geometry(stacks, bounds);
    assert.equal(errors.length, 1, "Stack with negative left");
    assert.equal(errors[0].type, "out_of_bounds");
}

// --- Overlaps ---

function test_stacks_overlap_exactly() {
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10, 10, 3),
    ];
    const errors = validate_board_geometry(stacks, bounds);
    assert.ok(errors.some(e => e.type === "overlap"), "Identical positions should overlap");
}

function test_stacks_overlap_partially() {
    const stacks = [
        make_stack(10, 10, 5),
        make_stack(50, 10, 5),
    ];
    const errors = validate_board_geometry(stacks, bounds);
    assert.ok(errors.some(e => e.type === "overlap"), "Horizontally overlapping stacks");
}

function test_stacks_too_close() {
    // Just inside the margin — CROWDED, not ILLEGAL.
    const w = stack_width(3);
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10 + w + bounds.margin - 1, 10, 3),
    ];
    const errors = validate_board_geometry(stacks, bounds);
    assert.ok(errors.some(e => e.type === "crowded"),
        "Stacks within margin should be flagged as crowded");
    assert.ok(!errors.some(e => e.type === "overlap"),
        "Should NOT be flagged as overlap (they don't actually overlap)");
}

// --- Classification ---

function test_classify_cleanly_spaced() {
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10, 100, 3),
    ];
    assert.equal(
        classify_board_geometry(stacks, bounds),
        BoardGeometryStatus.CLEANLY_SPACED,
    );
}

function test_classify_crowded() {
    const w = stack_width(3);
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10 + w + 1, 10, 3), // close but not overlapping
    ];
    assert.equal(
        classify_board_geometry(stacks, bounds),
        BoardGeometryStatus.CROWDED,
    );
}

function test_classify_illegal_overlap() {
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10, 10, 3),
    ];
    assert.equal(
        classify_board_geometry(stacks, bounds),
        BoardGeometryStatus.ILLEGAL,
    );
}

function test_classify_illegal_out_of_bounds() {
    const stacks = [make_stack(790, 10, 3)];
    assert.equal(
        classify_board_geometry(stacks, bounds),
        BoardGeometryStatus.ILLEGAL,
    );
}

function test_three_stacks_one_overlap() {
    const stacks = [
        make_stack(10, 10, 3),
        make_stack(10, 100, 3),
        make_stack(10, 10, 3), // overlaps with stack 0
    ];
    const errors = validate_board_geometry(stacks, bounds);
    const overlaps = errors.filter(e => e.type === "overlap");
    assert.equal(overlaps.length, 1, "Only one pair should overlap");
    assert.deepEqual(overlaps[0].stack_indices, [0, 2]);
}

// --- Run all ---

test_empty_board();
test_single_stack();
test_two_stacks_apart();
test_stacks_side_by_side();
test_stack_extends_right();
test_stack_extends_below();
test_stack_negative_position();
test_stacks_overlap_exactly();
test_stacks_overlap_partially();
test_stacks_too_close();
test_classify_cleanly_spaced();
test_classify_crowded();
test_classify_illegal_overlap();
test_classify_illegal_out_of_bounds();
test_three_stacks_one_overlap();

console.log("board_geometry: all tests passed");
