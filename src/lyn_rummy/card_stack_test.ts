import assert from "node:assert/strict";
import { Card, OriginDeck } from "./card";
import { CardStackType } from "./stack_type";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    HandCard,
    HandCardState,
    type BoardLocation,
    type DeckRef,
} from "./card_stack";

const D1 = OriginDeck.DECK_ONE;
const loc: BoardLocation = { top: 0, left: 0 };

function stack_from(...labels: string[]): CardStack {
    const board_cards = labels.map(
        (label) =>
            new BoardCard(Card.from(label, D1), BoardCardState.FIRMLY_ON_BOARD),
    );
    return new CardStack(board_cards, loc);
}

// CardStack.stack_type
{
    assert.equal(stack_from("AH").stack_type, CardStackType.INCOMPLETE);
    assert.equal(stack_from("AH", "2H").stack_type, CardStackType.INCOMPLETE);
    assert.equal(
        stack_from("AH", "2H", "3H").stack_type,
        CardStackType.PURE_RUN,
    );
    assert.equal(
        stack_from("AH", "2S", "3H").stack_type,
        CardStackType.RED_BLACK_RUN,
    );
    assert.equal(stack_from("7S", "7D", "7C").stack_type, CardStackType.SET);
}

// incomplete / problematic
{
    assert.ok(stack_from("AH").incomplete());
    assert.ok(!stack_from("AH", "2H", "3H").incomplete());

    const board_cards = [
        new BoardCard(Card.from("AH", D1), BoardCardState.FIRMLY_ON_BOARD),
        new BoardCard(
            Card.from("AH", OriginDeck.DECK_TWO),
            BoardCardState.FIRMLY_ON_BOARD,
        ),
    ];
    const dup = new CardStack(board_cards, loc);
    assert.ok(dup.problematic());
    assert.ok(!stack_from("AH", "2H", "3H").problematic());
}

// str and equals
{
    const s1 = stack_from("AH", "2H", "3H");
    const s2 = stack_from("AH", "2H", "3H");
    const s3 = stack_from("AH", "2H", "3D");

    assert.equal(s1.str(), "A\u2665,2\u2665,3\u2665");
    assert.ok(s1.equals(s2));
    assert.ok(!s1.equals(s3));

    // same cards, different location — not equal
    const s4 = new CardStack(s1.board_cards, { top: 10, left: 20 });
    assert.ok(!s1.equals(s4));
}

// clone
{
    const original = stack_from("AH", "2H", "3H");
    const clone = original.clone();
    assert.ok(original.equals(clone));
    assert.ok(original !== clone);
}

// JSON roundtrip
{
    const original = stack_from("7S", "7D", "7C");
    const json = original.toJSON();
    const restored = CardStack.from_json(json);
    assert.ok(original.equals(restored));
}

// pull_from_deck via DeckRef
{
    const pulled: Card[] = [];
    const fake_deck: DeckRef = {
        pull_card_from_deck(card: Card) {
            pulled.push(card);
        },
    };

    const stack = CardStack.pull_from_deck("AH,2H,3H", D1, loc, fake_deck);
    assert.equal(stack.board_cards.length, 3);
    assert.equal(pulled.length, 3);
    assert.equal(stack.stack_type, CardStackType.PURE_RUN);
}

// from_hand_card
{
    const hand_card = new HandCard(Card.from("KD", D1), HandCardState.NORMAL);
    const stack = CardStack.from_hand_card(hand_card, loc);
    assert.equal(stack.size(), 1);
    assert.equal(stack.board_cards[0].state, BoardCardState.FRESHLY_PLAYED);
}

// aged_from_prior_turn
{
    const fresh = new BoardCard(
        Card.from("AH", D1),
        BoardCardState.FRESHLY_PLAYED,
    );
    const stack = new CardStack([fresh], loc);
    const aged = CardStack.aged_from_prior_turn(stack);
    assert.equal(
        aged.board_cards[0].state,
        BoardCardState.FRESHLY_PLAYED_BY_LAST_PLAYER,
    );
}

// maybe_merge
{
    const left = stack_from("AH", "2H");
    const right = stack_from("3H", "4H");
    const merged = CardStack.maybe_merge(left, right, loc);
    assert.ok(merged !== undefined);
    assert.equal(merged!.stack_type, CardStackType.PURE_RUN);
    assert.equal(merged!.size(), 4);

    // merging a stack with itself fails
    assert.equal(CardStack.maybe_merge(left, left, loc), undefined);

    // merging into a bogus stack fails
    const bogus_merge = CardStack.maybe_merge(
        stack_from("AH", "2H"),
        stack_from("KS"),
        loc,
    );
    assert.equal(bogus_merge, undefined);
}

console.log("All card_stack tests passed.");
