import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function cards(...labels: string[]): Card[] {
    return labels.map((label) => Card.from(label, D1));
}

// too few cards
{
    assert.equal(get_stack_type([]), CardStackType.INCOMPLETE);
    assert.equal(get_stack_type(cards("AH")), CardStackType.INCOMPLETE);
    assert.equal(get_stack_type(cards("AH", "2H")), CardStackType.INCOMPLETE);
}

// pure run (same suit, sequential)
{
    assert.equal(
        get_stack_type(cards("AH", "2H", "3H")),
        CardStackType.PURE_RUN,
    );
    assert.equal(
        get_stack_type(cards("TD", "JD", "QD", "KD")),
        CardStackType.PURE_RUN,
    );

    // K wraps to A in Lyn Rummy
    assert.equal(
        get_stack_type(cards("KS", "AS", "2S")),
        CardStackType.PURE_RUN,
    );
}

// red/black alternating run
{
    assert.equal(
        get_stack_type(cards("AH", "2S", "3H")),
        CardStackType.RED_BLACK_RUN,
    );
    assert.equal(
        get_stack_type(cards("AC", "2H", "3C", "4H")),
        CardStackType.RED_BLACK_RUN,
    );
}

// set (same value, different suits, no dups)
{
    assert.equal(get_stack_type(cards("7S", "7D", "7C")), CardStackType.SET);
    assert.equal(
        get_stack_type(cards("AC", "AD", "AH", "AS")),
        CardStackType.SET,
    );
}

// dup (same value and suit)
{
    // two copies of same card from different decks
    const ace_h1 = Card.from("AH", D1);
    const ace_h2 = Card.from("AH", D2);
    assert.equal(get_stack_type([ace_h1, ace_h2]), CardStackType.DUP);

    // set that contains a dup
    const seven_s1 = Card.from("7S", D1);
    const seven_s2 = Card.from("7S", D2);
    const seven_d = Card.from("7D", D1);
    assert.equal(
        get_stack_type([seven_s1, seven_s2, seven_d]),
        CardStackType.DUP,
    );
}

// bogus (inconsistent or invalid)
{
    // wrong order for a run
    assert.equal(get_stack_type(cards("3H", "2H", "AH")), CardStackType.BOGUS);

    // mixed stack types
    assert.equal(get_stack_type(cards("AH", "2H", "3D")), CardStackType.BOGUS);

    // same value but mixing set and run
    assert.equal(get_stack_type(cards("AH", "2H", "2D")), CardStackType.BOGUS);
}

console.log("All stack_type tests passed.");
