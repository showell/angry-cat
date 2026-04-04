import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import { CardStackType } from "./stack_type";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    type BoardLocation,
} from "./card_stack";
import { Score } from "./score";

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

// for_stack: score = (size - 2) * type_value
{
    // 3-card pure run: (3-2) * 100 = 100
    assert.equal(Score.for_stack(stack_from("AH", "2H", "3H")), 100);

    // 4-card pure run: (4-2) * 100 = 200
    assert.equal(Score.for_stack(stack_from("AH", "2H", "3H", "4H")), 200);

    // 3-card set: (3-2) * 60 = 60
    assert.equal(Score.for_stack(stack_from("7S", "7D", "7C")), 60);

    // 3-card red/black run: (3-2) * 50 = 50
    assert.equal(Score.for_stack(stack_from("AH", "2S", "3H")), 50);

    // incomplete (2 cards): (2-2) * 100 = 0
    assert.equal(Score.for_stack(stack_from("AH", "2H")), 0);
}

// for_stacks
{
    const stacks = [
        stack_from("AH", "2H", "3H"), // 100
        stack_from("7S", "7D", "7C"), // 60
        stack_from("AH", "2S", "3H"), // 50
    ];
    assert.equal(Score.for_stacks(stacks), 210);

    assert.equal(Score.for_stacks([]), 0);
}

// for_cards_played
{
    assert.equal(Score.for_cards_played(0), 0);

    // 1 card: 200 + 100*1*1 = 300
    assert.equal(Score.for_cards_played(1), 300);

    // 2 cards: 200 + 100*2*2 = 600
    assert.equal(Score.for_cards_played(2), 600);

    // 3 cards: 200 + 100*3*3 = 1100
    assert.equal(Score.for_cards_played(3), 1100);
}

console.log("All score tests passed.");
