// End-to-end validation pipeline test.
//
// Simulates machine-to-machine play: moves are serialized to JSON,
// then validated through all four pipeline stages via GameReferee:
//
//   1. Protocol  — is the JSON well-formed?
//   2. Geometry  — do stacks fit without illegal overlap?
//   3. Semantics — are all stacks valid card groups?
//   4. Inventory — are cards conserved?
//
// This is the referee. Two competing agents would both submit
// moves through this pipeline; the referee doesn't care who's
// playing, only that the moves are legal.

import * as assert from "assert";
import { Card, CardValue, OriginDeck, Suit } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
    type JsonCardStack,
} from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import { type BoardBounds } from "./board_geometry";
import { GameReferee, type RefereeMove } from "./referee";

// --- Helpers ---

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

function card(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): Card {
    return new Card(value, suit, deck);
}

function bc(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(card(value, suit, deck), BoardCardState.FIRMLY_ON_BOARD);
}

function fresh(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(card(value, suit, deck), BoardCardState.FRESHLY_PLAYED);
}

function hc(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): HandCard {
    return new HandCard(card(value, suit, deck), HandCardState.NORMAL);
}

function ref(initial_board: CardStack[] = []): GameReferee {
    return new GameReferee(bounds, initial_board);
}

// --- Test: valid game sequence ---

function test_valid_game_sequence() {
    const run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
    ], { top: 10, left: 10 });

    const set = new CardStack([
        bc(CardValue.KING, Suit.CLUB),
        bc(CardValue.KING, Suit.DIAMOND),
        bc(CardValue.KING, Suit.SPADE),
    ], { top: 10, left: 200 });

    const r = ref([run, set]);

    // Move 1: extend the run with 8H from hand.
    const eight_h = hc(CardValue.EIGHT, Suit.HEART);
    const extended_run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.EIGHT, Suit.HEART),
    ], { top: 10, left: 10 });

    let err = r.apply_move({
        stacks_to_remove: [run],
        stacks_to_add: [extended_run],
        hand_cards_played: [eight_h],
    });
    assert.strictEqual(err, undefined, `Move 1: ${err?.message}`);

    // Move 2: extend the set with KH from hand.
    const king_h = hc(CardValue.KING, Suit.HEART);
    const extended_set = new CardStack([
        bc(CardValue.KING, Suit.CLUB),
        bc(CardValue.KING, Suit.DIAMOND),
        bc(CardValue.KING, Suit.SPADE),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 200 });

    err = r.apply_move({
        stacks_to_remove: [set],
        stacks_to_add: [extended_set],
        hand_cards_played: [king_h],
    });
    assert.strictEqual(err, undefined, `Move 2: ${err?.message}`);

    // Move 3: place a new 3-card run from hand.
    const new_run = new CardStack([
        fresh(CardValue.ACE, Suit.SPADE),
        fresh(CardValue.TWO, Suit.SPADE),
        fresh(CardValue.THREE, Suit.SPADE),
    ], { top: 60, left: 10 });

    err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [new_run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.SPADE),
            hc(CardValue.TWO, Suit.SPADE),
            hc(CardValue.THREE, Suit.SPADE),
        ],
    });
    assert.strictEqual(err, undefined, `Move 3: ${err?.message}`);

    // Move 4: pure board rearrangement — move the set (no hand cards).
    const moved_set = new CardStack(
        extended_set.board_cards,
        { top: 60, left: 200 },
    );

    err = r.apply_move({
        stacks_to_remove: [extended_set],
        stacks_to_add: [moved_set],
    });
    assert.strictEqual(err, undefined, `Move 4: ${err?.message}`);

    assert.strictEqual(r.move_count, 4);
}

// --- Test: protocol rejects malformed JSON ---

function test_protocol_rejects_bad_json() {
    const bad_stack: JsonCardStack = {
        board_cards: [{
            card: { value: 5, suit: 99 as any, origin_deck: 0 },
            state: BoardCardState.FRESHLY_PLAYED,
        }],
        loc: { top: 60, left: 10 },
    };
    const errors = validate_move({
        stacks_to_remove: [],
        stacks_to_add: [bad_stack],
    });
    assert.ok(errors.length > 0, "Should reject bad suit");
    assert.ok(errors[0].message.includes("suit"), `Expected suit error: ${errors[0].message}`);
}

// --- Test: geometry rejects overlapping stacks ---

function test_geometry_rejects_overlap() {
    const stack1 = new CardStack([
        bc(CardValue.ACE, Suit.HEART),
        bc(CardValue.TWO, Suit.HEART),
        bc(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const r = ref([stack1]);

    const overlapping = new CardStack([
        fresh(CardValue.SEVEN, Suit.CLUB),
        fresh(CardValue.SEVEN, Suit.DIAMOND),
        fresh(CardValue.SEVEN, Suit.SPADE),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [overlapping],
        hand_cards_played: [
            hc(CardValue.SEVEN, Suit.CLUB),
            hc(CardValue.SEVEN, Suit.DIAMOND),
            hc(CardValue.SEVEN, Suit.SPADE),
        ],
    });
    assert.ok(err !== undefined, "Should reject overlap");
    assert.strictEqual(err!.stage, "geometry");
}

// --- Test: geometry rejects out of bounds ---

function test_geometry_rejects_out_of_bounds() {
    const r = ref();

    const off_board = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 900 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [off_board],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
            hc(CardValue.THREE, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined, "Should reject out of bounds");
    assert.strictEqual(err!.stage, "geometry");
}

// --- Test: semantics rejects bogus stack ---

function test_semantics_rejects_bogus() {
    const r = ref();

    const bogus = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.FIVE, Suit.CLUB),
        fresh(CardValue.KING, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [bogus],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.FIVE, Suit.CLUB),
            hc(CardValue.KING, Suit.DIAMOND),
        ],
    });
    assert.ok(err !== undefined, "Should reject bogus stack");
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: semantics rejects incomplete stack ---

function test_semantics_rejects_incomplete() {
    const r = ref();

    const incomplete = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [incomplete],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined, "Should reject incomplete stack");
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: semantics rejects duplicate cards in set ---

function test_semantics_rejects_dup_set() {
    const r = ref();

    const dup_set = new CardStack([
        fresh(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.SEVEN, Suit.CLUB),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [dup_set],
        hand_cards_played: [
            hc(CardValue.SEVEN, Suit.HEART),
            hc(CardValue.SEVEN, Suit.HEART),
            hc(CardValue.SEVEN, Suit.CLUB),
        ],
    });
    assert.ok(err !== undefined, "Should reject dup set");
    assert.strictEqual(err!.stage, "semantics");
}

// --- Test: split through pipeline ---

function test_split_through_pipeline() {
    const long_run = new CardStack([
        bc(CardValue.THREE, Suit.DIAMOND),
        bc(CardValue.FOUR, Suit.DIAMOND),
        bc(CardValue.FIVE, Suit.DIAMOND),
        bc(CardValue.SIX, Suit.DIAMOND),
        bc(CardValue.SEVEN, Suit.DIAMOND),
        bc(CardValue.EIGHT, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const r = ref([long_run]);

    const left = new CardStack([
        bc(CardValue.THREE, Suit.DIAMOND),
        bc(CardValue.FOUR, Suit.DIAMOND),
        bc(CardValue.FIVE, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const right = new CardStack([
        bc(CardValue.SIX, Suit.DIAMOND),
        bc(CardValue.SEVEN, Suit.DIAMOND),
        bc(CardValue.EIGHT, Suit.DIAMOND),
    ], { top: 10, left: 200 });

    const err = r.apply_move({
        stacks_to_remove: [long_run],
        stacks_to_add: [left, right],
    });
    assert.strictEqual(err, undefined, `Split should be valid: ${err?.message}`);
}

// --- Test: stages are independent ---

function test_stages_are_independent() {
    const valid_run = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
    ], { top: 10, left: 10 });

    const r = ref([valid_run]);

    // Replace with bogus — protocol and geometry are fine,
    // semantics should catch it.
    const bogus = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        fresh(CardValue.FIVE, Suit.DIAMOND),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [valid_run],
        stacks_to_add: [bogus],
        hand_cards_played: [
            hc(CardValue.FIVE, Suit.DIAMOND),
            hc(CardValue.KING, Suit.HEART),
        ],
    });
    assert.ok(err !== undefined, "Should be rejected");
    assert.strictEqual(err!.stage, "semantics",
        `Should fail at semantics, not ${err!.stage}: ${err!.message}`);
}

// --- Inventory tests ---

// Card appears on board with no source (not from hand, not rearranged).
function test_inventory_rejects_card_from_nowhere() {
    const r = ref();

    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    // Declare only 2 hand cards but place 3 on the board.
    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
            // 3H missing — where did it come from?
        ],
    });
    assert.ok(err !== undefined, "Should reject card from nowhere");
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("no source"), err!.message);
}

// Hand card declared but never placed.
function test_inventory_rejects_unplaced_hand_card() {
    const r = ref();

    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    // Declare 4 hand cards but only 3 go on the board.
    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.TWO, Suit.HEART),
            hc(CardValue.THREE, Suit.HEART),
            hc(CardValue.FOUR, Suit.HEART),  // never placed
        ],
    });
    assert.ok(err !== undefined, "Should reject unplaced hand card");
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("not placed"), err!.message);
}

// Valid rearrangement: no hand cards, just moving board cards around.
function test_inventory_allows_rearrangement() {
    const run = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
        bc(CardValue.FOUR, Suit.CLUB),
        bc(CardValue.FIVE, Suit.CLUB),
        bc(CardValue.SIX, Suit.CLUB),
    ], { top: 10, left: 10 });

    const r = ref([run]);

    // Split into two runs — pure rearrangement, no hand cards.
    const left = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
    ], { top: 10, left: 10 });

    const right = new CardStack([
        bc(CardValue.FOUR, Suit.CLUB),
        bc(CardValue.FIVE, Suit.CLUB),
        bc(CardValue.SIX, Suit.CLUB),
    ], { top: 10, left: 200 });

    const err = r.apply_move({
        stacks_to_remove: [run],
        stacks_to_add: [left, right],
    });
    assert.strictEqual(err, undefined, `Rearrangement should be valid: ${err?.message}`);
}

// Duplicate card on board after move.
function test_inventory_rejects_board_duplicate() {
    const run = new CardStack([
        bc(CardValue.ACE, Suit.HEART),
        bc(CardValue.TWO, Suit.HEART),
        bc(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const r = ref([run]);

    // Add a set that includes AH — but AH is already on the board
    // in the run. The move doesn't remove the run, so AH is duplicated.
    const set_with_dup = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),  // duplicate of board AH!
        fresh(CardValue.ACE, Suit.CLUB),
        fresh(CardValue.ACE, Suit.DIAMOND),
    ], { top: 60, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [set_with_dup],
        hand_cards_played: [
            hc(CardValue.ACE, Suit.HEART),
            hc(CardValue.ACE, Suit.CLUB),
            hc(CardValue.ACE, Suit.DIAMOND),
        ],
    });
    assert.ok(err !== undefined, "Should reject board duplicate");
    assert.strictEqual(err!.stage, "inventory");
    assert.ok(err!.message.includes("duplicate"), err!.message);
}

// No hand_cards_played means pure board rearrangement —
// all added cards must come from removed stacks.
function test_inventory_rejects_new_cards_without_hand() {
    const r = ref();

    // Try to place cards on an empty board with no hand declaration.
    const run = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = r.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [run],
        // no hand_cards_played — where did these come from?
    });
    assert.ok(err !== undefined, "Should reject cards from nowhere");
    assert.strictEqual(err!.stage, "inventory");
}

// --- Run all ---

test_valid_game_sequence();
test_protocol_rejects_bad_json();
test_geometry_rejects_overlap();
test_geometry_rejects_out_of_bounds();
test_semantics_rejects_bogus();
test_semantics_rejects_incomplete();
test_semantics_rejects_dup_set();
test_split_through_pipeline();
test_stages_are_independent();
test_inventory_rejects_card_from_nowhere();
test_inventory_rejects_unplaced_hand_card();
test_inventory_allows_rearrangement();
test_inventory_rejects_board_duplicate();
test_inventory_rejects_new_cards_without_hand();

console.log("pipeline: all tests passed");
