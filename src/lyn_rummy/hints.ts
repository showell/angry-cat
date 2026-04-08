import { is_pair_of_dups } from "./card";
import { BoardCard, BoardCardState, CardStack, type HandCard } from "./card_stack";
import { CardStackType, get_stack_type } from "./stack_type";

const DUMMY_LOC = { top: 0, left: 0 };

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

// --- Loose card + hand card combination ---

// A move where you first rearrange the board (move one loose card),
// which then opens up a spot for a hand card to be played.
export type LooseCardPlay = {
    loose: LooseCard;
    target_stack: CardStack;       // which target the loose card goes to
    merged_target: CardStack;      // the target after merging the loose card
    playable_cards: HandCard[];    // hand cards that become playable after the move
};

// For each loose card move, simulate the board change and check
// whether any hand cards become playable that weren't before.
// Returns the first useful move found (does not recurse).
export function find_loose_card_plays(
    hand_cards: HandCard[],
    board_stacks: CardStack[],
): LooseCardPlay[] {
    // What's already playable before any rearranging.
    const already_playable = new Set(
        find_playable_hand_cards(hand_cards, board_stacks).map((hc) => hc),
    );

    const results: LooseCardPlay[] = [];

    for (const loose of find_loose_cards(board_stacks)) {
        for (const target of loose.target_stacks) {
            // Build the single-card stack for merging.
            const single = new CardStack(
                [new BoardCard(loose.card.card, BoardCardState.FIRMLY_ON_BOARD)],
                DUMMY_LOC,
            );

            // Try both merge directions.
            const merged =
                target.left_merge(single) ?? target.right_merge(single);
            if (!merged) continue;

            // Simulate the board after the move:
            // - Replace source with remaining (the stack minus the loose card)
            // - Replace target with merged (the target plus the loose card)
            const simulated_board = board_stacks.map((stack) => {
                if (stack === loose.source_stack) return loose.remaining_stack;
                if (stack === target) return merged;
                return stack;
            });

            // Check what's playable now.
            const now_playable = find_playable_hand_cards(
                hand_cards,
                simulated_board,
            );

            // Find newly playable cards (weren't playable before).
            const new_plays = now_playable.filter(
                (hc) => !already_playable.has(hc),
            );

            if (new_plays.length > 0) {
                results.push({
                    loose,
                    target_stack: target,
                    merged_target: merged,
                    playable_cards: new_plays,
                });
                // Stop at the first useful move.
                return results;
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
