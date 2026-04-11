// End-to-end validation pipeline test.
//
// Simulates machine-to-machine play: moves are serialized to JSON,
// then validated through all three pipeline stages:
//
//   1. Protocol  — is the JSON well-formed?
//   2. Geometry  — do stacks fit without illegal overlap?
//   3. Semantics — are all stacks valid card groups?
//
// This is the referee. Two competing agents would both submit
// moves through this pipeline; the referee doesn't care who's
// playing, only that the moves are legal.

import * as assert from "assert";
import { Card, CardValue, OriginDeck, Suit } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack,
    type JsonCardStack,
} from "../core/card_stack";
import { validate_move } from "./protocol_validation";
import { GeometryReplay, type CardStackMove } from "./geometry_replay";
import { SemanticReplay } from "./semantic_replay";
import { type BoardBounds } from "./board_geometry";

// --- Helpers ---

const bounds: BoardBounds = {
    max_width: 800,
    max_height: 600,
    margin: 5,
};

function bc(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(new Card(value, suit, deck), BoardCardState.FIRMLY_ON_BOARD);
}

function fresh(value: CardValue, suit: Suit, deck: OriginDeck = OriginDeck.DECK_ONE): BoardCard {
    return new BoardCard(new Card(value, suit, deck), BoardCardState.FRESHLY_PLAYED);
}

// --- The pipeline ---
//
// Takes a move as CardStackMove, serializes to JSON, validates
// through all three stages, and applies it to both replay engines.

class GameReferee {
    geo: GeometryReplay;
    sem: SemanticReplay;
    move_count: number;

    constructor(initial_board: CardStack[]) {
        this.geo = new GeometryReplay(bounds, initial_board);
        this.sem = new SemanticReplay(initial_board);
        this.move_count = 0;
    }

    // Returns error string if any stage rejects, or undefined if valid.
    apply_move(move: CardStackMove): string | undefined {
        this.move_count++;

        // Stage 1: Protocol — validate the JSON shape.
        const json_move = {
            stacks_to_remove: move.stacks_to_remove.map(s => s.toJSON()),
            stacks_to_add: move.stacks_to_add.map(s => s.toJSON()),
        };
        const protocol_errors = validate_move(json_move);
        if (protocol_errors.length > 0) {
            const detail = protocol_errors.map(e => `${e.path}: ${e.message}`).join("; ");
            return `protocol: ${detail}`;
        }

        // Stage 2: Geometry — stacks fit on the board.
        this.geo.apply_move(move);
        if (!this.geo.is_valid()) {
            const latest = this.geo.errors[this.geo.errors.length - 1];
            return `geometry: ${latest.message}`;
        }

        // Stage 3: Semantics — all stacks are valid card groups.
        this.sem.apply_move(move);
        if (!this.sem.is_valid()) {
            const latest = this.sem.errors[this.sem.errors.length - 1];
            return `semantics: ${latest.message}`;
        }

        return undefined;
    }
}

// --- Test: valid game sequence ---
//
// A short game: two players take turns placing cards from hand
// onto the board. Every move goes through the full pipeline.

function test_valid_game_sequence() {
    // Initial board: one pure run and one set.
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

    const ref = new GameReferee([run, set]);

    // Move 1: extend the run with 8H.
    const extended_run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.EIGHT, Suit.HEART),
    ], { top: 10, left: 10 });

    let err = ref.apply_move({
        stacks_to_remove: [run],
        stacks_to_add: [extended_run],
    });
    assert.strictEqual(err, undefined, `Move 1 should be valid: ${err}`);

    // Move 2: extend the set with KH.
    const extended_set = new CardStack([
        bc(CardValue.KING, Suit.CLUB),
        bc(CardValue.KING, Suit.DIAMOND),
        bc(CardValue.KING, Suit.SPADE),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 200 });

    err = ref.apply_move({
        stacks_to_remove: [set],
        stacks_to_add: [extended_set],
    });
    assert.strictEqual(err, undefined, `Move 2 should be valid: ${err}`);

    // Move 3: place a new stack (3-card pure run).
    const new_run = new CardStack([
        fresh(CardValue.ACE, Suit.SPADE),
        fresh(CardValue.TWO, Suit.SPADE),
        fresh(CardValue.THREE, Suit.SPADE),
    ], { top: 60, left: 10 });

    err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [new_run],
    });
    assert.strictEqual(err, undefined, `Move 3 should be valid: ${err}`);

    // Move 4: rearrange — move the set to a new position.
    const moved_set = new CardStack(
        extended_set.board_cards,
        { top: 60, left: 200 },
    );

    err = ref.apply_move({
        stacks_to_remove: [extended_set],
        stacks_to_add: [moved_set],
    });
    assert.strictEqual(err, undefined, `Move 4 should be valid: ${err}`);

    assert.strictEqual(ref.move_count, 4);
}

// --- Test: protocol rejects malformed JSON ---

function test_protocol_rejects_bad_json() {
    const run = new CardStack([
        bc(CardValue.FIVE, Suit.HEART),
        bc(CardValue.SIX, Suit.HEART),
        bc(CardValue.SEVEN, Suit.HEART),
    ], { top: 10, left: 10 });

    const ref = new GameReferee([run]);

    // Craft a move with a bad card (suit out of range).
    const bad_stack: JsonCardStack = {
        board_cards: [{
            card: { value: 5, suit: 99 as any, origin_deck: 0 },
            state: BoardCardState.FRESHLY_PLAYED,
        }],
        loc: { top: 60, left: 10 },
    };

    // Feed raw JSON through protocol validation.
    const json_move = {
        stacks_to_remove: [],
        stacks_to_add: [bad_stack],
    };
    const errors = validate_move(json_move);
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

    const ref = new GameReferee([stack1]);

    // Place a new stack directly on top of the existing one.
    const overlapping = new CardStack([
        fresh(CardValue.SEVEN, Suit.CLUB),
        fresh(CardValue.SEVEN, Suit.DIAMOND),
        fresh(CardValue.SEVEN, Suit.SPADE),
    ], { top: 10, left: 10 });

    const err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [overlapping],
    });
    assert.ok(err !== undefined, "Should reject overlap");
    assert.ok(err!.startsWith("geometry:"), `Expected geometry error: ${err}`);
}

// --- Test: geometry rejects out of bounds ---

function test_geometry_rejects_out_of_bounds() {
    const ref = new GameReferee([]);

    const off_board = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
        fresh(CardValue.THREE, Suit.HEART),
    ], { top: 10, left: 900 });  // right edge exceeds max_width=800

    const err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [off_board],
    });
    assert.ok(err !== undefined, "Should reject out of bounds");
    assert.ok(err!.startsWith("geometry:"), `Expected geometry error: ${err}`);
}

// --- Test: semantics rejects bogus stack ---

function test_semantics_rejects_bogus() {
    const ref = new GameReferee([]);

    // Three cards that don't form a valid run or set.
    const bogus = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.FIVE, Suit.CLUB),
        fresh(CardValue.KING, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [bogus],
    });
    assert.ok(err !== undefined, "Should reject bogus stack");
    assert.ok(err!.startsWith("semantics:"), `Expected semantics error: ${err}`);
}

// --- Test: semantics rejects incomplete stack ---

function test_semantics_rejects_incomplete() {
    const ref = new GameReferee([]);

    // Only 2 cards — valid run pattern but too short.
    const incomplete = new CardStack([
        fresh(CardValue.ACE, Suit.HEART),
        fresh(CardValue.TWO, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [incomplete],
    });
    assert.ok(err !== undefined, "Should reject incomplete stack");
    assert.ok(err!.startsWith("semantics:"), `Expected semantics error: ${err}`);
}

// --- Test: semantics rejects duplicate cards in set ---

function test_semantics_rejects_dup_set() {
    const ref = new GameReferee([]);

    // Same card twice (same suit + same deck) in a "set".
    const dup_set = new CardStack([
        fresh(CardValue.SEVEN, Suit.HEART),
        fresh(CardValue.SEVEN, Suit.HEART),  // duplicate!
        fresh(CardValue.SEVEN, Suit.CLUB),
    ], { top: 10, left: 10 });

    const err = ref.apply_move({
        stacks_to_remove: [],
        stacks_to_add: [dup_set],
    });
    assert.ok(err !== undefined, "Should reject dup set");
    assert.ok(err!.startsWith("semantics:"), `Expected semantics error: ${err}`);
}

// --- Test: multi-move game with split ---
//
// Start with a 5-card run, split it into two valid stacks.

function test_split_through_pipeline() {
    const long_run = new CardStack([
        bc(CardValue.THREE, Suit.DIAMOND),
        bc(CardValue.FOUR, Suit.DIAMOND),
        bc(CardValue.FIVE, Suit.DIAMOND),
        bc(CardValue.SIX, Suit.DIAMOND),
        bc(CardValue.SEVEN, Suit.DIAMOND),
        bc(CardValue.EIGHT, Suit.DIAMOND),
    ], { top: 10, left: 10 });

    const ref = new GameReferee([long_run]);

    // Split into 3D-4D-5D and 6D-7D-8D.
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

    const err = ref.apply_move({
        stacks_to_remove: [long_run],
        stacks_to_add: [left, right],
    });
    assert.strictEqual(err, undefined, `Split should be valid: ${err}`);
}

// --- Test: pipeline catches each stage independently ---
//
// Verify that a move can pass protocol + geometry but fail semantics,
// proving the stages are independent.

function test_stages_are_independent() {
    const valid_run = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        bc(CardValue.TWO, Suit.CLUB),
        bc(CardValue.THREE, Suit.CLUB),
    ], { top: 10, left: 10 });

    const ref = new GameReferee([valid_run]);

    // Replace the valid run with a bogus stack at a valid location.
    // Protocol: OK (well-formed JSON).
    // Geometry: OK (valid position, no overlap).
    // Semantics: FAIL (A-5-K is bogus).
    const bogus = new CardStack([
        bc(CardValue.ACE, Suit.CLUB),
        fresh(CardValue.FIVE, Suit.DIAMOND),
        fresh(CardValue.KING, Suit.HEART),
    ], { top: 10, left: 10 });

    const err = ref.apply_move({
        stacks_to_remove: [valid_run],
        stacks_to_add: [bogus],
    });
    assert.ok(err !== undefined, "Should be rejected");
    assert.ok(err!.startsWith("semantics:"),
        `Should fail at semantics stage, not earlier: ${err}`);
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

console.log("pipeline: all tests passed");
