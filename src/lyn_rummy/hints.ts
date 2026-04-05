import { CardStack, type HandCard } from "./card_stack";

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
