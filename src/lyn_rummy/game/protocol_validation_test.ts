import * as assert from "assert";
import { validate_board, validate_move, validate_payload } from "./protocol_validation";

// Helpers matching JsonCardStack shape: { board_cards: [{card, state}], loc }

function valid_board_card() {
    return { card: { value: 5, suit: 3, origin_deck: 0 }, state: 0 };
}

function valid_stack() {
    return {
        board_cards: [valid_board_card(), valid_board_card(), valid_board_card()],
        loc: { top: 10, left: 10 },
    };
}

function stack_at(left: number, top: number) {
    return {
        board_cards: [valid_board_card(), valid_board_card(), valid_board_card()],
        loc: { top, left },
    };
}

// --- Card validation (via stack) ---

function test_valid_board() {
    const errors = validate_board([stack_at(10, 10), stack_at(300, 10)]);
    assert.equal(errors.length, 0, "Valid board");
}

function test_bad_card_value() {
    const stack = { board_cards: [{ card: { value: 14, suit: 0, origin_deck: 0 }, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.path.includes("value")), "Card value 14 should fail");
}

function test_bad_card_value_zero() {
    const stack = { board_cards: [{ card: { value: 0, suit: 0, origin_deck: 0 }, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.path.includes("value")), "Card value 0 should fail");
}

function test_bad_card_value_float() {
    const stack = { board_cards: [{ card: { value: 5.5, suit: 0, origin_deck: 0 }, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.path.includes("value")), "Float card value should fail");
}

function test_bad_suit() {
    const stack = { board_cards: [{ card: { value: 5, suit: 4, origin_deck: 0 }, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.path.includes("suit")), "Suit 4 should fail");
}

function test_bad_origin_deck() {
    const stack = { board_cards: [{ card: { value: 5, suit: 0, origin_deck: 2 }, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.path.includes("origin_deck")), "Origin deck 2 should fail");
}

function test_missing_card_fields() {
    const stack = { board_cards: [{ card: {}, state: 0 }], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.length >= 3, "Missing card fields should produce multiple errors");
}

// --- Stack validation ---

function test_empty_board_cards_array() {
    const stack = { board_cards: [], loc: { top: 0, left: 0 } };
    const errors = validate_board([stack]);
    assert.ok(errors.some(e => e.message.includes("no cards")), "Empty board_cards should fail");
}

function test_missing_loc() {
    const stack = { board_cards: [valid_board_card()] };
    const errors = validate_board([stack as any]);
    assert.ok(errors.some(e => e.path.includes("loc")), "Missing loc should fail");
}

function test_missing_board_cards() {
    const stack = { loc: { top: 0, left: 0 } };
    const errors = validate_board([stack as any]);
    assert.ok(errors.some(e => e.path.includes("board_cards")), "Missing board_cards should fail");
}

// --- Board validation ---

function test_board_not_array() {
    const errors = validate_board("not an array" as any);
    assert.ok(errors.some(e => e.message.includes("expected board array")));
}

function test_empty_board() {
    const errors = validate_board([]);
    assert.equal(errors.length, 0, "Empty board is valid");
}

// --- Move validation (JsonBoardEvent shape) ---

function test_valid_move() {
    const errors = validate_move({
        stacks_to_remove: [valid_stack()],
        stacks_to_add: [valid_stack()],
    });
    assert.equal(errors.length, 0, "Valid move");
}

function test_move_not_object() {
    const errors = validate_move(null);
    assert.ok(errors.length > 0, "Null move should fail");
}

function test_move_missing_remove() {
    const errors = validate_move({ stacks_to_add: [] });
    assert.ok(errors.some(e => e.path.includes("stacks_to_remove")));
}

function test_move_missing_add() {
    const errors = validate_move({ stacks_to_remove: [] });
    assert.ok(errors.some(e => e.path.includes("stacks_to_add")));
}

function test_move_bad_stack_in_remove() {
    const errors = validate_move({
        stacks_to_remove: [{ board_cards: "not an array", loc: { top: 0, left: 0 } }],
        stacks_to_add: [],
    });
    assert.ok(errors.some(e => e.path.includes("stacks_to_remove")));
}

// --- Full payload ---

function test_valid_payload() {
    const errors = validate_payload({
        board: [valid_stack()],
        moves: [{
            stacks_to_remove: [],
            stacks_to_add: [stack_at(200, 10)],
        }],
    });
    assert.equal(errors.length, 0, "Valid payload");
}

function test_payload_null() {
    const errors = validate_payload(null);
    assert.ok(errors.length > 0);
}

function test_payload_missing_board() {
    const errors = validate_payload({ moves: [] });
    assert.ok(errors.some(e => e.path === "board"));
}

function test_payload_missing_moves() {
    const errors = validate_payload({ board: [] });
    assert.ok(errors.some(e => e.path === "moves"));
}

// --- Run all ---

test_valid_board();
test_bad_card_value();
test_bad_card_value_zero();
test_bad_card_value_float();
test_bad_suit();
test_bad_origin_deck();
test_missing_card_fields();
test_empty_board_cards_array();
test_missing_loc();
test_missing_board_cards();
test_board_not_array();
test_empty_board();
test_valid_move();
test_move_not_object();
test_move_missing_remove();
test_move_missing_add();
test_move_bad_stack_in_remove();
test_valid_payload();
test_payload_null();
test_payload_missing_board();
test_payload_missing_moves();

console.log("protocol_validation: all tests passed");
