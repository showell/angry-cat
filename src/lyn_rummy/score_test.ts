import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import {
    BoardCard,
    BoardCardState,
    type BoardLocation,
    CardStack,
} from "./card_stack";
import { Score } from "./score";
import { CardStackType } from "./stack_type";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };

function stack_from(...labels: string[]): CardStack {
    const board_cards = labels.map(
        (label) =>
            new BoardCard(Card.from(label, D1), BoardCardState.FIRMLY_ON_BOARD),
    );
    return new CardStack(board_cards, loc);
}

// stack_type_value
{
    assert.equal(Score.stack_type_value(CardStackType.PURE_RUN), 100);
    assert.equal(Score.stack_type_value(CardStackType.SET), 60);
    assert.equal(Score.stack_type_value(CardStackType.RED_BLACK_RUN), 50);
    assert.equal(Score.stack_type_value(CardStackType.INCOMPLETE), 0);
    assert.equal(Score.stack_type_value(CardStackType.BOGUS), 0);
    assert.equal(Score.stack_type_value(CardStackType.DUP), 0);
}

// for_stack: score = size * type_value (flat per-card)
{
    // 3-card pure run: 3 * 100 = 300
    assert.equal(Score.for_stack(stack_from("AH", "2H", "3H")), 300);

    // 4-card pure run: 4 * 100 = 400
    assert.equal(Score.for_stack(stack_from("AH", "2H", "3H", "4H")), 400);

    // 3-card set: 3 * 60 = 180
    assert.equal(Score.for_stack(stack_from("7S", "7D", "7C")), 180);

    // 3-card red/black run: 3 * 50 = 150
    assert.equal(Score.for_stack(stack_from("AH", "2S", "3H")), 150);

    // 2-card incomplete pair: type is INCOMPLETE so type_value
    // is 0. The flat formula still yields 0 for non-valid families.
    assert.equal(Score.for_stack(stack_from("AH", "2H")), 0);
}

// for_stacks
{
    const stacks = [
        stack_from("AH", "2H", "3H"), // 300
        stack_from("7S", "7D", "7C"), // 180
        stack_from("AH", "2S", "3H"), // 150
    ];
    assert.equal(Score.for_stacks(stacks), 630);

    assert.equal(Score.for_stacks([]), 0);
}

// Splits are free under the flat formula. Splitting a 6-pure-run
// into two 3-pure-runs preserves the total score because the
// number of cards in valid families is unchanged.
{
    const long_run = Score.for_stack(
        stack_from("AH", "2H", "3H", "4H", "5H", "6H"),
    );
    const split = Score.for_stacks([
        stack_from("AH", "2H", "3H"),
        stack_from("4H", "5H", "6H"),
    ]);
    assert.equal(long_run, 600);
    assert.equal(split, 600);
}

// for_cards_played
{
    assert.equal(Score.for_cards_played(-1), 0);
    assert.equal(Score.for_cards_played(0), 0);

    // 1 card: 200 + 100*1*1 = 300
    assert.equal(Score.for_cards_played(1), 300);

    // 2 cards: 200 + 100*2*2 = 600
    assert.equal(Score.for_cards_played(2), 600);

    // 3 cards: 200 + 100*3*3 = 1100
    assert.equal(Score.for_cards_played(3), 1100);
}

// The same 9 cards arranged as three pure runs vs three sets.
// A/2/3 of hearts, spades, diamonds can go either way.
{
    const runs_score = Score.for_stacks([
        stack_from("AH", "2H", "3H"),
        stack_from("AS", "2S", "3S"),
        stack_from("AD", "2D", "3D"),
    ]);

    const sets_score = Score.for_stacks([
        stack_from("AH", "AS", "AD"),
        stack_from("2H", "2S", "2D"),
        stack_from("3H", "3S", "3D"),
    ]);

    assert.equal(runs_score, 900); // 3 * 3 * 100
    assert.equal(sets_score, 540); // 3 * 3 * 60
    assert.ok(runs_score > sets_score, "pure runs should outscore sets");
}

console.log("All score tests passed.");
