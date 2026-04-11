import * as assert from "assert";
import { Card, OriginDeck, Suit, CardValue } from "../core/card";
import { BoardCard, BoardCardState, CardStack } from "../core/card_stack";
import { GeometryReplay } from "./geometry_replay";
import { type BoardBounds } from "./board_geometry";

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

function make_card(): BoardCard {
    return new BoardCard(
        new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_ONE),
        BoardCardState.FIRMLY_ON_BOARD,
    );
}

function make_stack(left: number, top: number, count: number): CardStack {
    const cards = [];
    for (let i = 0; i < count; i++) cards.push(make_card());
    return new CardStack(cards, { top, left });
}

// --- Valid boards ---

function test_empty_board() {
    const engine = new GeometryReplay(bounds, []);
    assert.ok(engine.is_valid(), "Empty board");
}

function test_single_stack() {
    const engine = new GeometryReplay(bounds, [make_stack(10, 10, 3)]);
    assert.ok(engine.is_valid(), "Single stack");
}

function test_two_stacks_apart() {
    const engine = new GeometryReplay(bounds, [
        make_stack(10, 10, 3),
        make_stack(10, 100, 4),
    ]);
    assert.ok(engine.is_valid(), "Two apart");
}

// --- Out of bounds ---

function test_extends_right() {
    const engine = new GeometryReplay(bounds, [make_stack(780, 10, 3)]);
    assert.ok(!engine.is_valid(), "Extends right");
}

function test_extends_below() {
    const engine = new GeometryReplay(bounds, [make_stack(10, 570, 3)]);
    assert.ok(!engine.is_valid(), "Extends below");
}

// --- Overlaps ---

function test_same_position() {
    const engine = new GeometryReplay(bounds, [
        make_stack(10, 10, 3),
        make_stack(10, 10, 3),
    ]);
    assert.ok(!engine.is_valid(), "Same position");
}

// --- Moves ---

function test_add_stack() {
    const engine = new GeometryReplay(bounds, [make_stack(10, 10, 3)]);
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [make_stack(10, 100, 4)],
    });
    assert.ok(engine.is_valid(), "Add stack");
    assert.equal(engine.get_board().length, 2);
}

function test_remove_and_add() {
    const original = make_stack(10, 10, 3);
    const engine = new GeometryReplay(bounds, [original, make_stack(10, 100, 4)]);
    engine.apply_move({
        stacks_to_remove: [original],
        stacks_to_add: [make_stack(10, 10, 5)],
    });
    assert.ok(engine.is_valid(), "Replace stack");
    assert.equal(engine.get_board().length, 2);
}

function test_move_causes_overlap() {
    const engine = new GeometryReplay(bounds, [make_stack(10, 10, 3)]);
    engine.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [make_stack(10, 10, 3)],
    });
    assert.ok(!engine.is_valid(), "Overlap after move");
}

function test_multi_step() {
    const engine = new GeometryReplay(bounds, []);
    const s1 = make_stack(10, 10, 3);
    engine.apply_move({ stacks_to_remove: [], stacks_to_add: [s1] });
    const s2 = make_stack(10, 100, 3);
    engine.apply_move({ stacks_to_remove: [], stacks_to_add: [s2] });
    engine.apply_move({
        stacks_to_remove: [s1, s2],
        stacks_to_add: [make_stack(10, 10, 6)],
    });
    assert.ok(engine.is_valid(), "Multi-step chain");
    assert.equal(engine.step, 3);
}

// --- Run all ---

test_empty_board();
test_single_stack();
test_two_stacks_apart();
test_extends_right();
test_extends_below();
test_same_position();
test_add_stack();
test_remove_and_add();
test_move_causes_overlap();
test_multi_step();

console.log("geometry_replay: all tests passed");
