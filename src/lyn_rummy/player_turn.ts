import { Score } from "./score";

export enum CompleteTurnResult {
    SUCCESS,
    SUCCESS_BUT_NEEDS_CARDS,
    SUCCESS_WITH_HAND_EMPTIED,
    SUCCESS_AS_VICTOR,
    FAILURE,
}

export class PlayerTurn {
    starting_board_score: number;
    cards_played_during_turn: number;
    empty_hand_bonus: number;
    victory_bonus: number;

    constructor(starting_board_score: number) {
        this.starting_board_score = starting_board_score;
        this.cards_played_during_turn = 0;
        this.empty_hand_bonus = 0;
        this.victory_bonus = 0;
    }

    get_score(current_board_score: number): number {
        const board_score = current_board_score - this.starting_board_score;
        const cards_score = Score.for_cards_played(
            this.cards_played_during_turn,
        );

        return (
            board_score +
            cards_score +
            this.victory_bonus +
            this.empty_hand_bonus
        );
    }

    get_num_cards_played(): number {
        return this.cards_played_during_turn;
    }

    emptied_hand(): boolean {
        return this.empty_hand_bonus > 0;
    }

    got_victory_bonus(): boolean {
        return this.victory_bonus > 0;
    }

    update_score_after_move() {
        // We get called once and only once each time
        // a card is released to the board.
        this.cards_played_during_turn += 1;
    }

    undo_score_after_move() {
        this.cards_played_during_turn -= 1;
    }

    revoke_empty_hand_bonuses() {
        this.empty_hand_bonus = 0;
        this.victory_bonus = 0;
    }

    update_score_for_empty_hand(is_victor: boolean) {
        this.empty_hand_bonus = 1000;

        if (is_victor) {
            this.victory_bonus = 500;
        }
    }

    turn_result(): CompleteTurnResult {
        if (this.get_num_cards_played() === 0) {
            return CompleteTurnResult.SUCCESS_BUT_NEEDS_CARDS;
        } else if (this.emptied_hand()) {
            if (this.got_victory_bonus()) {
                return CompleteTurnResult.SUCCESS_AS_VICTOR;
            } else {
                return CompleteTurnResult.SUCCESS_WITH_HAND_EMPTIED;
            }
        } else {
            // vanilla success...we played some cards
            return CompleteTurnResult.SUCCESS;
        }
    }
}
