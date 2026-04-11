import assert from "node:assert/strict";
import { CompleteTurnResult, PlayerTurn } from "./player_turn";
import { Score } from "../core/score";

// play a card then undo — cards_played returns to 0, score = 0
{
    const turn = new PlayerTurn(100);
    turn.update_score_after_move();
    assert.equal(turn.get_num_cards_played(), 1);
    turn.undo_score_after_move();
    assert.equal(turn.get_num_cards_played(), 0);
    assert.equal(turn.get_score(100), 0);
}

// board delta with no cards played
{
    const turn = new PlayerTurn(100);
    assert.equal(turn.get_score(150), 50);
    assert.equal(turn.get_score(100), 0);
    assert.equal(turn.get_score(80), -20);
}

// cards played bonus
{
    const turn = new PlayerTurn(0);
    turn.update_score_after_move();
    assert.equal(turn.get_score(0), Score.for_cards_played(1)); // 300
    turn.update_score_after_move();
    assert.equal(turn.get_score(0), Score.for_cards_played(2)); // 600
}

// empty hand bonus
{
    const turn = new PlayerTurn(0);
    turn.update_score_after_move();
    turn.update_score_for_empty_hand(false);
    assert.ok(turn.emptied_hand());
    assert.equal(turn.get_score(0), Score.for_cards_played(1) + 1000);

    turn.revoke_empty_hand_bonuses();
    assert.ok(!turn.emptied_hand());
    assert.equal(turn.get_score(0), Score.for_cards_played(1));
}

// victory bonus
{
    const turn = new PlayerTurn(0);
    turn.update_score_after_move();
    turn.update_score_for_empty_hand(true);
    assert.ok(turn.got_victory_bonus());
    assert.equal(turn.get_score(0), Score.for_cards_played(1) + 1000 + 500);
}

// turn_result
{
    const turn = new PlayerTurn(0);
    assert.equal(
        turn.turn_result(),
        CompleteTurnResult.SUCCESS_BUT_NEEDS_CARDS,
    );

    turn.update_score_after_move();
    assert.equal(turn.turn_result(), CompleteTurnResult.SUCCESS);

    turn.update_score_for_empty_hand(false);
    assert.equal(
        turn.turn_result(),
        CompleteTurnResult.SUCCESS_WITH_HAND_EMPTIED,
    );
}

// turn_result with victory
{
    const turn = new PlayerTurn(0);
    turn.update_score_after_move();
    turn.update_score_for_empty_hand(true);
    assert.equal(turn.turn_result(), CompleteTurnResult.SUCCESS_AS_VICTOR);
}

console.log("All player_turn tests passed.");
