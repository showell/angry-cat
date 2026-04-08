import { CardColor, CardValue, is_pair_of_dups, all_suits, Suit, value_str } from "./card";
import { BoardCard, BoardCardState, CardStack, type HandCard } from "./card_stack";
import { CardStackType, get_stack_type, successor, predecessor } from "./stack_type";

const DUMMY_LOC = { top: 0, left: 0 };

// --- Hint cascade ---
//
// get_hint returns the simplest available move. We only progress to
// harder hints when the easier ones find nothing — just like an
// experienced player coaching a newbie.

export enum HintLevel {
    HAND_STACKS = "You have a complete set or run in your hand!",
    DIRECT_PLAY = "You can play a card from your hand onto the board.",
    LOOSE_CARD_PLAY = "Move a board card, then play from your hand.",
    NO_MOVES = "No moves found. You'll draw cards.",
}

export type Hint =
    | { level: HintLevel.HAND_STACKS; hand_stacks: HandStack[] }
    | { level: HintLevel.DIRECT_PLAY; playable_cards: HandCard[] }
    | { level: HintLevel.LOOSE_CARD_PLAY; plays: LooseCardPlay[] }
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

    // Level 3: Move one board card, then play one hand card.
    const loose_plays = find_loose_card_plays(hand_cards, board_stacks);
    if (loose_plays.length > 0) {
        return { level: HintLevel.LOOSE_CARD_PLAY, plays: loose_plays };
    }

    return { level: HintLevel.NO_MOVES };
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

    // Phase 2: Fallback — try one level of untargeted loose card moves.
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
