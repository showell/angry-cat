import * as assert from "assert";
import { GeometryReplay, type GeoStack, type GeoMove } from "./geometry_replay";
import { stack_width, STACK_HEIGHT, type BoardBounds } from "./board_geometry";

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

function stack(id: number, left: number, top: number, cards: number): GeoStack {
    return { id, card_count: cards, loc: { top, left } };
}

// --- Valid initial board ---

function test_valid_initial_board() {
    const board = [
        stack(1, 10, 10, 3),
        stack(2, 10, 100, 4),
    ];
    const engine = new GeometryReplay(bounds, board);
    assert.ok(engine.is_valid(), "Valid initial board");
}

// --- Invalid initial board ---

function test_overlapping_initial_board() {
    const board = [
        stack(1, 10, 10, 3),
        stack(2, 10, 10, 3), // same position
    ];
    const engine = new GeometryReplay(bounds, board);
    assert.ok(!engine.is_valid(), "Overlapping initial board should fail");
}

function test_out_of_bounds_initial() {
    const board = [stack(1, 790, 10, 3)];
    const engine = new GeometryReplay(bounds, board);
    assert.ok(!engine.is_valid(), "Stack outside bounds should fail");
}

// --- Valid move chain ---

function test_add_stack() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(2, 10, 100, 4)],
    });

    assert.ok(engine.is_valid(), "Adding a non-overlapping stack");
    assert.equal(engine.get_board().length, 2);
}

function test_remove_and_add() {
    const board = [
        stack(1, 10, 10, 3),
        stack(2, 10, 100, 4),
    ];
    const engine = new GeometryReplay(bounds, board);

    // Remove stack 1, add a new stack 3 in its place.
    engine.apply_move({
        stacks_to_remove: [1],
        stacks_to_add: [stack(3, 10, 10, 5)],
    });

    assert.ok(engine.is_valid(), "Replace stack with bigger one");
    assert.equal(engine.get_board().length, 2);
    assert.ok(engine.get_board().some(s => s.id === 3));
    assert.ok(!engine.get_board().some(s => s.id === 1));
}

function test_split_stack() {
    // Simulate splitting one stack into two.
    const board = [stack(1, 10, 10, 6)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [1],
        stacks_to_add: [
            stack(2, 10, 10, 3),
            stack(3, 10, 100, 3),
        ],
    });

    assert.ok(engine.is_valid(), "Split into two non-overlapping stacks");
    assert.equal(engine.get_board().length, 2);
}

function test_multi_step_chain() {
    const engine = new GeometryReplay(bounds, []);

    // Step 1: place a stack.
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(1, 10, 10, 3)],
    });

    // Step 2: place another.
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(2, 10, 100, 3)],
    });

    // Step 3: remove first, extend second.
    engine.apply_move({
        stacks_to_remove: [1, 2],
        stacks_to_add: [stack(3, 10, 10, 6)],
    });

    assert.ok(engine.is_valid(), "Multi-step chain all valid");
    assert.equal(engine.step, 3);
    assert.equal(engine.get_board().length, 1);
}

// --- Invalid moves ---

function test_move_causes_overlap() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(2, 10, 10, 3)], // overlaps stack 1
    });

    assert.ok(!engine.is_valid(), "Move causing overlap should fail");
}

function test_move_causes_out_of_bounds() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(2, 790, 10, 3)],
    });

    assert.ok(!engine.is_valid(), "Move pushing stack out of bounds should fail");
}

function test_remove_nonexistent_stack() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [99], // doesn't exist
        stacks_to_add: [],
    });

    assert.ok(!engine.is_valid(), "Removing nonexistent stack should fail");
}

function test_duplicate_stack_id() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(1, 10, 100, 3)], // id 1 already exists
    });

    assert.ok(!engine.is_valid(), "Duplicate stack id should fail");
}

function test_error_at_step_2_preserves_step_1() {
    const board = [stack(1, 10, 10, 3)];
    const engine = new GeometryReplay(bounds, board);

    // Step 1: valid.
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(2, 10, 100, 3)],
    });
    assert.ok(engine.is_valid(), "Step 1 should be valid");

    // Step 2: invalid (overlap).
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [stack(3, 10, 10, 3)],
    });
    assert.ok(!engine.is_valid(), "Step 2 should fail");
    assert.equal(engine.step, 2);
}

// --- Run all ---

test_valid_initial_board();
test_overlapping_initial_board();
test_out_of_bounds_initial();
test_add_stack();
test_remove_and_add();
test_split_stack();
test_multi_step_chain();
test_move_causes_overlap();
test_move_causes_out_of_bounds();
test_remove_nonexistent_stack();
test_duplicate_stack_id();
test_error_at_step_2_preserves_step_1();

console.log("geometry_replay: all tests passed");
