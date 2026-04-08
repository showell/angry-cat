// Simulation test with a fixed deck.
//
// Uses a pre-shuffled deck to run deterministic games and measure
// hint system performance. The same deck produces the same results
// every time, so we can benchmark and compare strategies.

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
    assert.equal(deck.length, 104, "double deck should have 104 cards");

    // Verify we have exactly 2 of each card (across both decks).
    const counts = new Map<string, number>();
    for (const card of deck) {
        const key = value_str(card.value) + suit_letter[card.suit];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
        assert.equal(count, 2, `expected 2 of ${key}, got ${count}`);
    }
    assert.equal(counts.size, 52, "should have 52 unique card faces");
}

// --- Simulate a single-player game using the hint cascade ---

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

    // Start with the standard initial board stacks.
    function initial_board(): CardStack[] {
        // Simplified: start with an empty board. The player builds
        // everything from scratch using hand stacks.
        return [];
    }

    let hand = draw(15);
    let board = initial_board();
    let total_played = 0;
    let turns = 0;
    const max_turns = 50;
    let bfs_hits = 0;

    const start = performance.now();

    while (turns < max_turns && hand.length > 0) {
        turns++;
        let played_this_turn = 0;

        // Keep applying hints until no more moves.
        let made_progress = true;
        while (made_progress) {
            made_progress = false;
            const hint = get_hint(hand, board);

            switch (hint.level) {
                case HintLevel.HAND_STACKS: {
                    // Play the first complete stack from hand to board.
                    const hs = hint.hand_stacks[0];
                    const board_cards = hs.cards.map(
                        (hc) => new BoardCard(hc.card, BoardCardState.FRESHLY_PLAYED),
                    );
                    board.push(new CardStack(board_cards, loc));

                    // Remove played cards from hand.
                    const played_set = new Set(hs.cards);
                    hand = hand.filter((hc) => !played_set.has(hc));
                    played_this_turn += hs.cards.length;
                    made_progress = true;
                    break;
                }

                case HintLevel.DIRECT_PLAY: {
                    // Play the first playable card.
                    const hc = hint.playable_cards[0];
                    const single = CardStack.from_hand_card(hc, loc);

                    // Find which stack it merges into and replace it.
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
                    made_progress = true;
                    break;
                }

                case HintLevel.LOOSE_CARD_PLAY: {
                    bfs_hits++;
                    const play = hint.plays[0];

                    // Use the pre-computed board state after rearrangement.
                    board = play.resulting_board;

                    // Now play the hand card onto the rearranged board.
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
                    made_progress = true;
                    break;
                }

                case HintLevel.NO_MOVES:
                    break;
            }
        }

        total_played += played_this_turn;

        // Draw cards if nothing was played this turn.
        if (played_this_turn === 0) {
            hand = hand.concat(draw(3));
        }
    }

    const elapsed = performance.now() - start;

    console.log(`Simulation: ${turns} turns, ${total_played} cards played, ` +
        `${hand.length} cards left in hand, ${board.length} board stacks, ` +
        `${deck.length - deck_index} cards left in deck, ${bfs_hits} BFS hits, ` +
        `${elapsed.toFixed(1)}ms`);

    // Basic sanity: the hint system should play at least some cards.
    assert(total_played > 0, "should have played at least some cards");
    assert(turns <= max_turns, "should finish within turn limit");
}

console.log("All simulation tests passed.");
