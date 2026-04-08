import { is_pair_of_dups, value_str } from "./card";
import { BoardCard, BoardCardState, CardStack, type HandCard } from "./card_stack";
import { CardStackType, get_stack_type } from "./stack_type";

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

export function find_playable_hand_cards(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): HandCard[] {
    return hand_cards.filter((hand_card) => {
        const single = CardStack.from_hand_card(hand_card, DUMMY_LOC);
        return board_stacks.some(
            (stack) =>
                stack.left_merge(single) !== undefined ||
                stack.right_merge(single) !== undefined,
        );
    });
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

const MAX_BFS_DEPTH = 4;

// Normalize a board state to a string for dedup. We sort stack
// representations so that board order doesn't matter.
function board_key(stacks: CardStack[]): string {
    return stacks.map((s) => s.str()).sort().join("|");
}

function card_label_for(bc: BoardCard): string {
    const suit_letter: Record<number, string> = { 0: "C", 1: "D", 2: "S", 3: "H" };
    return value_str(bc.card.value) + suit_letter[bc.card.suit];
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

export function find_loose_card_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): LooseCardPlay[] {
    const already_playable = new Set(
        find_playable_hand_cards(hand_cards, board_stacks).map((hc) => hc),
    );

    // BFS queue: each entry is a board state + the moves taken to get there.
    type BFSEntry = {
        board: CardStack[];
        moves: BoardMove[];
    };

    const visited = new Set<string>();
    visited.add(board_key(board_stacks));

    let queue: BFSEntry[] = [{ board: board_stacks, moves: [] }];

    for (let depth = 0; depth < MAX_BFS_DEPTH && queue.length > 0; depth++) {
        const next_queue: BFSEntry[] = [];

        for (const entry of queue) {
            const loose_cards = find_loose_cards(entry.board);

            for (const loose of loose_cards) {
                for (const target of loose.target_stacks) {
                    const new_board = apply_loose_move(entry.board, loose, target);
                    if (!new_board) continue;

                    const key = board_key(new_board);
                    if (visited.has(key)) continue;
                    visited.add(key);

                    const move: BoardMove = {
                        card_label: card_label_for(loose.card),
                        from: loose.source_stack.str(),
                        to: target.str(),
                        end: loose.end,
                    };
                    const moves = [...entry.moves, move];

                    // Check if this board state unlocks any hand plays.
                    const now_playable = find_playable_hand_cards(
                        hand_cards,
                        new_board,
                    );
                    const new_plays = now_playable.filter(
                        (hc) => !already_playable.has(hc),
                    );

                    if (new_plays.length > 0) {
                        return [{
                            moves,
                            resulting_board: new_board,
                            playable_cards: new_plays,
                        }];
                    }

                    next_queue.push({ board: new_board, moves });
                }
            }
        }

        queue = next_queue;
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
