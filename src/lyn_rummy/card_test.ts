import assert from "node:assert/strict";
import {
    all_suits,
    build_full_double_deck,
    Card,
    CardColor,
    CardValue,
    is_pair_of_dups,
    OriginDeck,
    Suit,
    suit_emoji_str,
    value_str,
} from "./card";

// value_str
{
    assert.equal(value_str(CardValue.ACE), "A");
    assert.equal(value_str(CardValue.TEN), "T");
    assert.equal(value_str(CardValue.JACK), "J");
    assert.equal(value_str(CardValue.QUEEN), "Q");
    assert.equal(value_str(CardValue.KING), "K");
    assert.equal(value_str(CardValue.TWO), "2");
}

// suit_emoji_str
{
    assert.equal(suit_emoji_str(Suit.CLUB), "\u2663");
    assert.equal(suit_emoji_str(Suit.DIAMOND), "\u2666");
    assert.equal(suit_emoji_str(Suit.HEART), "\u2665");
    assert.equal(suit_emoji_str(Suit.SPADE), "\u2660");
}

// Card construction, str, from, equals, clone, JSON roundtrip
{
    const ace_of_hearts = new Card(
        CardValue.ACE,
        Suit.HEART,
        OriginDeck.DECK_ONE,
    );
    assert.equal(ace_of_hearts.value, CardValue.ACE);
    assert.equal(ace_of_hearts.suit, Suit.HEART);
    assert.equal(ace_of_hearts.color, CardColor.RED);
    assert.equal(ace_of_hearts.origin_deck, OriginDeck.DECK_ONE);
    assert.equal(ace_of_hearts.str(), "A\u2665");

    const two_of_spades = new Card(
        CardValue.TWO,
        Suit.SPADE,
        OriginDeck.DECK_ONE,
    );
    assert.equal(two_of_spades.color, CardColor.BLACK);
    assert.equal(two_of_spades.str(), "2\u2660");

    const from_label = Card.from("AH", OriginDeck.DECK_ONE);
    assert.equal(from_label.value, CardValue.ACE);
    assert.equal(from_label.suit, Suit.HEART);

    const ten = Card.from("TC", OriginDeck.DECK_TWO);
    assert.equal(ten.value, CardValue.TEN);
    assert.equal(ten.suit, Suit.CLUB);

    const ace1 = new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_ONE);
    const ace2 = new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_TWO);
    const ace1b = new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_ONE);

    assert.ok(ace1.equals(ace1b));
    assert.ok(!ace1.equals(ace2)); // different origin deck
    assert.ok(!ace1.equals(two_of_spades));

    const clone = ace1.clone();
    assert.ok(ace1.equals(clone));
    assert.ok(clone !== ace1);

    const json = ace1.toJSON();
    assert.equal(json.value, CardValue.ACE);
    assert.equal(json.suit, Suit.HEART);
    assert.equal(json.origin_deck, OriginDeck.DECK_ONE);
    const roundtripped = Card.from_json(json);
    assert.ok(ace1.equals(roundtripped));
}

// is_pair_of_dups
{
    const ace_h1 = new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_ONE);
    const ace_h2 = new Card(CardValue.ACE, Suit.HEART, OriginDeck.DECK_TWO);
    const ace_s1 = new Card(CardValue.ACE, Suit.SPADE, OriginDeck.DECK_ONE);
    const two_h1 = new Card(CardValue.TWO, Suit.HEART, OriginDeck.DECK_ONE);

    assert.ok(is_pair_of_dups(ace_h1, ace_h2)); // same value+suit, different deck
    assert.ok(is_pair_of_dups(ace_h1, ace_h1)); // same value+suit, same deck — still a dup
    assert.ok(!is_pair_of_dups(ace_h1, ace_s1)); // different suit
    assert.ok(!is_pair_of_dups(ace_h1, two_h1)); // different value
}

// all_suits
{
    assert.equal(all_suits.length, 4);
    assert.ok(all_suits.includes(Suit.HEART));
    assert.ok(all_suits.includes(Suit.SPADE));
    assert.ok(all_suits.includes(Suit.DIAMOND));
    assert.ok(all_suits.includes(Suit.CLUB));
}

// build_full_double_deck
{
    function all_distinct(cards: Card[]): boolean {
        const seen = new Set<string>();
        for (const c of cards) {
            const key = `${c.value}-${c.suit}-${c.origin_deck}`;
            if (seen.has(key)) return false;
            seen.add(key);
        }
        return true;
    }

    const deck = build_full_double_deck();
    assert.equal(deck.length, 104); // 52 cards * 2 decks
    assert.ok(all_distinct(deck));

    // Deck is shuffled — almost certainly not in sorted order.
    // (With 104 cards the chance of a sorted deck is astronomically small.)
    const is_sorted = deck.every(
        (c, i) => i === 0 || deck[i - 1].value <= c.value,
    );
    assert.ok(!is_sorted, "deck should be shuffled");

    // Shuffling should not drop or duplicate any cards.
    assert.ok(all_distinct(deck));
}

console.log("All card tests passed.");
