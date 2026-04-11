import type { CardStack } from "./card_stack";
import { CardStackType } from "./stack_type";

export class ScoreSingleton {
    stack_type_value(stack_type: CardStackType): number {
        switch (stack_type) {
            case CardStackType.PURE_RUN:
                return 100;
            case CardStackType.SET:
                return 60;
            case CardStackType.RED_BLACK_RUN:
                return 50;
            default:
                return 0;
        }
    }

    for_stack(stack: CardStack): number {
        // Flat per-card scoring: each card in a valid 3+ family
        // is worth one type_value. The old formula was
        // (n-2)*type_value, which had two problems for cooperative
        // play: it gave away the first two cards of any stack for
        // free, and — worse — it punished a player for splitting a
        // long stack to make room for a clever placement, even
        // when the split kept all the original cards in valid
        // families. Under the flat formula, splits are free
        // (n cards is n cards no matter how they're grouped) and
        // the marginal reward for adding a card to any valid
        // stack is still exactly one type_value.
        return stack.size() * this.stack_type_value(stack.stack_type);
    }

    for_stacks(stacks: CardStack[]): number {
        let score = 0;

        for (const stack of stacks) {
            score += this.for_stack(stack);
        }

        return score;
    }

    for_cards_played(num: number) {
        if (num <= 0) return 0;
        const actually_played_bonus = 200;
        const progressive_points_for_played_cards = 100 * num * num;
        return actually_played_bonus + progressive_points_for_played_cards;
    }
}

export const Score = new ScoreSingleton();
