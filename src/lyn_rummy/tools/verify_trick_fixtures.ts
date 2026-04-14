// Verifier for trick conformance fixtures.
//
// Reads every *.json under
// `../../../../angry-gopher/lynrummy/conformance/tricks/`, runs
// the named trick against the fixture input, and compares the
// result to `expected`. Prints one line per fixture: PASS/FAIL,
// and prints diffs on FAIL.
//
// This is the TS side of the shared-fixture drift detector. The
// Go loader is at angry-gopher/lynrummy/tricks_conformance_test.go
// (TBD); the Elm loader is at
// elm-lynrummy/tests/LynRummy/ConformanceTest.elm (today only
// handles referee ops; tricks TBD).
//
// Usage:  npx vite-node src/lyn_rummy/tools/verify_trick_fixtures.ts

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

import { Card, OriginDeck, Suit } from "../core/card";
import {
    BoardCard, BoardCardState, CardStack, HandCard, HandCardState,
} from "../core/card_stack";
import type { Play, Trick } from "../tricks/trick";
import { direct_play } from "../tricks/direct_play";
import { hand_stacks } from "../tricks/hand_stacks";
import { rb_swap } from "../tricks/rb_swap";
import { pair_peel } from "../tricks/pair_peel";
import { split_for_set } from "../tricks/split_for_set";
import { peel_for_run } from "../tricks/peel_for_run";
import { loose_card_play } from "../tricks/loose_card_play";

const TRICKS: Record<string, Trick> = {
    direct_play, hand_stacks, rb_swap, pair_peel,
    split_for_set, peel_for_run, loose_card_play,
};

const FIXTURES_DIR = join(
    __dirname, "..", "..", "..", "..",
    "angry-gopher", "lynrummy", "conformance", "tricks",
);

// --- JSON → domain ---

type JsonCard = { value: number; suit: number; origin_deck: number };
type JsonBoardCard = { card: JsonCard; state: number };
type JsonCardStack = { board_cards: JsonBoardCard[]; loc: { top: number; left: number } };
type JsonHandCard = { card: JsonCard; state: number };

function cardFromJson(j: JsonCard): Card {
    return new Card(j.value, j.suit as Suit, j.origin_deck as OriginDeck);
}
function boardCardFromJson(j: JsonBoardCard): BoardCard {
    return new BoardCard(cardFromJson(j.card), j.state as BoardCardState);
}
function handCardFromJson(j: JsonHandCard): HandCard {
    return new HandCard(cardFromJson(j.card), j.state as HandCardState);
}
function cardStackFromJson(j: JsonCardStack): CardStack {
    return new CardStack(j.board_cards.map(boardCardFromJson), j.loc);
}

// --- Domain → JSON (for diffing) ---

function cardToJson(c: Card): JsonCard {
    return { value: c.value, suit: c.suit, origin_deck: c.origin_deck };
}
function boardCardToJson(bc: BoardCard): JsonBoardCard {
    return { card: cardToJson(bc.card), state: bc.state };
}
function handCardToJson(hc: HandCard): JsonHandCard {
    return { card: cardToJson(hc.card), state: hc.state };
}
function cardStackToJson(s: CardStack): JsonCardStack {
    return {
        board_cards: s.board_cards.map(boardCardToJson),
        loc: { top: s.loc.top, left: s.loc.left },
    };
}

// --- Runner ---

type Fixture = {
    name: string;
    operation: string;
    input: {
        trick_id: string;
        hand: JsonHandCard[];
        board: JsonCardStack[];
    };
    expected: {
        ok: boolean;
        no_plays?: boolean;
        play?: {
            hand_cards_played: JsonHandCard[];
            board_after: JsonCardStack[];
        };
    };
};

function runFixture(filePath: string): boolean {
    const fx: Fixture = JSON.parse(readFileSync(filePath, "utf8"));
    const name = basename(filePath);

    if (fx.operation !== "trick_first_play") {
        console.log(`SKIP ${name} (unsupported operation ${fx.operation})`);
        return true;
    }

    const trick = TRICKS[fx.input.trick_id];
    if (!trick) {
        console.log(`FAIL ${name}: unknown trick_id "${fx.input.trick_id}"`);
        return false;
    }

    const hand = fx.input.hand.map(handCardFromJson);
    const board = fx.input.board.map(cardStackFromJson);

    const plays: Play[] = trick.find_plays(hand, board);

    if (fx.expected.no_plays) {
        if (plays.length === 0) {
            console.log(`PASS ${name}`);
            return true;
        }
        console.log(`FAIL ${name}: expected no plays, got ${plays.length}`);
        return false;
    }

    if (plays.length === 0) {
        console.log(`FAIL ${name}: expected a play, got none`);
        return false;
    }

    const play = plays[0];
    const boardClone = board.map(s => s.clone());
    const playedHandCards = play.apply(boardClone);

    const gotHand = playedHandCards.map(hc => handCardToJson(hc));
    const gotBoard = boardClone.map(cardStackToJson);

    const expectedHand = fx.expected.play!.hand_cards_played;
    const expectedBoard = fx.expected.play!.board_after;

    const handOK = JSON.stringify(gotHand) === JSON.stringify(expectedHand);
    const boardOK = JSON.stringify(gotBoard) === JSON.stringify(expectedBoard);

    if (handOK && boardOK) {
        console.log(`PASS ${name}`);
        return true;
    }

    console.log(`FAIL ${name}`);
    if (!handOK) {
        console.log(`  hand_cards_played diff:`);
        console.log(`    expected: ${JSON.stringify(expectedHand)}`);
        console.log(`    got:      ${JSON.stringify(gotHand)}`);
    }
    if (!boardOK) {
        console.log(`  board_after diff:`);
        console.log(`    expected: ${JSON.stringify(expectedBoard)}`);
        console.log(`    got:      ${JSON.stringify(gotBoard)}`);
    }
    return false;
}

function main(): void {
    const files = readdirSync(FIXTURES_DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => join(FIXTURES_DIR, f))
        .sort();

    if (files.length === 0) {
        console.log("No fixtures found at", FIXTURES_DIR);
        process.exit(1);
    }

    let failures = 0;
    for (const f of files) {
        if (!runFixture(f)) failures++;
    }

    console.log(`\n${files.length - failures} / ${files.length} passed`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
