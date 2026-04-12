// Test what hint the algorithm gives for a saved puzzle.
// Doesn't play the puzzle — just reports what get_hint returns.

import * as fs from "fs";
import { Card, OriginDeck } from "../core/card";
import {
    CardStack, BoardCard, BoardCardState, HandCard, HandCardState,
} from "../core/card_stack";
import { get_hint, HintLevel } from "../hints/hints";
import { execute_complex_hint } from "../hints/execute_complex";

const path = process.argv[2];
if (!path) { console.error("Usage: test_puzzle.ts PATH"); process.exit(1); }

const puzzle = JSON.parse(fs.readFileSync(path, "utf-8"));

function parse_label(label: string): Card {
    const [cardPart, deckPart] = label.split(":");
    const deck = deckPart === "2" ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(cardPart, deck);
}

const hand_cards: HandCard[] = puzzle.hand.map((l: string) =>
    new HandCard(parse_label(l), HandCardState.NORMAL));

const board_stacks: CardStack[] = puzzle.board.map((s: any) => {
    const board_cards = s.cards.map((l: string) =>
        new BoardCard(parse_label(l), BoardCardState.FIRMLY_ON_BOARD));
    return new CardStack(board_cards, { top: 0, left: 0 });
});

console.log("Hand:", hand_cards.map(hc => hc.card.str()).join(" "));
console.log("Board:");
for (const s of board_stacks) {
    console.log("  [" + s.board_cards.map(bc => bc.card.str()).join(" ") + "]");
}

const hint = get_hint(hand_cards, board_stacks);
console.log("\nHint level:", hint.level);
if ("playable_cards" in hint) {
    console.log("Playable cards:", hint.playable_cards.map(hc => hc.card.str()).join(" "));
}
if ("hand_stacks" in hint) {
    for (const group of hint.hand_stacks) {
        console.log("Hand stack:", group.cards.map(hc => hc.card.str()).join(" "), `(${group.stack_type})`);
    }
}
if ("plays" in hint) {
    for (const play of hint.plays) {
        console.log("Loose play:", JSON.stringify(play).slice(0, 200));
    }
}

// Run the executor to see if the hint actually turns into a played move.
if (hint.level !== HintLevel.HAND_STACKS &&
    hint.level !== HintLevel.DIRECT_PLAY &&
    hint.level !== HintLevel.REARRANGE_PLAY &&
    hint.level !== HintLevel.NO_MOVES) {
    const board_clone = board_stacks.map(s => s.clone());
    const played = execute_complex_hint(hint, board_clone);
    if (played.length === 0) {
        console.log("\nExecutor: returned NO played cards — detector/executor drift!");
    } else {
        const played_labels = played.map(hc => hc.card.str()).join(" ");
        console.log(`\nExecutor: played ${played.length} card(s): ${played_labels}`);
        console.log("Resulting board:");
        for (const s of board_clone) {
            console.log("  [" + s.board_cards.map(bc => bc.card.str()).join(" ") + "]");
        }
    }
}
