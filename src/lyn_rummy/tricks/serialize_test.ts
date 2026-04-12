// Unit test for serialize_play — confirms the PlayRecord shape
// matches the Gopher endpoint's expectation.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, type CardValue } from "../core/card";
import { HandCard, HandCardState } from "../core/card_stack";
import type { Play, Trick } from "./trick";
import { serialize_play } from "./serialize";

const fake_trick: Trick = {
    id: "direct_play",
    description: "Play a hand card onto the end of a stack.",
    find_plays: () => [],
};

const hc = new HandCard(
    new Card(4 as CardValue, Suit.HEART, OriginDeck.DECK_ONE),
    HandCardState.NORMAL,
);

const play: Play = {
    trick: fake_trick,
    hand_cards: [hc],
    apply: () => [hc],
};

const record = serialize_play(
    play,
    /* player */ 1,
    /* description */ "Play 4♥ onto the heart run.",
    /* board_event */ {
        stacks_to_remove: [],
        stacks_to_add: [],
    },
);

assert.equal(record.trick_id, "direct_play");
assert.equal(record.description, "Play 4♥ onto the heart run.");
assert.equal(record.player, 1);
assert.equal(record.hand_cards.length, 1);
assert.equal(record.hand_cards[0].value, 4);
assert.equal(record.hand_cards[0].suit, Suit.HEART);
assert.equal(record.hand_cards[0].origin_deck, OriginDeck.DECK_ONE);
assert.deepEqual(record.board_cards, []);
assert.equal(record.detail, null);
assert.deepEqual(record.board_event.stacks_to_remove, []);
assert.deepEqual(record.board_event.stacks_to_add, []);

// JSON-round-trip check — matches what POST to Gopher will send.
const round = JSON.parse(JSON.stringify(record));
assert.equal(round.trick_id, "direct_play");
assert.equal(round.hand_cards[0].value, 4);

console.log("All serialize_play tests passed.");
