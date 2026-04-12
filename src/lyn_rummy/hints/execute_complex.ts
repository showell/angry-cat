// Execute a complex hint by mutating a cloned board in place.
// Returns the hand cards that were played, or [] if the executor
// couldn't realize the hint (which signals detector/executor drift
// — see insights/hint_system_process.md).
//
// Extracted from tools/console_player.ts so it can be exercised by
// tests/hint_coverage_test.ts without the console_player's top-level
// env requirements.

import { Card, CardColor, Suit } from "../core/card";
import {
    BoardCard as BoardCardClass,
    BoardCardState,
    CardStack,
    type HandCard,
} from "../core/card_stack";
import { CardStackType, get_stack_type, predecessor, successor } from "../core/stack_type";
import {
    HintLevel, assert_never, can_extract,
    type Hint,
} from "./hints";

const DUMMY_LOC = { top: 0, left: 0 };

function extract_card(board: CardStack[], stack_idx: number, card_idx: number): BoardCardClass | undefined {
    const stack = board[stack_idx];
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.stack_type;

    if (card_idx === 0 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(1), stack.loc);
        return cards[0];
    }
    if (card_idx === size - 1 && size >= 4) {
        board[stack_idx] = new CardStack(cards.slice(0, -1), stack.loc);
        return cards[size - 1];
    }
    if (st === CardStackType.SET && size >= 4) {
        const remaining = cards.filter((_, i) => i !== card_idx);
        board[stack_idx] = new CardStack(remaining, stack.loc);
        return cards[card_idx];
    }
    return undefined;
}

// Needed-card candidates for a hand pair — mirrors find_hand_pairs in
// hints.ts. Returned list says "to complete this pair, any card at
// value V in one of these suits works."
type PairNeed = { value: number; suits: Suit[] };

function pair_needs(a: Card, b: Card): PairNeed[] {
    // Set pair (same value, different suit): need any remaining suit.
    if (a.value === b.value && a.suit !== b.suit) {
        const suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]
            .filter(s => s !== a.suit && s !== b.suit);
        return [{ value: a.value, suits }];
    }

    // Run pair (consecutive values).
    const lo = a.value < b.value ? a : b;
    const hi = a.value < b.value ? b : a;
    if (hi.value !== successor(lo.value)) return [];

    if (a.suit === b.suit) {
        // Pure-run pair.
        return [
            { value: predecessor(lo.value), suits: [lo.suit] },
            { value: successor(hi.value),   suits: [hi.suit] },
        ];
    }
    if (a.color !== b.color) {
        // Rb-run pair.
        const opp_lo = lo.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        const opp_hi = hi.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        return [
            { value: predecessor(lo.value), suits: opp_lo },
            { value: successor(hi.value),   suits: opp_hi },
        ];
    }
    return [];
}

// Try to dissolve a 3-set to pair with hand cards. Mutates `board`.
// Returns the hand cards played, or [] if no dissolution fits.
function try_pair_dissolve(playable: HandCard[], board: CardStack[]): HandCard[] {
    for (let i = 0; i < playable.length; i++) {
        for (let j = i + 1; j < playable.length; j++) {
            const a = playable[i].card;
            const b = playable[j].card;
            if (a.equals(b)) continue;

            for (const need of pair_needs(a, b)) {
                for (let si = 0; si < board.length; si++) {
                    const set = board[si];
                    if (set.stack_type !== CardStackType.SET) continue;
                    if (set.board_cards.length !== 3) continue;

                    const cards = set.get_cards();
                    const match_idx = cards.findIndex(c =>
                        c.value === need.value && need.suits.includes(c.suit));
                    if (match_idx < 0) continue;

                    const match_bc = set.board_cards[match_idx];
                    const other_bcs = set.board_cards.filter((_, k) => k !== match_idx);

                    // Find a run destination for each other card. Record
                    // assignments so we can apply them atomically.
                    const board_after = board.slice();
                    board_after[si] = set; // placeholder, will remove later
                    const used_dests = new Set<number>([si]);
                    const assignments: { idx: number; merged: CardStack }[] = [];

                    let all_placed = true;
                    for (const other of other_bcs) {
                        let placed = false;
                        const single = CardStack.from_hand_card(
                            { card: other.card, state: 0 } as HandCard,
                            DUMMY_LOC,
                        );
                        for (let di = 0; di < board_after.length; di++) {
                            if (used_dests.has(di)) continue;
                            const dest = board_after[di];
                            const t = dest.stack_type;
                            if (t !== CardStackType.PURE_RUN && t !== CardStackType.RED_BLACK_RUN) continue;
                            const merged = dest.left_merge(single) ?? dest.right_merge(single);
                            if (!merged) continue;
                            const mt = merged.stack_type;
                            if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;
                            board_after[di] = merged;
                            used_dests.add(di);
                            assignments.push({ idx: di, merged });
                            placed = true;
                            break;
                        }
                        if (!placed) { all_placed = false; break; }
                    }

                    if (!all_placed) continue;

                    // Apply: copy the assignments into the real board,
                    // remove the dissolved set, and push the new
                    // pair-plus-extracted stack.
                    for (const { idx, merged } of assignments) {
                        board[idx] = merged;
                    }
                    board.splice(si, 1);
                    const run = [
                        new BoardCardClass(a, BoardCardState.FRESHLY_PLAYED),
                        new BoardCardClass(b, BoardCardState.FRESHLY_PLAYED),
                        match_bc,
                    ].sort((x, y) => x.card.value - y.card.value);
                    board.push(new CardStack(run, DUMMY_LOC));
                    return [playable[i], playable[j]];
                }
            }
        }
    }
    return [];
}

export function execute_complex_hint(
    hint: Hint,
    board: CardStack[],
): HandCard[] {
    switch (hint.level) {
        case HintLevel.SWAP: {
            const hc = hint.playable_cards[0];
            for (let si = 0; si < board.length; si++) {
                const stack = board[si];
                if (stack.stack_type !== CardStackType.RED_BLACK_RUN) continue;
                const cards = stack.get_cards();

                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.value !== hc.card.value) continue;
                    if (bc.color !== hc.card.color) continue;
                    if (bc.suit === hc.card.suit) continue;

                    const swapped = cards.map((c, i) => i === ci ? hc.card : c);
                    if (get_stack_type(swapped) !== CardStackType.RED_BLACK_RUN) continue;

                    const kicked = bc;
                    let kicked_dest = -1;
                    for (let j = 0; j < board.length; j++) {
                        if (j === si) continue;
                        const target = board[j];
                        const tst = target.stack_type;
                        if (tst === CardStackType.SET && target.board_cards.length < 4) {
                            const suits = target.board_cards.map(b => b.card.suit);
                            if (target.board_cards[0].card.value === kicked.value &&
                                !suits.includes(kicked.suit)) {
                                kicked_dest = j;
                                break;
                            }
                        }
                        if (tst === CardStackType.PURE_RUN) {
                            const single = CardStack.from_hand_card(
                                { card: kicked, state: 0 } as HandCard,
                                DUMMY_LOC,
                            );
                            if (target.left_merge(single) || target.right_merge(single)) {
                                kicked_dest = j;
                                break;
                            }
                        }
                    }
                    if (kicked_dest < 0) continue;

                    const new_run_cards = stack.board_cards.map((b, i) =>
                        i === ci ? new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED) : b);
                    board[si] = new CardStack(new_run_cards, stack.loc);

                    const dest = board[kicked_dest];
                    if (dest.stack_type === CardStackType.SET) {
                        const new_set = new CardStack(
                            [...dest.board_cards, new BoardCardClass(kicked, BoardCardState.FIRMLY_ON_BOARD)],
                            dest.loc);
                        board[kicked_dest] = new_set;
                    } else {
                        const single = CardStack.from_hand_card({ card: kicked, state: 0 } as HandCard, DUMMY_LOC);
                        const merged = dest.left_merge(single) ?? dest.right_merge(single);
                        if (merged) board[kicked_dest] = merged;
                    }

                    return [hc];
                }
            }
            return [];
        }

        case HintLevel.SPLIT_FOR_SET: {
            const hc = hint.playable_cards[0];
            const v = hc.card.value;
            const hc_suit = hc.card.suit;

            const candidates: { si: number; ci: number; suit: number }[] = [];
            for (let si = 0; si < board.length; si++) {
                const cards = board[si].get_cards();
                for (let ci = 0; ci < cards.length; ci++) {
                    if (cards[ci].value === v && cards[ci].suit !== hc_suit &&
                        can_extract(board[si], ci)) {
                        candidates.push({ si, ci, suit: cards[ci].suit });
                    }
                }
            }

            const suits_used = new Set([hc_suit]);
            const to_extract: { si: number; ci: number }[] = [];
            for (const c of candidates) {
                if (!suits_used.has(c.suit)) {
                    suits_used.add(c.suit);
                    to_extract.push({ si: c.si, ci: c.ci });
                    if (to_extract.length >= 2) break;
                }
            }
            if (to_extract.length < 2) return [];

            to_extract.sort((a, b) => b.si - a.si || b.ci - a.ci);
            const extracted: BoardCardClass[] = [];
            for (const { si, ci } of to_extract) {
                const bc = extract_card(board, si, ci);
                if (bc) extracted.push(bc);
            }
            if (extracted.length < 2) return [];

            const set_cards = [
                new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED),
                ...extracted,
            ];
            board.push(new CardStack(set_cards, DUMMY_LOC));
            return [hc];
        }

        case HintLevel.LOOSE_CARD_PLAY: {
            const play = hint.plays[0];
            const hc = play.playable_cards[0];
            board.length = 0;
            for (const s of play.resulting_board) board.push(s);
            const single = CardStack.from_hand_card(hc, DUMMY_LOC);
            for (let i = 0; i < board.length; i++) {
                const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
                if (merged) { board[i] = merged; return [hc]; }
            }
            return [];
        }

        case HintLevel.SPLIT_AND_INJECT: {
            const hc = hint.playable_cards[0];
            for (let si = 0; si < board.length; si++) {
                const stack = board[si];
                const st = stack.stack_type;
                if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;
                const cards = stack.board_cards;
                const size = cards.length;

                for (let split = 2; split <= size - 2; split++) {
                    const left = new CardStack(cards.slice(0, split), stack.loc);
                    const right = new CardStack(cards.slice(split), DUMMY_LOC);
                    if (left.problematic() || right.problematic()) continue;

                    const single = CardStack.from_hand_card(hc, DUMMY_LOC);
                    if (!left.incomplete()) {
                        const extended = right.left_merge(single);
                        if (extended && !extended.incomplete() && !extended.problematic()) {
                            board[si] = left;
                            board.push(extended);
                            return [hc];
                        }
                    }
                    if (!right.incomplete()) {
                        const extended = left.right_merge(single);
                        if (extended && !extended.incomplete() && !extended.problematic()) {
                            board[si] = extended;
                            board.push(right);
                            return [hc];
                        }
                    }
                }
            }
            return [];
        }

        case HintLevel.PEEL_FOR_RUN: {
            const hc = hint.playable_cards[0];
            const v = hc.card.value;
            type Candidate = { si: number; ci: number; card: Card };
            const neighbors: Candidate[] = [];

            for (let si = 0; si < board.length; si++) {
                const cards = board[si].get_cards();
                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.equals(hc.card)) continue;
                    if (bc.value === predecessor(v) || bc.value === successor(v)) {
                        if (can_extract(board[si], ci)) {
                            neighbors.push({ si, ci, card: bc });
                        }
                    }
                }
            }

            for (let i = 0; i < neighbors.length; i++) {
                for (let j = i + 1; j < neighbors.length; j++) {
                    if (neighbors[i].si === neighbors[j].si) continue;
                    const triple = [neighbors[i].card, hc.card, neighbors[j].card]
                        .sort((a, b) => a.value - b.value);
                    const st = get_stack_type(triple);
                    if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;

                    const extracts = [neighbors[i], neighbors[j]].sort((a, b) => b.si - a.si || b.ci - a.ci);
                    const extracted: BoardCardClass[] = [];
                    for (const ex of extracts) {
                        const bc = extract_card(board, ex.si, ex.ci);
                        if (bc) extracted.push(bc);
                    }
                    if (extracted.length < 2) continue;

                    const run_cards = [
                        new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED),
                        ...extracted,
                    ].sort((a, b) => a.card.value - b.card.value);
                    const new_stack = new CardStack(run_cards, DUMMY_LOC);
                    if (!new_stack.incomplete() && !new_stack.problematic()) {
                        board.push(new_stack);
                        return [hc];
                    }
                }
            }
            return [];
        }

        case HintLevel.PAIR_PEEL:
        case HintLevel.PAIR_DISSOLVE:
        case HintLevel.SIX_TO_FOUR: {
            // PAIR_DISSOLVE-specific first: the needed card lives in a
            // 3-set. Dissolving means sending the other two cards to
            // runs and extracting the third to pair with the hand cards.
            if (hint.level === HintLevel.PAIR_DISSOLVE) {
                const dissolved = try_pair_dissolve(hint.playable_cards, board);
                if (dissolved.length > 0) return dissolved;
            }

            const playable = hint.playable_cards;
            for (let i = 0; i < playable.length; i++) {
                for (let j = i + 1; j < playable.length; j++) {
                    const a = playable[i].card;
                    const b = playable[j].card;
                    if (a.equals(b)) continue;

                    // Set pair: same value different suit.
                    if (a.value === b.value && a.suit !== b.suit) {
                        const needed_suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]
                            .filter(s => s !== a.suit && s !== b.suit);
                        for (let si = 0; si < board.length; si++) {
                            const cards = board[si].get_cards();
                            for (let ci = 0; ci < cards.length; ci++) {
                                const bc = cards[ci];
                                if (bc.value === a.value && needed_suits.includes(bc.suit) &&
                                    can_extract(board[si], ci)) {
                                    const extracted = extract_card(board, si, ci);
                                    if (extracted) {
                                        board.push(new CardStack([
                                            new BoardCardClass(a, BoardCardState.FRESHLY_PLAYED),
                                            new BoardCardClass(b, BoardCardState.FRESHLY_PLAYED),
                                            extracted,
                                        ], DUMMY_LOC));
                                        return [playable[i], playable[j]];
                                    }
                                }
                            }
                        }
                    }

                    // Run pair: consecutive values. Pure-run variant has
                    // same suit; rb-run variant has opposite colors.
                    {
                        const lo = a.value < b.value ? a : b;
                        const hi = a.value < b.value ? b : a;
                        if (hi.value === successor(lo.value)) {
                            const is_pure = a.suit === b.suit;
                            const is_rb = a.color !== b.color;

                            // needed = { value, suit } candidates for the
                            // peeled card. Pure: exact suit match. rb:
                            // any suit of the opposite color.
                            type Need = { value: number; suits: Suit[] };
                            const needed: Need[] = [];
                            if (is_pure) {
                                needed.push({ value: predecessor(lo.value), suits: [lo.suit] });
                                needed.push({ value: successor(hi.value),   suits: [hi.suit] });
                            } else if (is_rb) {
                                const opp_lo = lo.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
                                const opp_hi = hi.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
                                needed.push({ value: predecessor(lo.value), suits: opp_lo });
                                needed.push({ value: successor(hi.value),   suits: opp_hi });
                            }

                            for (const need of needed) {
                                let done = false;
                                for (let si = 0; si < board.length && !done; si++) {
                                    const cards = board[si].get_cards();
                                    for (let ci = 0; ci < cards.length && !done; ci++) {
                                        const bc = cards[ci];
                                        if (bc.value !== need.value) continue;
                                        if (!need.suits.includes(bc.suit)) continue;
                                        if (!can_extract(board[si], ci)) continue;

                                        const extracted = extract_card(board, si, ci);
                                        if (!extracted) continue;
                                        const run = [
                                            new BoardCardClass(a, BoardCardState.FRESHLY_PLAYED),
                                            new BoardCardClass(b, BoardCardState.FRESHLY_PLAYED),
                                            extracted,
                                        ].sort((x, y) => x.card.value - y.card.value);
                                        const new_stack = new CardStack(run, DUMMY_LOC);
                                        // Verify it's actually a valid run after extraction.
                                        if (new_stack.problematic() || new_stack.incomplete()) {
                                            // Roll back the extraction isn't trivial; best effort:
                                            // try the next candidate without re-inserting (the
                                            // mutated board remains acceptable to outer diff).
                                            continue;
                                        }
                                        board.push(new_stack);
                                        return [playable[i], playable[j]];
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return [];
        }

        // Simple hints are handled by their own paths, not this function.
        // Listed here so TS exhaustiveness enforces coverage of every
        // HintLevel (see insights/hint_system_process.md).
        case HintLevel.HAND_STACKS:
        case HintLevel.DIRECT_PLAY:
        case HintLevel.REARRANGE_PLAY:
        case HintLevel.NO_MOVES:
            return [];

        default:
            return assert_never(hint);
    }
}
