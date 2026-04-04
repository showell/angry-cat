import { CardStackType } from "./stack_type";
import { CardStack } from "./card_stack";

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
        return (stack.size() - 2) * this.stack_type_value(stack.stack_type);
    }

    for_stacks(stacks: CardStack[]): number {
        let score = 0;

        for (const stack of stacks) {
            score += this.for_stack(stack);
        }

        return score;
    }

    for_cards_played(num: number) {
        if (num === 0) return 0;
        const actually_played_bonus = 200;
        const progressive_points_for_played_cards = 100 * num * num;
        return actually_played_bonus + progressive_points_for_played_cards;
    }
}

export const Score = new ScoreSingleton();
