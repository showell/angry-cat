import { Card, CardColor, CardValue, is_pair_of_dups, Suit, value_str } from "./card";
import { BoardCard, BoardCardState, CardStack, type HandCard } from "./card_stack";
import { CardStackType, get_stack_type, successor, predecessor } from "./stack_type";
import { solve as graph_solve, STRATEGY_PREFER_RUNS } from "./reassemble_graph";

const DUMMY_LOC = { top: 0, left: 0 };

// --- Shared helpers ---

function get_unplayable(hand_cards: HandCard[], board_stacks: CardStack[]): HandCard[] {
    const already = new Set(find_playable_hand_cards(hand_cards, board_stacks));
    return hand_cards.filter((hc) => !already.has(hc));
}

function make_single_stack(card: Card): CardStack {
    return new CardStack(
        [new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD)], DUMMY_LOC);
}

function opposite_color(c: CardColor): CardColor {
    return c === CardColor.RED ? CardColor.BLACK : CardColor.RED;
}

function suits_of_color(color: CardColor): Suit[] {
    return color === CardColor.RED
        ? [Suit.HEART, Suit.DIAMOND]
        : [Suit.SPADE, Suit.CLUB];
}

// --- Hint cascade ---
//
// get_hint returns the simplest available move. We only progress to
// harder hints when the easier ones find nothing — just like an
// experienced player coaching a newbie.

export enum HintLevel {
    HAND_STACKS = "You have a complete set or run in your hand!",
    DIRECT_PLAY = "You can play a card from your hand onto the board.",
    SWAP = "Swap a same-color card out of a run and take its place!",
    LOOSE_CARD_PLAY = "Move a board card, then play from your hand.",
    SPLIT_FOR_SET = "Split a run to form a set with your card.",
    SPLIT_AND_INJECT = "Split a run and inject your card at the split point.",
    PEEL_FOR_RUN = "Peel two board cards to form a run with your card.",
    PAIR_PEEL = "Peel a board card to complete a pair in your hand.",
    PAIR_DISSOLVE = "Dissolve a set to complete a pair in your hand.",
    SIX_TO_FOUR = "Merge two sets and free a dup — your card takes its place!",
    REARRANGE_PLAY = "Rearrange the board to make room for your card.",
    NO_MOVES = "No moves found. You'll draw cards.",
}

export type RearrangePlay = {
    hand_card: HandCard;
    destination_cards: Card[];      // the cards in the group (including hand card)
    destination_type: CardStackType; // set, pure run, or red/black
};

export type Hint =
    | { level: HintLevel.HAND_STACKS; hand_stacks: HandStack[] }
    | { level: HintLevel.DIRECT_PLAY; playable_cards: HandCard[] }
    | { level: HintLevel.SWAP; playable_cards: HandCard[] }
    | { level: HintLevel.LOOSE_CARD_PLAY; plays: LooseCardPlay[] }
    | { level: HintLevel.SPLIT_FOR_SET; playable_cards: HandCard[] }
    | { level: HintLevel.SPLIT_AND_INJECT; playable_cards: HandCard[] }
    | { level: HintLevel.PEEL_FOR_RUN; playable_cards: HandCard[] }
    | { level: HintLevel.PAIR_PEEL; playable_cards: HandCard[] }
    | { level: HintLevel.PAIR_DISSOLVE; playable_cards: HandCard[] }
    | { level: HintLevel.SIX_TO_FOUR; playable_cards: HandCard[] }
    | { level: HintLevel.REARRANGE_PLAY; plays: RearrangePlay[] }
    | { level: HintLevel.NO_MOVES };

export function get_hint(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): Hint {
    // Level 1: Complete sets or runs in the hand.
    const hand_stacks = find_hand_stacks(hand_cards);
    if (hand_stacks.length > 0) {
        return { level: HintLevel.HAND_STACKS, hand_stacks };
    }

    // Level 2: A hand card that directly merges onto a board stack.
    const playable = find_playable_hand_cards(hand_cards, board_stacks);
    if (playable.length > 0) {
        return { level: HintLevel.DIRECT_PLAY, playable_cards: playable };
    }

    // Level 2b: Swap — replace a same-color card in an rb run.
    const swap_plays = find_swap_plays(hand_cards, board_stacks);
    if (swap_plays.length > 0) {
        return { level: HintLevel.SWAP, playable_cards: swap_plays };
    }

    // Level 3: Move one board card, then play one hand card.
    const loose_plays = find_loose_card_plays(hand_cards, board_stacks);
    if (loose_plays.length > 0) {
        return { level: HintLevel.LOOSE_CARD_PLAY, plays: loose_plays };
    }

    // Level 4: Split a run to extract a card, form a set with hand card.
    const split_plays = find_split_for_set_plays(hand_cards, board_stacks);
    if (split_plays.length > 0) {
        return { level: HintLevel.SPLIT_FOR_SET, playable_cards: split_plays };
    }

    // Level 4b: Split a run, inject hand card at the split point.
    const inject_plays = find_split_and_inject_plays(hand_cards, board_stacks);
    if (inject_plays.length > 0) {
        return { level: HintLevel.SPLIT_AND_INJECT, playable_cards: inject_plays };
    }

    // Level 4c: Peel two board cards to form a run with hand card.
    const peel_run_plays = find_peel_for_run_plays(hand_cards, board_stacks);
    if (peel_run_plays.length > 0) {
        return { level: HintLevel.PEEL_FOR_RUN, playable_cards: peel_run_plays };
    }

    // Level 5: Pair in hand + peel from board.
    const pair_plays = find_pair_peel_plays(hand_cards, board_stacks);
    if (pair_plays.length > 0) {
        return { level: HintLevel.PAIR_PEEL, playable_cards: pair_plays };
    }

    // Level 5b: Pair in hand + dissolve a 3-set from board.
    const pair_dissolve_plays = find_pair_dissolve_plays(hand_cards, board_stacks);
    if (pair_dissolve_plays.length > 0) {
        return { level: HintLevel.PAIR_DISSOLVE, playable_cards: pair_dissolve_plays };
    }

    // Level 5c: Six-to-four — merge two 3-sets, free dups, play hand card.
    const six_to_four_plays = find_six_to_four_plays(hand_cards, board_stacks);
    if (six_to_four_plays.length > 0) {
        return { level: HintLevel.SIX_TO_FOUR, playable_cards: six_to_four_plays };
    }

    // Level 6: Board cleanup — join adjacent runs, then re-run
    // the peel-based checks. Merging two 3-card runs into one
    // 6-card run creates new middle-peel positions.
    {
        const cleaned = join_adjacent_runs(board_stacks);
        if (cleaned.changed) {
            const split2 = find_split_for_set_plays(hand_cards, cleaned.board);
            if (split2.length > 0) {
                return { level: HintLevel.SPLIT_FOR_SET, playable_cards: split2 };
            }
            const inject2 = find_split_and_inject_plays(hand_cards, cleaned.board);
            if (inject2.length > 0) {
                return { level: HintLevel.SPLIT_AND_INJECT, playable_cards: inject2 };
            }
            const peel_run2 = find_peel_for_run_plays(hand_cards, cleaned.board);
            if (peel_run2.length > 0) {
                return { level: HintLevel.PEEL_FOR_RUN, playable_cards: peel_run2 };
            }
            const pair2 = find_pair_peel_plays(hand_cards, cleaned.board);
            if (pair2.length > 0) {
                return { level: HintLevel.PAIR_PEEL, playable_cards: pair2 };
            }
            const pair_dissolve2 = find_pair_dissolve_plays(hand_cards, cleaned.board);
            if (pair_dissolve2.length > 0) {
                return { level: HintLevel.PAIR_DISSOLVE, playable_cards: pair_dissolve2 };
            }
        }
    }

    // Level 7: Rearrange the board (expert-level, graph solver).
    const rearrange_plays = find_rearrangement_plays(hand_cards, board_stacks);
    if (rearrange_plays.length > 0) {
        return { level: HintLevel.REARRANGE_PLAY, plays: rearrange_plays };
    }

    return { level: HintLevel.NO_MOVES };
}

// --- Level 2b: Swap (same-color substitution in rb runs) ---
//
// In a red/black run, each position only needs the right COLOR.
// If 4D (red) sits in an rb run and the hand has 4H (also red),
// 4H can take 4D's place — IF 4D has somewhere else to go.
//
// "Somewhere else" = a pure run that wants 4D, or a set that
// has room for diamond. NOT another rb run (that just moves the
// problem). The kicked card must join via left/right merge.

export function find_swap_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const unplayable = get_unplayable(hand_cards, board_stacks);

    const results: HandCard[] = [];
    for (const hc of unplayable) {
        if (find_swap_for_card(hc, board_stacks)) {
            results.push(hc);
        }
    }
    return results;
}

function find_swap_for_card(
    hc: HandCard,
    board_stacks: CardStack[],
): boolean {
    // Scan rb runs for a same-value, same-color, different-suit card.
    for (let si = 0; si < board_stacks.length; si++) {
        const stack = board_stacks[si];
        if (stack.get_stack_type() !== CardStackType.RED_BLACK_RUN) continue;

        const cards = stack.get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.value !== hc.card.value) continue;
            if (bc.color !== hc.card.color) continue;
            if (bc.suit === hc.card.suit) continue;

            // Verify the hand card fits in this position.
            const swapped = cards.map((c, i) => i === ci ? hc.card : c);
            if (get_stack_type(swapped) !== CardStackType.RED_BLACK_RUN) continue;

            // Can the kicked card find a home on a pure run or set?
            if (can_place_on_run_or_set(bc, board_stacks, si)) return true;
        }
    }
    return false;
}

// --- Level 2: Direct plays ---
//
// Instead of testing each hand card against each stack with merge
// simulation, we precompute what each stack "wants" — the specific
// value+suit combinations that would extend it — and intersect
// with the hand. This is O(stacks + hand) instead of O(stacks × hand).

// A wanted card specification. For runs, we know the exact suit or
// color needed. For sets, we know the value and which suits are missing.
type WantedCard = {
    value: CardValue;
    suit?: Suit;        // exact suit needed (pure runs)
    color?: CardColor;  // color needed (red/black runs)
    excluded_suits?: Set<Suit>; // suits already in the set
};

// Compute all cards that the board stacks want at their ends.
export function compute_wanted_cards(board_stacks: CardStack[]): WantedCard[] {
    const wanted: WantedCard[] = [];

    for (const stack of board_stacks) {
        const cards = stack.get_cards();
        const st = stack.get_stack_type();

        if (st === CardStackType.PURE_RUN) {
            const first = cards[0];
            const last = cards[cards.length - 1];
            // Left end wants the predecessor in the same suit.
            wanted.push({ value: predecessor(first.value), suit: first.suit });
            // Right end wants the successor in the same suit.
            wanted.push({ value: successor(last.value), suit: last.suit });
        } else if (st === CardStackType.RED_BLACK_RUN) {
            const first = cards[0];
            const last = cards[cards.length - 1];
            // Left end wants predecessor with opposite color.
            const left_color = first.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
            wanted.push({ value: predecessor(first.value), color: left_color });
            // Right end wants successor with opposite color.
            const right_color = last.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
            wanted.push({ value: successor(last.value), color: right_color });
        } else if (st === CardStackType.SET) {
            // Set wants same value, any suit not already present.
            const present_suits = new Set(cards.map((c) => c.suit));
            if (present_suits.size < 4) {
                wanted.push({ value: cards[0].value, excluded_suits: present_suits });
            }
        }
    }

    return wanted;
}

function card_matches_wanted(hc: HandCard, w: WantedCard): boolean {
    if (hc.card.value !== w.value) return false;
    if (w.suit !== undefined && hc.card.suit !== w.suit) return false;
    if (w.color !== undefined && hc.card.color !== w.color) return false;
    if (w.excluded_suits !== undefined && w.excluded_suits.has(hc.card.suit)) return false;
    return true;
}

export function find_playable_hand_cards(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const wanted = compute_wanted_cards(board_stacks);
    if (wanted.length === 0) return [];

    return hand_cards.filter((hc) =>
        wanted.some((w) => card_matches_wanted(hc, w)),
    );
}

// A group of hand cards that form a valid stack and can be played
// directly to the board without rearranging anything.
export type HandStack = {
    cards: HandCard[];
    stack_type: CardStackType;
};

// Find groups of 3+ cards within the hand that form valid stacks
// (sets or runs). These can be played directly to the board.
export function find_hand_stacks(hand_cards: HandCard[]): HandStack[] {
    const results: HandStack[] = [];

    find_sets(hand_cards, results);
    find_pure_runs(hand_cards, results);
    find_red_black_runs(hand_cards, results);

    return results;
}

// Find sets: 3+ cards with the same value, different suits, no dups.
function find_sets(hand_cards: HandCard[], results: HandStack[]): void {
    const by_value = new Map<number, HandCard[]>();
    for (const hc of hand_cards) {
        const val = hc.card.value;
        if (!by_value.has(val)) by_value.set(val, []);
        by_value.get(val)!.push(hc);
    }

    for (const group of by_value.values()) {
        if (group.length < 3) continue;

        // Keep one card per suit to avoid duplicates.
        const by_suit = new Map<number, HandCard>();
        for (const hc of group) {
            if (!by_suit.has(hc.card.suit)) {
                by_suit.set(hc.card.suit, hc);
            }
        }

        const unique = [...by_suit.values()];
        if (unique.length >= 3) {
            const cards = unique.slice(0, 4);
            const stack_type = get_stack_type(cards.map((hc) => hc.card));
            if (stack_type === CardStackType.SET) {
                results.push({ cards, stack_type });
            }
        }
    }
}

// Find pure runs: 3+ consecutive cards of the same suit.
function find_pure_runs(hand_cards: HandCard[], results: HandStack[]): void {
    const by_suit = new Map<number, HandCard[]>();
    for (const hc of hand_cards) {
        if (!by_suit.has(hc.card.suit)) by_suit.set(hc.card.suit, []);
        by_suit.get(hc.card.suit)!.push(hc);
    }

    for (const group of by_suit.values()) {
        if (group.length < 3) continue;

        const sorted = [...group].sort((a, b) => a.card.value - b.card.value);

        // Find consecutive sequences of 3+.
        let run: HandCard[] = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prev = run[run.length - 1].card.value;
            const curr = sorted[i].card.value;

            if (curr === prev + 1 || (prev === 13 && curr === 1)) {
                run.push(sorted[i]);
            } else if (curr === prev) {
                // Duplicate value from double deck — skip.
                continue;
            } else {
                if (run.length >= 3) emit_run(run, CardStackType.PURE_RUN, results);
                run = [sorted[i]];
            }
        }
        if (run.length >= 3) emit_run(run, CardStackType.PURE_RUN, results);
    }
}

// Find red/black alternating runs: 3+ consecutive values with
// alternating colors.
function find_red_black_runs(hand_cards: HandCard[], results: HandStack[]): void {
    if (hand_cards.length < 3) return;

    const sorted = [...hand_cards].sort((a, b) => a.card.value - b.card.value);
    const used = new Set<HandCard>();

    for (let start = 0; start < sorted.length; start++) {
        if (used.has(sorted[start])) continue;

        const run: HandCard[] = [sorted[start]];
        let last = sorted[start];

        for (let j = start + 1; j < sorted.length; j++) {
            if (used.has(sorted[j])) continue;
            const curr = sorted[j];

            const isNext =
                curr.card.value === last.card.value + 1 ||
                (last.card.value === 13 && curr.card.value === 1);
            const alternates = curr.card.color !== last.card.color;

            if (isNext && alternates) {
                run.push(curr);
                last = curr;
            }
        }

        if (run.length >= 3) {
            const stack_type = get_stack_type(run.map((hc) => hc.card));
            if (stack_type === CardStackType.RED_BLACK_RUN) {
                for (const hc of run) used.add(hc);
                results.push({ cards: run, stack_type });
            }
        }
    }
}

// --- Loose card detection ---

// A loose card sits on the end of a board stack (4+ cards) and can
// be removed without breaking the source stack, then placed on
// another board stack. This is the simplest board manipulation —
// no hand cards involved, just rearranging what's already there.

export type LooseCard = {
    card: BoardCard;
    source_stack: CardStack;
    remaining_stack: CardStack;
    target_stacks: CardStack[];
    end: "left" | "right";
};

export function find_loose_cards(board_stacks: CardStack[]): LooseCard[] {
    const results: LooseCard[] = [];

    for (const source of board_stacks) {
        if (source.size() < 4) continue;

        check_loose_end(source, "left", board_stacks, results);
        check_loose_end(source, "right", board_stacks, results);
    }

    return results;
}

function check_loose_end(
    source: CardStack,
    end: "left" | "right",
    all_stacks: CardStack[],
    results: LooseCard[],
): void {
    const cards = source.board_cards;

    const loose_card = end === "left" ? cards[0] : cards[cards.length - 1];
    const remaining_cards =
        end === "left" ? cards.slice(1) : cards.slice(0, -1);

    // The remaining stack must still be valid (3+ cards, proper type).
    const remaining = new CardStack(remaining_cards, source.loc);
    if (remaining.incomplete() || remaining.problematic()) return;

    // Build a single-card stack to test merges with other stacks.
    const single = new CardStack(
        [new BoardCard(loose_card.card, BoardCardState.FIRMLY_ON_BOARD)],
        DUMMY_LOC,
    );

    const targets: CardStack[] = [];
    for (const target of all_stacks) {
        if (target === source) continue;
        if (
            target.left_merge(single) !== undefined ||
            target.right_merge(single) !== undefined
        ) {
            targets.push(target);
        }
    }

    if (targets.length > 0) {
        results.push({
            card: loose_card,
            source_stack: source,
            remaining_stack: remaining,
            target_stacks: targets,
            end,
        });
    }
}

// --- Board rearrangement search (BFS) ---
//
// Breadth-first search over board states. At each level, we try
// every possible loose card move. After each move, we check if
// any hand card becomes playable. If so, we return the sequence
// of board moves that got us there.
//
// Max depth is capped to keep hints under 200ms. In practice,
// depth 3-4 finds almost everything a human would try.

export type BoardMove = {
    card_label: string;  // human-readable label of the moved card
    from: string;        // description of source stack
    to: string;          // description of target stack
    end: "left" | "right";
};

export type LooseCardPlay = {
    moves: BoardMove[];           // sequence of board rearrangements (for display)
    resulting_board: CardStack[]; // the board after all moves (for execution)
    playable_cards: HandCard[];   // hand cards that become playable after
};

const MAX_BFS_DEPTH = 2;
const MAX_BFS_STATES = 75; // cap total states to keep hints under 200ms average

// Normalize a board state to a string for dedup. We sort stack
// representations so that board order doesn't matter.
function board_key(stacks: CardStack[]): string {
    return stacks.map((s) => s.str()).sort().join("|");
}

function card_label_for(bc: BoardCard): string {
    const suit_letter: Record<number, string> = { 0: "C", 1: "D", 2: "S", 3: "H" };
    return value_str(bc.card.value) + suit_letter[bc.card.suit];
}

// --- Mid-stack splits ---
//
// A stack of 7+ cards (run type) can be split into two valid halves
// where both sides are 3+ cards. This exposes interior cards as new
// loose ends on the resulting shorter stacks. Splits of 6-card stacks
// into 3+3 also work but neither half has a loose card (need 4+), so
// they're only useful if a subsequent split or move opens things up.

type SplitAction = {
    source: CardStack;
    left_half: CardStack;
    right_half: CardStack;
    split_point: number; // how many cards on the left
};

function find_valid_splits(board_stacks: CardStack[]): SplitAction[] {
    const results: SplitAction[] = [];

    for (const source of board_stacks) {
        // Only runs can be meaningfully split. Sets of 4 split into
        // groups that are too small (max set is 4 → 3+1 invalid).
        const st = source.get_stack_type();
        if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) {
            continue;
        }

        const cards = source.board_cards;
        if (cards.length < 6) continue; // both halves need 3+

        for (let i = 3; i <= cards.length - 3; i++) {
            const left = new CardStack(cards.slice(0, i), source.loc);
            const right = new CardStack(cards.slice(i), DUMMY_LOC);

            // Both halves must be valid.
            if (left.incomplete() || left.problematic()) continue;
            if (right.incomplete() || right.problematic()) continue;

            results.push({
                source,
                left_half: left,
                right_half: right,
                split_point: i,
            });
        }
    }

    return results;
}

function apply_split(board: CardStack[], split: SplitAction): CardStack[] {
    const new_board: CardStack[] = [];
    for (const stack of board) {
        if (stack === split.source) {
            new_board.push(split.left_half);
            new_board.push(split.right_half);
        } else {
            new_board.push(stack);
        }
    }
    return new_board;
}

// Apply one loose card move to a board, returning the new board.
function apply_loose_move(
    board: CardStack[],
    loose: LooseCard,
    target: CardStack,
): CardStack[] | undefined {
    const single = new CardStack(
        [new BoardCard(loose.card.card, BoardCardState.FIRMLY_ON_BOARD)],
        DUMMY_LOC,
    );

    const merged = target.left_merge(single) ?? target.right_merge(single);
    if (!merged) return undefined;

    return board.map((stack) => {
        if (stack === loose.source_stack) return loose.remaining_stack;
        if (stack === target) return merged;
        return stack;
    });
}

// --- Demand-driven search ---
//
// Instead of blind BFS over all possible board moves, we start from
// the hand and work backwards:
//
//   1. For each unplayable hand card, compute what it needs (which
//      value+suit on which end of which stack type).
//   2. Scan the board for cards that match those needs.
//   3. For each found card, determine how to free it:
//      a. Already loose on an end → one move
//      b. Buried in a run → one split exposes it, then one move
//   4. Try targeted moves first. Fall back to BFS for remaining.

type Demand = {
    hand_card: HandCard;
    needed_value: CardValue;
    needed_suit?: Suit;         // for pure runs
    needed_color?: CardColor;   // for red/black runs
};

// What does this hand card need on the board to become playable?
function compute_demands(
    hand_card: HandCard,
    board_stacks: CardStack[],
): Demand[] {
    // The hand card wants to attach to a stack. For that stack to
    // accept it, the stack's end must be the predecessor/successor
    // of the hand card (for runs) or have the same value (for sets).
    // But we invert: what board card, if it appeared as the end of
    // a stack, would let our hand card play?
    //
    // Actually simpler: we want the board to have a stack that
    // WANTS our hand card. compute_wanted_cards tells us what each
    // stack wants. We already checked those and our card doesn't
    // match. So we need to CHANGE the board so a stack wants our card.
    //
    // The demand is: "I need a board stack ending at value X so I
    // can extend it." For a hand card with value V:
    //   - A pure run ending at V-1 in our suit would want us.
    //   - A red/black run ending at V-1 in opposite color would want us.
    //   - A set of V with our suit missing would want us.
    //
    // So the "demanded board card" is one that, when placed at the
    // end of some stack, creates a spot for our hand card. This means
    // we're looking for V-1 in same suit (pure run) or V-1 in
    // opposite color (red/black run), or another V in a different
    // suit (to grow a set to where it needs us).

    const demands: Demand[] = [];
    const hc = hand_card.card;

    // For runs: we need a stack that ends at predecessor(V) in
    // matching suit/color. That card needs to exist on the board.
    demands.push({
        hand_card,
        needed_value: predecessor(hc.value),
        needed_suit: hc.suit,
    });

    // For red/black: predecessor with opposite color
    const opp_color = hc.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
    demands.push({
        hand_card,
        needed_value: predecessor(hc.value),
        needed_color: opp_color,
    });

    // For extending a run from the left: we need successor(V) in
    // matching suit/color at the start of a stack.
    demands.push({
        hand_card,
        needed_value: successor(hc.value),
        needed_suit: hc.suit,
    });
    demands.push({
        hand_card,
        needed_value: successor(hc.value),
        needed_color: opp_color,
    });

    return demands;
}

type BoardCardLocation = {
    stack: CardStack;
    stack_index: number; // index within board_stacks
    card_index: number;  // position within the stack
    board_card: BoardCard;
};

function find_card_on_board(
    board_stacks: CardStack[],
    demand: Demand,
): BoardCardLocation[] {
    const results: BoardCardLocation[] = [];

    for (let si = 0; si < board_stacks.length; si++) {
        const stack = board_stacks[si];
        const cards = stack.board_cards;

        for (let ci = 0; ci < cards.length; ci++) {
            const bc = cards[ci];
            if (bc.card.value !== demand.needed_value) continue;
            if (demand.needed_suit !== undefined && bc.card.suit !== demand.needed_suit) continue;
            if (demand.needed_color !== undefined && bc.card.color !== demand.needed_color) continue;

            results.push({
                stack,
                stack_index: si,
                card_index: ci,
                board_card: bc,
            });
        }
    }

    return results;
}

// Can this card be freed with a single action?
// Returns the board state after freeing it, or undefined.
function try_free_card(
    loc: BoardCardLocation,
    board_stacks: CardStack[],
): { board: CardStack[]; move: BoardMove } | undefined {
    const cards = loc.stack.board_cards;
    const size = cards.length;

    // Case 1: card is on the left end of a 4+ stack.
    if (loc.card_index === 0 && size >= 4) {
        const remaining = new CardStack(cards.slice(1), loc.stack.loc);
        if (!remaining.incomplete() && !remaining.problematic()) {
            // Find somewhere to put it.
            const single = new CardStack(
                [new BoardCard(loc.board_card.card, BoardCardState.FIRMLY_ON_BOARD)],
                DUMMY_LOC,
            );
            for (const target of board_stacks) {
                if (target === loc.stack) continue;
                const merged = target.left_merge(single) ?? target.right_merge(single);
                if (merged) {
                    const new_board = board_stacks.map((s) => {
                        if (s === loc.stack) return remaining;
                        if (s === target) return merged;
                        return s;
                    });
                    return {
                        board: new_board,
                        move: {
                            card_label: card_label_for(loc.board_card),
                            from: loc.stack.str(),
                            to: target.str(),
                            end: "left",
                        },
                    };
                }
            }
        }
    }

    // Case 2: card is on the right end of a 4+ stack.
    if (loc.card_index === size - 1 && size >= 4) {
        const remaining = new CardStack(cards.slice(0, -1), loc.stack.loc);
        if (!remaining.incomplete() && !remaining.problematic()) {
            const single = new CardStack(
                [new BoardCard(loc.board_card.card, BoardCardState.FIRMLY_ON_BOARD)],
                DUMMY_LOC,
            );
            for (const target of board_stacks) {
                if (target === loc.stack) continue;
                const merged = target.left_merge(single) ?? target.right_merge(single);
                if (merged) {
                    const new_board = board_stacks.map((s) => {
                        if (s === loc.stack) return remaining;
                        if (s === target) return merged;
                        return s;
                    });
                    return {
                        board: new_board,
                        move: {
                            card_label: card_label_for(loc.board_card),
                            from: loc.stack.str(),
                            to: target.str(),
                            end: "right",
                        },
                    };
                }
            }
        }
    }

    // Case 3: card is buried in a run — split to expose it.
    const st = loc.stack.get_stack_type();
    if (st === CardStackType.PURE_RUN || st === CardStackType.RED_BLACK_RUN) {
        // Split so this card ends up on an end of a 4+ half.
        // Try splitting just to the right of this card (card on right end of left half).
        if (loc.card_index >= 3 && size - (loc.card_index + 1) >= 3) {
            const left = new CardStack(cards.slice(0, loc.card_index + 1), loc.stack.loc);
            const right = new CardStack(cards.slice(loc.card_index + 1), DUMMY_LOC);
            if (!left.incomplete() && !left.problematic() &&
                !right.incomplete() && !right.problematic() &&
                left.size() >= 4) {
                // Card is now on the right end of the left half.
                const new_board = board_stacks.flatMap((s) =>
                    s === loc.stack ? [left, right] : [s],
                );
                return {
                    board: new_board,
                    move: {
                        card_label: `split@${loc.card_index + 1}`,
                        from: loc.stack.str(),
                        to: `${left.str()} + ${right.str()}`,
                        end: "right",
                    },
                };
            }
        }

        // Try splitting just to the left (card on left end of right half).
        if (loc.card_index >= 3 || (loc.card_index >= 0 && loc.card_index <= size - 4)) {
            const split_at = loc.card_index;
            if (split_at >= 3 && size - split_at >= 4) {
                const left = new CardStack(cards.slice(0, split_at), loc.stack.loc);
                const right = new CardStack(cards.slice(split_at), DUMMY_LOC);
                if (!left.incomplete() && !left.problematic() &&
                    !right.incomplete() && !right.problematic()) {
                    const new_board = board_stacks.flatMap((s) =>
                        s === loc.stack ? [left, right] : [s],
                    );
                    return {
                        board: new_board,
                        move: {
                            card_label: `split@${split_at}`,
                            from: loc.stack.str(),
                            to: `${left.str()} + ${right.str()}`,
                            end: "left",
                        },
                    };
                }
            }
        }
    }

    return undefined;
}

// --- Set dissolution ---
//
// A set like [7H 7S 7D] can be dissolved if every card in it has a
// distinct run on the board to merge into. After dissolution the set
// is gone and each card extends a different run. This can unlock hand
// cards that need the newly-extended runs.

function try_set_dissolution(
    unplayable: HandCard[],
    board_stacks: CardStack[],
): LooseCardPlay | undefined {
    for (const set_stack of board_stacks) {
        if (set_stack.get_stack_type() !== CardStackType.SET) continue;

        const set_cards = set_stack.board_cards;
        const other_stacks = board_stacks.filter((s) => s !== set_stack);

        // Try to assign each set card to a distinct target stack.
        const assignment = assign_set_cards_to_targets(set_cards, other_stacks);
        if (!assignment) continue;

        // Build the dissolved board: remove the set, apply all merges.
        const new_board = apply_dissolution(other_stacks, assignment);

        // Check if any unplayable hand card becomes playable.
        const now_playable = find_playable_hand_cards(unplayable, new_board);
        if (now_playable.length > 0) {
            const moves: BoardMove[] = assignment.map((a) => ({
                card_label: card_label_for(a.set_card),
                from: set_stack.str(),
                to: a.target.str(),
                end: a.end,
            }));
            return {
                moves,
                resulting_board: new_board,
                playable_cards: now_playable,
            };
        }
    }

    return undefined;
}

type SetCardAssignment = {
    set_card: BoardCard;
    target: CardStack;
    merged: CardStack;
    end: "left" | "right";
};

// Try every permutation of set cards → target stacks, requiring each
// card to merge onto a distinct target. With at most 4 cards in a set
// and typically few valid targets per card, the search space is tiny.
function assign_set_cards_to_targets(
    set_cards: BoardCard[],
    targets: CardStack[],
): SetCardAssignment[] | undefined {
    const assignments: SetCardAssignment[] = [];
    const used_targets = new Set<CardStack>();

    function backtrack(index: number): boolean {
        if (index === set_cards.length) return true;

        const bc = set_cards[index];
        const single = new CardStack(
            [new BoardCard(bc.card, BoardCardState.FIRMLY_ON_BOARD)],
            DUMMY_LOC,
        );

        for (const target of targets) {
            if (used_targets.has(target)) continue;

            const left = target.left_merge(single);
            if (left) {
                assignments.push({ set_card: bc, target, merged: left, end: "left" });
                used_targets.add(target);
                if (backtrack(index + 1)) return true;
                assignments.pop();
                used_targets.delete(target);
            }

            const right = target.right_merge(single);
            if (right) {
                assignments.push({ set_card: bc, target, merged: right, end: "right" });
                used_targets.add(target);
                if (backtrack(index + 1)) return true;
                assignments.pop();
                used_targets.delete(target);
            }
        }

        return false;
    }

    return backtrack(0) ? assignments : undefined;
}

function apply_dissolution(
    other_stacks: CardStack[],
    assignments: SetCardAssignment[],
): CardStack[] {
    // Build a map from original target → merged result.
    const merge_map = new Map<CardStack, CardStack>();
    for (const a of assignments) {
        merge_map.set(a.target, a.merged);
    }

    return other_stacks.map((s) => merge_map.get(s) ?? s);
}

export function find_loose_card_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): LooseCardPlay[] {
    const already_playable = new Set(
        find_playable_hand_cards(hand_cards, board_stacks).map((hc) => hc),
    );
    const unplayable = hand_cards.filter((hc) => !already_playable.has(hc));

    if (unplayable.length === 0) return [];

    // Phase 1: Demand-driven. For each unplayable hand card, find
    // board cards that would enable it and try to free them.
    for (const hc of unplayable) {
        const demands = compute_demands(hc, board_stacks);

        for (const demand of demands) {
            const locations = find_card_on_board(board_stacks, demand);

            for (const loc of locations) {
                const freed = try_free_card(loc, board_stacks);
                if (!freed) continue;

                // Check if the hand card is now playable on the modified board.
                const now_playable = find_playable_hand_cards([hc], freed.board);
                if (now_playable.length > 0) {
                    return [{
                        moves: [freed.move],
                        resulting_board: freed.board,
                        playable_cards: now_playable,
                    }];
                }

                // The card was freed but our hand card still can't play.
                // Try one more level: find loose cards on the modified
                // board that might help.
                const second_level = find_loose_cards(freed.board);
                for (const loose of second_level) {
                    for (const target of loose.target_stacks) {
                        const board2 = apply_loose_move(freed.board, loose, target);
                        if (!board2) continue;

                        const playable2 = find_playable_hand_cards([hc], board2);
                        if (playable2.length > 0) {
                            return [{
                                moves: [freed.move, {
                                    card_label: card_label_for(loose.card),
                                    from: loose.source_stack.str(),
                                    to: target.str(),
                                    end: loose.end,
                                }],
                                resulting_board: board2,
                                playable_cards: playable2,
                            }];
                        }
                    }
                }
            }
        }
    }

    // Phase 2: Set dissolution. Break apart a set if every card has
    // a distinct run to merge into, then check if a hand card plays.
    {
        const dissolution = try_set_dissolution(unplayable, board_stacks);
        if (dissolution) return [dissolution];
    }

    // Phase 3: Fallback — try one level of untargeted loose card moves.
    // This catches cases the demand analysis missed.
    for (const loose of find_loose_cards(board_stacks)) {
        for (const target of loose.target_stacks) {
            const new_board = apply_loose_move(board_stacks, loose, target);
            if (!new_board) continue;

            const now_playable = find_playable_hand_cards(hand_cards, new_board);
            const new_plays = now_playable.filter((hc) => !already_playable.has(hc));

            if (new_plays.length > 0) {
                return [{
                    moves: [{
                        card_label: card_label_for(loose.card),
                        from: loose.source_stack.str(),
                        to: target.str(),
                        end: loose.end,
                    }],
                    resulting_board: new_board,
                    playable_cards: new_plays,
                }];
            }
        }
    }

    return [];
}

// --- Board cleanup: join adjacent runs ---
//
// Scan for pairs of board stacks that can merge end-to-end.
// Two pure runs of the same suit where one ends at value V and
// the other starts at V+1. Two rb runs where the colors alternate
// correctly at the join point. Return the cleaned board and
// whether anything changed.

export function join_adjacent_runs(
    board_stacks: CardStack[],
): { board: CardStack[]; changed: boolean } {
    const stacks = [...board_stacks];
    let changed = false;

    // Keep merging until no more joins found. Two directions
    // suffice: i.right_merge(j) and j.right_merge(i).
    let progress = true;
    while (progress) {
        progress = false;
        for (let i = 0; i < stacks.length && !progress; i++) {
            for (let j = i + 1; j < stacks.length && !progress; j++) {
                const merged = stacks[i].right_merge(stacks[j])
                            ?? stacks[j].right_merge(stacks[i]);
                if (merged) {
                    stacks[i] = merged;
                    stacks.splice(j, 1);
                    changed = true;
                    progress = true;
                }
            }
        }
    }

    return { board: stacks, changed };
}

// --- Level 4: Split a run to form a set ---
//
// For each unplayable hand card with value V, scan the board for
// cards of value V buried in runs. If we can extract 2+ of them
// (by peeling from an end or splitting a long run), we form a set
// of 3+ with the hand card.
//
// This is a cheap one-look-ahead: for each same-value board card,
// can we remove it from its run and keep both halves valid?

type Extractable = {
    card: Card;
    stack_index: number;
    card_index: number;
};

// Can this card be extracted from its run without breaking it?
// Returns true if the card is on an end of a 4+ run, or if
// splitting the run at this card leaves two valid halves (3+ each).
// A card is "peelable" if removing it leaves the stack valid.
//
// Three cases:
// 1. End of a 4+ run: peel left or right, remaining 3+ run is valid.
// 2. Middle of a 7+ run: removing the card leaves 3+ on each side.
// 3. Any card in a 4-card set: remaining 3-card set is valid.
export function can_extract(stack: CardStack, card_index: number): boolean {
    const cards = stack.board_cards;
    const size = cards.length;
    const st = stack.get_stack_type();

    // Sets: can peel any card from a 4-card set.
    if (st === CardStackType.SET) {
        return size >= 4;
    }

    // Runs: must be pure or red/black.
    if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) {
        return false;
    }

    // End peel: left or right end of a 4+ run.
    if (size >= 4 && (card_index === 0 || card_index === size - 1)) {
        return true;
    }

    // Middle peel: both halves must be 3+.
    // Left half: [0..card_index), right half: (card_index..size).
    if (card_index >= 3 && (size - card_index - 1) >= 3) {
        return true;
    }

    return false;
}

export function find_split_for_set_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    // Filter to hand cards not playable by earlier levels.
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length === 0) return [];

    const results: HandCard[] = [];

    for (const hc of unplayable) {
        const v = hc.card.value;
        const hc_suit = hc.card.suit;

        // Find all extractable board cards with the same value but
        // different suit (potential set members).
        const extractable: Extractable[] = [];

        for (let si = 0; si < board_stacks.length; si++) {
            const stack = board_stacks[si];
            const cards = stack.get_cards();

            for (let ci = 0; ci < cards.length; ci++) {
                const bc = cards[ci];
                if (bc.value !== v) continue;
                if (bc.suit === hc_suit) continue; // same suit = not a set member
                if (is_pair_of_dups(bc, hc.card)) continue;

                if (can_extract(stack, ci)) {
                    extractable.push({ card: bc, stack_index: si, card_index: ci });
                }
            }
        }

        // We need at least 2 extractable cards (+ the hand card = 3 for a set).
        // Also check they have distinct suits.
        if (extractable.length < 2) continue;

        const suits_available = new Set<Suit>();
        suits_available.add(hc_suit);
        let distinct_count = 1; // hand card
        for (const ex of extractable) {
            if (!suits_available.has(ex.card.suit)) {
                suits_available.add(ex.card.suit);
                distinct_count++;
            }
        }

        if (distinct_count >= 3) {
            results.push(hc);
        }
    }

    return results;
}

// --- Level 4b: Split a run and inject hand card ---
//
// Find a run on the board that can be split into two valid halves
// where the hand card extends one half to make it valid.
//
// Example: board has [2H 3H 4H 5H 6H], hand has 4H(D2).
// Split at 4|5: left [2H 3H 4H] (valid), right [5H 6H] (only 2).
// Hand card 4H extends right: [4H 5H 6H] (valid). Play it!
//
// The hand card must be the predecessor of the right half's first
// card, or the successor of the left half's last card.

export function find_split_and_inject_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length === 0) return [];

    const results: HandCard[] = [];

    for (const hc of unplayable) {
        let found = false;

        for (const stack of board_stacks) {
            if (found) break;
            const st = stack.get_stack_type();
            if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) {
                continue;
            }

            const cards = stack.board_cards;
            const size = cards.length;

            // Try each split point. Left gets [0..split), right gets [split..size).
            // Left must be 3+. Right must be 2+ (the hand card will make it 3).
            // Or: left must be 2+ and hand card extends it to 3, right must be 3+.
            for (let split = 2; split <= size - 2; split++) {
                const left = new CardStack(cards.slice(0, split), stack.loc);
                const right = new CardStack(cards.slice(split), DUMMY_LOC);

                // Both halves must be valid run fragments (not bogus).
                if (left.problematic() || right.problematic()) continue;

                // Case 1: left is 3+ (valid), hand card extends right on the left.
                // Right starts at cards[split]. Hand card must be predecessor,
                // matching the run type.
                const single = CardStack.from_hand_card(hc, DUMMY_LOC);

                // Case 1: left is valid, hand card extends right on the left.
                if (!left.incomplete()) {
                    const extended = right.left_merge(single);
                    if (extended && !extended.incomplete() && !extended.problematic()) {
                        found = true;
                        break;
                    }
                }

                // Case 2: right is valid, hand card extends left on the right.
                if (!right.incomplete()) {
                    const extended = left.right_merge(single);
                    if (extended && !extended.incomplete() && !extended.problematic()) {
                        found = true;
                        break;
                    }
                }
            }
        }

        if (found) results.push(hc);
    }

    return results;
}

// --- Level 4c: Peel two board cards to form a run ---
//
// For each unplayable hand card, scan the board for peelable cards
// that are adjacent in value. A "peelable" card is one that can be
// extracted via can_extract. If we find two peelable cards
// that, together with the hand card, form a valid 3-card run, the
// hand card is playable.
//
// The human version: "I have 5H. I see a 4H peelable from a set
// and a 6H peelable from the end of a run. I peel both and play
// [4H 5H 6H]."

type PeelableCard = {
    card: Card;
    stack_index: number;
    card_index: number;
};

function find_peelable_cards(board_stacks: CardStack[]): PeelableCard[] {
    const result: PeelableCard[] = [];
    for (let si = 0; si < board_stacks.length; si++) {
        const stack = board_stacks[si];
        const cards = stack.get_cards();
        for (let ci = 0; ci < cards.length; ci++) {
            if (can_extract(stack, ci)) {
                result.push({ card: cards[ci], stack_index: si, card_index: ci });
            }
        }
    }
    return result;
}

export function find_peel_for_run_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length === 0) return [];

    const peelable = find_peelable_cards(board_stacks);
    if (peelable.length < 2) return [];

    const results: HandCard[] = [];

    for (const hc of unplayable) {
        const v = hc.card.value;
        const s = hc.card.suit;
        const c = hc.card.color;
        const prev = predecessor(v);
        const next = successor(v);

        // Collect peelable cards that could be run-neighbors.
        // For a 3-card run [A, hc, B], we need:
        //   pure run: A = prev same suit, B = next same suit
        //   rb run: A = prev opposite color, B = next opposite color
        // Or the hand card could be on either end:
        //   [hc, A, B] or [A, B, hc]
        // For simplicity: find all peelable cards with value prev
        // or next, then check if any pair + hc forms a valid 3-card stack.

        const neighbors: PeelableCard[] = [];
        for (const p of peelable) {
            if (is_pair_of_dups(p.card, hc.card)) continue;
            if (p.card.value === prev || p.card.value === next) {
                neighbors.push(p);
            }
        }

        if (neighbors.length < 2) continue;

        // Try all pairs of peelable neighbors.
        let found = false;
        for (let i = 0; i < neighbors.length && !found; i++) {
            for (let j = i + 1; j < neighbors.length && !found; j++) {
                const a = neighbors[i];
                const b = neighbors[j];

                // Must be from different stacks (can't peel two from same stack
                // if it would break it — but actually they could be from the same
                // long stack at different positions. For safety, skip same stack.)
                if (a.stack_index === b.stack_index) continue;

                // Sort the three cards by value and check if they form a valid stack.
                const triple = [a.card, hc.card, b.card].sort(
                    (x, y) => x.value - y.value,
                );
                const st = get_stack_type(triple);
                if (st === CardStackType.PURE_RUN ||
                    st === CardStackType.RED_BLACK_RUN) {
                    found = true;
                }
            }
        }

        if (found) results.push(hc);
    }

    return results;
}

// --- Level 4c: Hand pair + board peel ---
//
// Find pairs in the hand that are 2/3 of a set or run. For each
// pair, compute the third card(s) that would complete them. Check
// if any of those cards are peelable from the board (end of a 4+
// stack or extractable by splitting a long run).
//
// This catches the common human trick: "I have 8H and 9H, and
// there's a 7H on the end of that long run — I'll peel it and
// play [7H 8H 9H]."

function find_hand_pairs(hand: HandCard[]): { a: HandCard; b: HandCard; needed: Card[]; kind: "set" | "run" }[] {
    const pairs: { a: HandCard; b: HandCard; needed: Card[]; kind: "set" | "run" }[] = [];

    for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
            const a = hand[i].card;
            const b = hand[j].card;

            if (is_pair_of_dups(a, b)) continue;

            // Set pair: same value, different suit.
            if (a.value === b.value && a.suit !== b.suit) {
                // Need any card of same value in a suit not already used.
                const used_suits = new Set([a.suit, b.suit]);
                const needed: Card[] = [];
                for (const s of [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]) {
                    if (!used_suits.has(s)) {
                        // We don't know which deck, so create a D1 target.
                        // The board scan will match by value+suit regardless.
                        needed.push(new Card(a.value, s, a.origin_deck));
                    }
                }
                if (needed.length > 0) {
                    pairs.push({ a: hand[i], b: hand[j], needed, kind: "set" });
                }
            }

            // Run pair: consecutive values. Normalize so lo < hi.
            // Pure run: same suit. Red/black: opposite color.
            {
                let lo: Card | undefined;
                let hi: Card | undefined;
                if (successor(a.value) === b.value) { lo = a; hi = b; }
                else if (successor(b.value) === a.value) { lo = b; hi = a; }

                if (lo && hi) {
                    const is_pure = lo.suit === hi.suit;
                    const is_rb = lo.color !== hi.color;

                    if (is_pure) {
                        // Need predecessor/successor in same suit.
                        pairs.push({
                            a: hand[i], b: hand[j], kind: "run",
                            needed: [
                                new Card(predecessor(lo.value), lo.suit, lo.origin_deck),
                                new Card(successor(hi.value), hi.suit, hi.origin_deck),
                            ],
                        });
                    } else if (is_rb) {
                        // Need predecessor of lo in opposite color,
                        // successor of hi in opposite color.
                        const needed: Card[] = [];
                        for (const s of suits_of_color(opposite_color(lo.color))) {
                            needed.push(new Card(predecessor(lo.value), s, lo.origin_deck));
                        }
                        for (const s of suits_of_color(opposite_color(hi.color))) {
                            needed.push(new Card(successor(hi.value), s, hi.origin_deck));
                        }
                        pairs.push({ a: hand[i], b: hand[j], needed, kind: "run" });
                    }
                }
            }
        }
    }

    return pairs;
}

export function find_pair_peel_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    // Only consider hand cards not playable by earlier levels.
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length < 2) return [];

    const pairs = find_hand_pairs(unplayable);
    if (pairs.length === 0) return [];

    const playable = new Set<HandCard>();

    for (const pair of pairs) {
        // For each needed card, check if it's extractable from the board.
        for (const need of pair.needed) {
            for (let si = 0; si < board_stacks.length; si++) {
                const stack = board_stacks[si];
                const cards = stack.get_cards();

                for (let ci = 0; ci < cards.length; ci++) {
                    const bc = cards[ci];
                    if (bc.value !== need.value || bc.suit !== need.suit) continue;

                    if (can_extract(stack, ci)) {
                        playable.add(pair.a);
                        playable.add(pair.b);
                    }
                }
            }
        }
    }

    return [...playable];
}

// --- Level 5b: Pair + dissolve a 3-set ---
//
// Like pair-peel, but the needed third card lives in a 3-card set
// instead of being peelable. To take it, we dissolve the set —
// which is only legal if the OTHER two cards from the set each
// find a home on an existing run (pure or rb, via left/right merge).

// Can this card find a home on any run (pure or rb) on the board?
// Checks end merge and middle injection.
function can_place_on_any_run(
    card: Card,
    board_stacks: CardStack[],
    skip_index: number,
): boolean {
    return can_place_on_board(card, board_stacks, skip_index,
        [CardStackType.PURE_RUN, CardStackType.RED_BLACK_RUN]);
}

// Can this card find a home on a pure run or a set?
// (Not rb runs — used by swap to avoid moving the problem.)
function can_place_on_run_or_set(
    card: Card,
    board_stacks: CardStack[],
    skip_index: number,
): boolean {
    return can_place_on_board(card, board_stacks, skip_index,
        [CardStackType.PURE_RUN, CardStackType.SET]);
}

// Generic: can this card merge onto any stack of the given types,
// or inject into the middle of a run of those types?
function can_place_on_board(
    card: Card,
    board_stacks: CardStack[],
    skip_index: number,
    accept_types: CardStackType[],
): boolean {
    const single = make_single_stack(card);

    for (let i = 0; i < board_stacks.length; i++) {
        if (i === skip_index) continue;
        const stack = board_stacks[i];

        // End merge — check the result type, not the target type,
        // so incomplete stacks that become valid are accepted.
        for (const merged of [stack.left_merge(single), stack.right_merge(single)]) {
            if (merged && accept_types.includes(merged.get_stack_type())) {
                return true;
            }
        }

        // Injection into middle of a run.
        const st = stack.get_stack_type();
        if (st !== CardStackType.PURE_RUN && st !== CardStackType.RED_BLACK_RUN) continue;
        if (!accept_types.includes(st)) continue;

        const cards = stack.board_cards;
        for (let split = 2; split <= cards.length - 2; split++) {
            const left = new CardStack(cards.slice(0, split), DUMMY_LOC);
            const right = new CardStack(cards.slice(split), DUMMY_LOC);
            if (left.problematic() || right.problematic()) continue;

            if (!left.incomplete() && right.left_merge(single)) return true;
            if (!right.incomplete() && left.right_merge(single)) return true;
        }
    }
    return false;
}

export function find_pair_dissolve_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length < 2) return [];

    const pairs = find_hand_pairs(unplayable);
    if (pairs.length === 0) return [];

    // Find all 3-card sets on the board.
    const sets_3: { stack: CardStack; index: number }[] = [];
    for (let i = 0; i < board_stacks.length; i++) {
        const s = board_stacks[i];
        if (s.get_stack_type() === CardStackType.SET && s.size() === 3) {
            sets_3.push({ stack: s, index: i });
        }
    }
    if (sets_3.length === 0) return [];

    const playable = new Set<HandCard>();

    for (const pair of pairs) {
        for (const need of pair.needed) {
            // Check each 3-card set for the needed card.
            for (const { stack, index } of sets_3) {
                const cards = stack.get_cards();
                const match_idx = cards.findIndex(
                    (c) => c.value === need.value && c.suit === need.suit,
                );
                if (match_idx < 0) continue;

                // The other two cards must each merge onto a run.
                const others = cards.filter((_, i) => i !== match_idx);
                const both_placed =
                    can_place_on_any_run(others[0], board_stacks, index) &&
                    can_place_on_any_run(others[1], board_stacks, index);

                if (both_placed) {
                    playable.add(pair.a);
                    playable.add(pair.b);
                }
            }
        }
    }

    return [...playable];
}

// --- Level 6: Rearrangement plays (graph solver) ---
//
// For each hand card that earlier levels couldn't place, scatter
// the entire board + that card as singles, run the graph solver,
// and check if the card ends up in a valid group. If so, there
// exists some rearrangement of the board that accommodates it.
//
// This is expert-level play: set dissolutions, multi-step moves,
// chain rearrangements — whatever it takes.

// A hand card is an obvious orphan if the board has no card that
// could be in the same group: no same-value card (for sets), no
// same-suit ±1 (for pure runs), no opposite-color ±1 (for rb runs).
function is_hand_card_orphan(hc: HandCard, board_cards: Card[]): boolean {
    const v = hc.card.value;
    const s = hc.card.suit;
    const c = hc.card.color;
    const prev = predecessor(v);
    const next = successor(v);

    for (const bc of board_cards) {
        // Set neighbor: same value, different suit.
        if (bc.value === v && bc.suit !== s) return false;
        // Pure run neighbor: same suit, ±1 value.
        if (bc.suit === s && (bc.value === prev || bc.value === next)) return false;
        // Red/black neighbor: opposite color, ±1 value.
        if (bc.color !== c && (bc.value === prev || bc.value === next)) return false;
    }

    return true;
}

// Collect board cards from stacks that could interact with a hand
// card. A stack is relevant if any of its cards have a value within
// ±2 of the hand card (run co-members) or the same value (set).
// We include the entire stack because peeling one card requires
// the rest to survive as a valid stack.
function relevant_board_cards(hc: HandCard, board_stacks: CardStack[]): Card[] {
    const nearby = new Set<CardValue>();
    nearby.add(hc.card.value);
    let v = hc.card.value;
    for (let i = 0; i < 2; i++) { v = predecessor(v); nearby.add(v); }
    v = hc.card.value;
    for (let i = 0; i < 2; i++) { v = successor(v); nearby.add(v); }

    const result: Card[] = [];
    for (const stack of board_stacks) {
        const cards = stack.get_cards();
        const dominated = cards.some((bc) => nearby.has(bc.value));
        if (dominated) {
            for (const bc of cards) result.push(bc);
        }
    }
    return result;
}

// --- Level 5c: Six-to-four + play hand card ---
//
// Two 3-card sets of the same value → one 4-set + 2 dups on runs.
// The 4-set has 4 loose cards. After the six-to-four, check if any
// hand card can now play:
//   - Hand card's dup was in one of the old sets → dup moved to a
//     run, hand card takes its place in the new 4-set (or the 3-set
//     after the dup departed).
//   - Hand card extends a run that got longer from a dup joining.
//   - Hand card was blocked and the reshuffled board opens a spot.

export function find_six_to_four_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length === 0) return [];

    // Find all pairs of 3-card sets with the same value.
    const sets_by_value = new Map<CardValue, { index: number; stack: CardStack }[]>();
    for (let i = 0; i < board_stacks.length; i++) {
        const s = board_stacks[i];
        if (s.get_stack_type() !== CardStackType.SET || s.size() !== 3) continue;
        const val = s.get_cards()[0].value;
        if (!sets_by_value.has(val)) sets_by_value.set(val, []);
        sets_by_value.get(val)!.push({ index: i, stack: s });
    }

    const results = new Set<HandCard>();

    for (const group of sets_by_value.values()) {
        if (group.length < 2) continue;

        for (let gi = 0; gi < group.length; gi++) {
            for (let gj = gi + 1; gj < group.length; gj++) {
                const a = group[gi];
                const b = group[gj];

                // Build the simulated board after six-to-four.
                const sim_board = simulate_six_to_four(board_stacks, a, b);
                if (!sim_board) continue;

                // Check which unplayable hand cards are now playable.
                const now_playable = find_playable_hand_cards(unplayable, sim_board);
                for (const hc of now_playable) results.add(hc);

                // Also check: after six-to-four, can any hand card
                // use the other hint levels? (swap, split-for-set, etc.)
                // For simplicity, just check direct play for now.
                // The cascade will catch the rest on the next iteration.
            }
        }
    }

    return [...results];
}

// Simulate six-to-four without mutating the original board.
// Returns the modified board, or undefined if the trick can't apply.
function simulate_six_to_four(
    board_stacks: CardStack[],
    a: { index: number; stack: CardStack },
    b: { index: number; stack: CardStack },
): CardStack[] | undefined {
    const a_cards = a.stack.get_cards();
    const b_cards = b.stack.get_cards();

    // Collect suits.
    const all_suits = new Map<Suit, Card[]>();
    for (const c of a_cards) {
        if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
        all_suits.get(c.suit)!.push(c);
    }
    for (const c of b_cards) {
        if (!all_suits.has(c.suit)) all_suits.set(c.suit, []);
        all_suits.get(c.suit)!.push(c);
    }

    if (all_suits.size < 4) return undefined;

    const dup_cards: Card[] = [];
    const keep_cards: Card[] = [];
    for (const [_suit, cards] of all_suits) {
        if (cards.length === 2) {
            keep_cards.push(cards[0]);
            dup_cards.push(cards[1]);
        } else {
            keep_cards.push(cards[0]);
        }
    }

    if (dup_cards.length !== 2 || keep_cards.length !== 4) return undefined;

    // Check that both dups can join runs.
    const sim = [...board_stacks];
    const used_targets = new Set<number>();

    for (const dup of dup_cards) {
        const single = make_single_stack(dup);
        let placed = false;
        for (let ti = 0; ti < sim.length; ti++) {
            if (ti === a.index || ti === b.index) continue;
            if (used_targets.has(ti)) continue;
            const merged = sim[ti].left_merge(single) ?? sim[ti].right_merge(single);
            if (!merged) continue;
            const mt = merged.get_stack_type();
            if (mt !== CardStackType.PURE_RUN && mt !== CardStackType.RED_BLACK_RUN) continue;
            // Apply to sim.
            sim[ti] = merged;
            used_targets.add(ti);
            placed = true;
            break;
        }
        if (!placed) return undefined;
    }

    // Replace the two 3-sets with one 4-set.
    const four_set = new CardStack(
        keep_cards.map((c) => new BoardCard(c, BoardCardState.FIRMLY_ON_BOARD)),
        DUMMY_LOC);

    // Remove old sets (higher index first).
    const to_remove = [a.index, b.index].sort((x, y) => y - x);
    for (const idx of to_remove) sim.splice(idx, 1);

    sim.push(four_set);
    return sim;
}

export function find_rearrangement_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): RearrangePlay[] {
    if (board_stacks.length === 0) return [];

    // Collect all board cards for orphan check.
    const all_board_cards: Card[] = [];
    for (const stack of board_stacks) {
        for (const c of stack.get_cards()) {
            all_board_cards.push(c);
        }
    }

    // Filter to hand cards not already playable by earlier levels.
    const unplayable = get_unplayable(hand_cards, board_stacks);
    if (unplayable.length === 0) return [];

    const results: RearrangePlay[] = [];

    for (const hc of unplayable) {
        // Quick orphan check: does the board have ANY neighbor?
        if (is_hand_card_orphan(hc, all_board_cards)) continue;

        // Build a reduced pool: only board cards from relevant stacks.
        const pool = [...relevant_board_cards(hc, board_stacks), hc.card];

        const solution = graph_solve(pool, STRATEGY_PREFER_RUNS);

        // Check if the hand card ended up in a scoring group.
        for (const group of solution.groups) {
            if (group.cards.some((c) => c === hc.card)) {
                results.push({
                    hand_card: hc,
                    destination_cards: group.cards,
                    destination_type: group.type,
                });
                break;
            }
        }
    }

    return results;
}

// --- Helpers ---

function emit_run(
    run: HandCard[],
    expected_type: CardStackType,
    results: HandStack[],
): void {
    const stack_type = get_stack_type(run.map((hc) => hc.card));
    if (stack_type === expected_type) {
        results.push({ cards: run, stack_type });
    }
}
