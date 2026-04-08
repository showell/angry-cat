// Simulation test — play through the entire fixed deck, trying to
// place every card on the board. Measures hint quality and performance.
//
// A good player can usually play most or all cards. The simulation
// alternates between two virtual players (though both share the same
// hint engine). Each turn: play as many cards as possible using the
// hint cascade, then draw according to the rules.

import assert from "node:assert/strict";
import { value_str } from "./card";
import {
    BoardCard,
    BoardCardState,
    CardStack,
    HandCard,
    HandCardState,
    type BoardLocation,
} from "./card_stack";
import { get_hint, HintLevel } from "./hints";
import { get_test_deck } from "./test_deck";

const loc: BoardLocation = { top: 0, left: 0 };
const suit_letter: Record<number, string> = { 0: "C", 1: "D", 2: "S", 3: "H" };

function card_str(hc: HandCard): string {
    return value_str(hc.card.value) + suit_letter[hc.card.suit];
}

// --- Verify the test deck ---

{
    const deck = get_test_deck();
    assert.equal(deck.length, 104);

    const counts = new Map<string, number>();
    for (const card of deck) {
        const key = value_str(card.value) + suit_letter[card.suit];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
        assert.equal(count, 2, `expected 2 of ${key}, got ${count}`);
    }
    assert.equal(counts.size, 52);
}

// --- Full game simulation ---

{
    const deck = get_test_deck();
    let deck_index = 0;

    function draw(n: number): HandCard[] {
        const cards: HandCard[] = [];
        for (let i = 0; i < n && deck_index < deck.length; i++) {
            cards.push(new HandCard(deck[deck_index++], HandCardState.NORMAL));
        }
        return cards;
    }

    let hand = draw(15);
    let board: CardStack[] = [];
    let total_cards_played = 0;
    let total_turns = 0;
    let total_draws = 0;
    let times_stuck = 0;
    let hand_empties = 0;
    let max_hint_ms = 0;
    let total_hint_ms = 0;
    let hint_calls = 0;

    const HINT_TIMEOUT_MS = 200;
    const MAX_TURNS = 200; // safety valve

    const game_start = performance.now();

    while (total_turns < MAX_TURNS) {
        total_turns++;
        let played_this_turn = 0;

        // Play as many cards as possible this turn.
        let keep_going = true;
        while (keep_going && hand.length > 0) {
            keep_going = false;

            const hint_start = performance.now();
            const hint = get_hint(hand, board);
            const hint_ms = performance.now() - hint_start;
            total_hint_ms += hint_ms;
            hint_calls++;
            if (hint_ms > max_hint_ms) max_hint_ms = hint_ms;

            switch (hint.level) {
                case HintLevel.HAND_STACKS: {
                    const hs = hint.hand_stacks[0];
                    const board_cards = hs.cards.map(
                        (hc) => new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED),
                    );
                    board.push(new CardStack(board_cards, loc));
                    const played_set = new Set(hs.cards);
                    hand = hand.filter((hc) => !played_set.has(hc));
                    played_this_turn += hs.cards.length;
                    keep_going = true;
                    break;
                }

                case HintLevel.DIRECT_PLAY: {
                    const hc = hint.playable_cards[0];
                    const single = CardStack.from_hand_card(hc, loc);
                    for (let i = 0; i < board.length; i++) {
                        const merged =
                            board[i].left_merge(single) ??
                            board[i].right_merge(single);
                        if (merged) {
                            board[i] = merged;
                            break;
                        }
                    }
                    hand = hand.filter((h) => h !== hc);
                    played_this_turn += 1;
                    keep_going = true;
                    break;
                }

                case HintLevel.LOOSE_CARD_PLAY: {
                    const play = hint.plays[0];
                    board = play.resulting_board;
                    const hc = play.playable_cards[0];
                    const single = CardStack.from_hand_card(hc, loc);
                    for (let i = 0; i < board.length; i++) {
                        const merged =
                            board[i].left_merge(single) ??
                            board[i].right_merge(single);
                        if (merged) {
                            board[i] = merged;
                            break;
                        }
                    }
                    hand = hand.filter((h) => h !== hc);
                    played_this_turn += 1;
                    keep_going = true;
                    break;
                }

                case HintLevel.NO_MOVES:
                    break;
            }
        }

        total_cards_played += played_this_turn;

        // End-of-turn draw rules.
        if (played_this_turn === 0) {
            // Stuck — draw 3 penalty cards.
            const drawn = draw(3);
            hand = hand.concat(drawn);
            total_draws += drawn.length;
            times_stuck++;
        } else if (hand.length === 0) {
            // Emptied hand — draw 5 bonus cards.
            hand_empties++;
            const drawn = draw(5);
            hand = hand.concat(drawn);
            total_draws += drawn.length;
        }
        // Otherwise (played some but hand not empty): draw 0.

        // Game ends when deck is empty and hand is empty.
        if (deck_index >= deck.length && hand.length === 0) {
            break;
        }

        // Also end if deck is empty and we're stuck.
        if (deck_index >= deck.length && played_this_turn === 0) {
            break;
        }
    }

    const game_ms = performance.now() - game_start;
    const cards_on_board = board.reduce((sum, s) => sum + s.size(), 0);
    const cards_in_hand = hand.length;
    const cards_in_deck = deck.length - deck_index;
    const avg_hint_ms = hint_calls > 0 ? total_hint_ms / hint_calls : 0;

    console.log(`\nFull game simulation:`);
    console.log(`  Turns:          ${total_turns}`);
    console.log(`  Cards played:   ${total_cards_played} / ${deck.length}`);
    console.log(`  On board:       ${cards_on_board}`);
    console.log(`  In hand:        ${cards_in_hand}`);
    console.log(`  In deck:        ${cards_in_deck}`);
    console.log(`  Hand empties:   ${hand_empties}`);
    console.log(`  Times stuck:    ${times_stuck}`);
    console.log(`  Hint calls:     ${hint_calls}`);
    console.log(`  Avg hint:       ${avg_hint_ms.toFixed(1)}ms`);
    console.log(`  Max hint:       ${max_hint_ms.toFixed(1)}ms`);
    console.log(`  Total time:     ${game_ms.toFixed(0)}ms`);

    // Assertions.
    assert(total_cards_played > 0, "should play at least some cards");
    assert(max_hint_ms < HINT_TIMEOUT_MS,
        `worst hint took ${max_hint_ms.toFixed(0)}ms, budget is ${HINT_TIMEOUT_MS}ms`);

    // Report how close to a perfect game we got.
    const unplayed = cards_in_hand + cards_in_deck;
    if (unplayed === 0) {
        console.log(`  ** PERFECT GAME — all ${deck.length} cards played! **`);
    } else {
        console.log(`  ${unplayed} cards unplayed (${(100 * total_cards_played / deck.length).toFixed(0)}% completion)`);
    }
}

console.log("\nAll simulation tests passed.");
