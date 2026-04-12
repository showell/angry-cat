// Executor for every HintLevel. Each trick has its own function; the
// dispatch table at the bottom wires them to the enum.
//
// Shape of every per-trick executor:
//   (hint, board) => HandCard[]
// Mutates `board` in place. Returns the hand cards played, or [] if
// the executor couldn't realize the hint (which signals detector/
// executor drift — see insights/hint_system_process.md).

import { Card, CardColor, Suit } from "../core/card";
import {
    BoardCard as BoardCardClass,
    BoardCardState,
    CardStack,
    HandCard,
    HandCardState,
} from "../core/card_stack";
import { CardStackType, get_stack_type, predecessor, successor } from "../core/stack_type";
import {
    HintLevel, assert_never, can_extract,
    type Hint,
} from "./hints";

const DUMMY_LOC = { top: 0, left: 0 };

// --- Small shared helpers --------------------------------------------

// Wrap a board Card in a singleton CardStack. Lets us reuse
// left_merge / right_merge against cards that came from the board
// (not the hand).
function single_stack_from_card(card: Card): CardStack {
    return CardStack.from_hand_card(new HandCard(card, HandCardState.NORMAL), DUMMY_LOC);
}

// Extract a card from a stack. Supports end-peel, set-peel, and
// middle-peel. Matches can_extract() in hints.ts — if that returns
// true for (stack, index), this returns the card.
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
    // Middle peel: split a run into two valid halves (both size >= 3)
    // and extract the pivot.
    if ((st === CardStackType.PURE_RUN || st === CardStackType.RED_BLACK_RUN) &&
        card_idx >= 3 && (size - card_idx - 1) >= 3) {
        const left = new CardStack(cards.slice(0, card_idx), stack.loc);
        const right = new CardStack(cards.slice(card_idx + 1), DUMMY_LOC);
        board[stack_idx] = left;
        board.push(right);
        return cards[card_idx];
    }
    return undefined;
}

// "What card would complete this hand pair?"  Mirrors find_hand_pairs
// in hints.ts. Returns a list of (value, valid-suits) candidates.
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
        // Rb-run pair — the completion must be the opposite color.
        const opp_lo = lo.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        const opp_hi = hi.color === CardColor.RED ? [Suit.SPADE, Suit.CLUB] : [Suit.HEART, Suit.DIAMOND];
        return [
            { value: predecessor(lo.value), suits: opp_lo },
            { value: successor(hi.value),   suits: opp_hi },
        ];
    }
    return [];
}

// Iterate every unordered pair of distinct playable hand cards.
function* hand_pairs(playable: HandCard[]): Generator<[HandCard, HandCard]> {
    for (let i = 0; i < playable.length; i++) {
        for (let j = i + 1; j < playable.length; j++) {
            if (playable[i].card.equals(playable[j].card)) continue;
            yield [playable[i], playable[j]];
        }
    }
}

// --- Per-trick executors ---------------------------------------------

function execute_hand_stacks(
    hint: Extract<Hint, { level: HintLevel.HAND_STACKS }>,
    board: CardStack[],
): HandCard[] {
    const group = hint.hand_stacks[0];
    const bcs = group.cards.map(hc =>
        new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED));
    board.push(new CardStack(bcs, DUMMY_LOC));
    return group.cards;
}

function execute_direct_play(
    hint: Extract<Hint, { level: HintLevel.DIRECT_PLAY }>,
    board: CardStack[],
): HandCard[] {
    const hc = hint.playable_cards[0];
    const single = CardStack.from_hand_card(hc, DUMMY_LOC);
    for (let i = 0; i < board.length; i++) {
        const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
        if (merged) {
            board[i] = merged;
            return [hc];
        }
    }
    return [];
}

function execute_swap(
    hint: Extract<Hint, { level: HintLevel.SWAP }>,
    board: CardStack[],
): HandCard[] {
    const hc = hint.playable_cards[0];
    for (let si = 0; si < board.length; si++) {
        const stack = board[si];
        if (stack.stack_type !== CardStackType.RED_BLACK_RUN) continue;
        const cards = stack.get_cards();

        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            // Match criterion: same value, same color, different suit.
            if (bc.value !== hc.card.value) continue;
            if (bc.color !== hc.card.color) continue;
            if (bc.suit === hc.card.suit) continue;

            // Swapping preserves rb validity only for certain positions.
            const swapped = cards.map((c, i) => i === ci ? hc.card : c);
            if (get_stack_type(swapped) !== CardStackType.RED_BLACK_RUN) continue;

            // The kicked card must land on a pure run or fill a set.
            const kicked = bc;
            const kicked_dest = find_kicked_home(board, si, kicked);
            if (kicked_dest < 0) continue;

            // Apply: substitute hand card for kicked in the run;
            // then home the kicked card.
            const new_run_cards = stack.board_cards.map((b, i) =>
                i === ci ? new BoardCardClass(hc.card, BoardCardState.FRESHLY_PLAYED) : b);
            board[si] = new CardStack(new_run_cards, stack.loc);
            place_kicked(board, kicked_dest, kicked);

            return [hc];
        }
    }
    return [];
}

// SWAP helper: find a stack that will accept the kicked card.
function find_kicked_home(board: CardStack[], skip_idx: number, kicked: Card): number {
    for (let j = 0; j < board.length; j++) {
        if (j === skip_idx) continue;
        const target = board[j];
        const tst = target.stack_type;
        if (tst === CardStackType.SET && target.board_cards.length < 4) {
            const suits = target.board_cards.map(b => b.card.suit);
            if (target.board_cards[0].card.value === kicked.value &&
                !suits.includes(kicked.suit)) {
                return j;
            }
        }
        if (tst === CardStackType.PURE_RUN) {
            const single = single_stack_from_card(kicked);
            if (target.left_merge(single) || target.right_merge(single)) {
                return j;
            }
        }
    }
    return -1;
}

// SWAP helper: actually home the kicked card at the chosen destination.
function place_kicked(board: CardStack[], dest_idx: number, kicked: Card): void {
    const dest = board[dest_idx];
    if (dest.stack_type === CardStackType.SET) {
        board[dest_idx] = new CardStack(
            [...dest.board_cards, new BoardCardClass(kicked, BoardCardState.FIRMLY_ON_BOARD)],
            dest.loc);
    } else {
        const single = single_stack_from_card(kicked);
        const merged = dest.left_merge(single) ?? dest.right_merge(single);
        if (merged) board[dest_idx] = merged;
    }
}

function execute_loose_card_play(
    hint: Extract<Hint, { level: HintLevel.LOOSE_CARD_PLAY }>,
    board: CardStack[],
): HandCard[] {
    const play = hint.plays[0];
    const hc = play.playable_cards[0];
    // The detector already computed the post-move board; adopt it.
    board.length = 0;
    for (const s of play.resulting_board) board.push(s);
    const single = CardStack.from_hand_card(hc, DUMMY_LOC);
    for (let i = 0; i < board.length; i++) {
        const merged = board[i].left_merge(single) ?? board[i].right_merge(single);
        if (merged) { board[i] = merged; return [hc]; }
    }
    return [];
}

function execute_split_for_set(
    hint: Extract<Hint, { level: HintLevel.SPLIT_FOR_SET }>,
    board: CardStack[],
): HandCard[] {
    const hc = hint.playable_cards[0];
    const v = hc.card.value;
    const hc_suit = hc.card.suit;

    // Collect all extractable same-value board cards of different suits.
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

    // Pick two with distinct suits.
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

    // Extract from highest index first to avoid shifting earlier indices.
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

function execute_split_and_inject(
    hint: Extract<Hint, { level: HintLevel.SPLIT_AND_INJECT }>,
    board: CardStack[],
): HandCard[] {
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

            // Two injection points: hand card extends the right piece on
            // its left, OR extends the left piece on its right.
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

function execute_peel_for_run(
    hint: Extract<Hint, { level: HintLevel.PEEL_FOR_RUN }>,
    board: CardStack[],
): HandCard[] {
    const hc = hint.playable_cards[0];
    const v = hc.card.value;
    type Candidate = { si: number; ci: number; card: Card };

    // Find every peelable ±1 neighbor.
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

    // Try every pair of neighbors (from different stacks) that forms
    // a valid run with the hand card.
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

function execute_pair_peel(
    hint: Extract<Hint, { level: HintLevel.PAIR_PEEL }>,
    board: CardStack[],
): HandCard[] {
    for (const [hca, hcb] of hand_pairs(hint.playable_cards)) {
        for (const need of pair_needs(hca.card, hcb.card)) {
            for (let si = 0; si < board.length; si++) {
                const cards = board[si].get_cards();
                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.value !== need.value) continue;
                    if (!need.suits.includes(bc.suit)) continue;
                    if (!can_extract(board[si], ci)) continue;

                    const extracted = extract_card(board, si, ci);
                    if (!extracted) continue;

                    const group = [
                        new BoardCardClass(hca.card, BoardCardState.FRESHLY_PLAYED),
                        new BoardCardClass(hcb.card, BoardCardState.FRESHLY_PLAYED),
                        extracted,
                    ].sort((x, y) => x.card.value - y.card.value);
                    const new_stack = new CardStack(group, DUMMY_LOC);

                    // If the resulting group isn't a valid set or run,
                    // the extraction didn't pay off. Best-effort: the
                    // mutated board is still legal (run was split or a
                    // card was peeled), so let the next detector pass
                    // sort it out.
                    if (new_stack.problematic() || new_stack.incomplete()) continue;

                    board.push(new_stack);
                    return [hca, hcb];
                }
            }
        }
    }
    return [];
}

function execute_pair_dissolve(
    hint: Extract<Hint, { level: HintLevel.PAIR_DISSOLVE }>,
    board: CardStack[],
): HandCard[] {
    for (const [hca, hcb] of hand_pairs(hint.playable_cards)) {
        for (const need of pair_needs(hca.card, hcb.card)) {
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

                // Try to place the other two set cards on runs.
                const assignments = assign_dissolved_cards(board, si, other_bcs);
                if (!assignments) continue;

                // Apply: relocate the others, drop the set, push the
                // pair-plus-extracted group.
                for (const { idx, merged } of assignments) {
                    board[idx] = merged;
                }
                board.splice(si, 1);
                const group = [
                    new BoardCardClass(hca.card, BoardCardState.FRESHLY_PLAYED),
                    new BoardCardClass(hcb.card, BoardCardState.FRESHLY_PLAYED),
                    match_bc,
                ].sort((x, y) => x.card.value - y.card.value);
                board.push(new CardStack(group, DUMMY_LOC));
                return [hca, hcb];
            }
        }
    }
    return [];
}

// PAIR_DISSOLVE helper: try to merge each "other" set card onto a
// distinct run. Returns the merge assignments, or null if any card
// can't find a home.
function assign_dissolved_cards(
    board: CardStack[],
    skip_idx: number,
    others: BoardCardClass[],
): { idx: number; merged: CardStack }[] | null {
    const sim = board.slice();
    const used_dests = new Set<number>([skip_idx]);
    const assignments: { idx: number; merged: CardStack }[] = [];

    for (const other of others) {
        let placed = false;
        const single = single_stack_from_card(other.card);
        for (let di = 0; di < sim.length; di++) {
            if (used_dests.has(di)) continue;
            const dest = sim[di];
            const t = dest.stack_type;
            if (t !== CardStackType.PURE_RUN && t !== CardStackType.RED_BLACK_RUN) continue;
            const merged = dest.left_merge(single) ?? dest.right_merge(single);
            if (!merged) continue;
            const mt = merged.stack_type;
            if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;
            sim[di] = merged;
            used_dests.add(di);
            assignments.push({ idx: di, merged });
            placed = true;
            break;
        }
        if (!placed) return null;
    }
    return assignments;
}

function execute_six_to_four(
    _hint: Extract<Hint, { level: HintLevel.SIX_TO_FOUR }>,
    _board: CardStack[],
): HandCard[] {
    // TODO: SIX_TO_FOUR merges two 3-card sets of the same value into
    // a 4-set, freeing two dup cards onto runs so the hand card can
    // play. Previously this branch was silently shared with PAIR_PEEL,
    // which only happened to work when the peel fallback succeeded.
    // Left unimplemented so the drift is visible (see hint_coverage_test).
    return [];
}

// --- Dispatcher ------------------------------------------------------

export function execute_complex_hint(hint: Hint, board: CardStack[]): HandCard[] {
    switch (hint.level) {
        case HintLevel.HAND_STACKS:      return execute_hand_stacks(hint, board);
        case HintLevel.DIRECT_PLAY:      return execute_direct_play(hint, board);
        case HintLevel.SWAP:             return execute_swap(hint, board);
        case HintLevel.LOOSE_CARD_PLAY:  return execute_loose_card_play(hint, board);
        case HintLevel.SPLIT_FOR_SET:    return execute_split_for_set(hint, board);
        case HintLevel.SPLIT_AND_INJECT: return execute_split_and_inject(hint, board);
        case HintLevel.PEEL_FOR_RUN:     return execute_peel_for_run(hint, board);
        case HintLevel.PAIR_PEEL:        return execute_pair_peel(hint, board);
        case HintLevel.PAIR_DISSOLVE:    return execute_pair_dissolve(hint, board);
        case HintLevel.SIX_TO_FOUR:      return execute_six_to_four(hint, board);

        // REARRANGE_PLAY is intentionally unhandled (graph-solver fallback,
        // not wired into get_hint). NO_MOVES is a signal, not an action.
        case HintLevel.REARRANGE_PLAY:
        case HintLevel.NO_MOVES:
            return [];

        default: return assert_never(hint);
    }
}
