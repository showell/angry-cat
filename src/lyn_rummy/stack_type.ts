import { type Card, CardValue, is_pair_of_dups } from "./card";

export enum CardStackType {
    INCOMPLETE = "incomplete",
    BOGUS = "bogus",
    DUP = "dup",
    SET = "set",
    PURE_RUN = "pure run",
    RED_BLACK_RUN = "red/black alternating",
}

function successor(val: CardValue): CardValue {
    // This is hopefully straightforward code.  Note
    // K, A, 2 is a valid run in LynRummy, because
    // KING has ACE as its successor and ACE has TWO
    // as its successor.
    switch (val) {
        case CardValue.ACE:
            return CardValue.TWO;
        case CardValue.TWO:
            return CardValue.THREE;
        case CardValue.THREE:
            return CardValue.FOUR;
        case CardValue.FOUR:
            return CardValue.FIVE;
        case CardValue.FIVE:
            return CardValue.SIX;
        case CardValue.SIX:
            return CardValue.SEVEN;
        case CardValue.SEVEN:
            return CardValue.EIGHT;
        case CardValue.EIGHT:
            return CardValue.NINE;
        case CardValue.NINE:
            return CardValue.TEN;
        case CardValue.TEN:
            return CardValue.JACK;
        case CardValue.JACK:
            return CardValue.QUEEN;
        case CardValue.QUEEN:
            return CardValue.KING;
        case CardValue.KING:
            return CardValue.ACE;
    }
}

function card_pair_stack_type(card1: Card, card2: Card): CardStackType {
    // See if the pair is a promising start to a stack.
    // Do not return INCOMPLETE here. It's obviously
    // not complete in this context, and our caller will
    // understand that.

    if (is_pair_of_dups(card1, card2)) {
        return CardStackType.DUP;
    }

    if (card1.value === card2.value) {
        return CardStackType.SET;
    }

    // Order is important for the successor check!
    if (card2.value === successor(card1.value)) {
        if (card1.suit === card2.suit) {
            return CardStackType.PURE_RUN;
        } else if (card1.color !== card2.color) {
            return CardStackType.RED_BLACK_RUN;
        }
    }
    return CardStackType.BOGUS;
}

function has_duplicate_cards(cards: Card[]): boolean {
    function any_dup_card(card: Card, rest: Card[]): boolean {
        if (rest.length === 0) {
            return false;
        }
        if (is_pair_of_dups(card, rest[0])) {
            return true;
        }
        return any_dup_card(card, rest.slice(1));
    }

    if (cards.length <= 1) {
        return false;
    }

    return (
        any_dup_card(cards[0], cards.slice(1)) ||
        has_duplicate_cards(cards.slice(1))
    );
}

function follows_consistent_pattern(
    cards: Card[],
    stack_type: CardStackType,
): boolean {
    if (cards.length <= 1) {
        return true;
    }

    if (card_pair_stack_type(cards[0], cards[1]) !== stack_type) {
        return false;
    }

    return follows_consistent_pattern(cards.slice(1), stack_type);
}

export function get_stack_type(cards: Card[]): CardStackType {
    /*
        THIS IS THE MOST IMPORTANT FUNCTION OF THE GAME.

        This determines the whole logic of Lyn Rummy.

        You have to have valid, complete stacks, and
        sets can have no dups!
    */
    if (cards.length <= 1) {
        return CardStackType.INCOMPLETE;
    }

    const provisional_stack_type = card_pair_stack_type(cards[0], cards[1]);

    if (provisional_stack_type === CardStackType.BOGUS) {
        return CardStackType.BOGUS;
    }

    if (provisional_stack_type === CardStackType.DUP) {
        return CardStackType.DUP;
    }

    if (cards.length === 2) {
        return CardStackType.INCOMPLETE;
    }

    // Prevent dups within a provisional SET.
    if (provisional_stack_type === CardStackType.SET) {
        if (has_duplicate_cards(cards)) {
            return CardStackType.DUP;
        }
    }

    // Prevent mixing up types of stacks.
    if (!follows_consistent_pattern(cards, provisional_stack_type)) {
        return CardStackType.BOGUS;
    }

    // HAPPY PATH! We have a stack that can stay on the board!
    return provisional_stack_type;
}
