// Tests for the Starred Messages plugin model (pure logic, no DOM).

import assert from "node:assert/strict";
import {
    ButtonState,
    StarredMessageState,
    StarredPluginModel,
} from "../plugins/starred_model";
import { fresh_db, make_message, add_to_db } from "./test_helpers";

// --- StarredMessageState tests ---

// Initial state is STARRED
{
    const state = new StarredMessageState(make_message({ id: 1 }));
    assert.equal(state.button_state, ButtonState.STARRED);
}

// request_unstar transitions to PENDING
{
    const state = new StarredMessageState(make_message({ id: 1 }));
    state.request_unstar();
    assert.equal(state.button_state, ButtonState.PENDING);
}

// handle_star_event confirms unstar → UNSTARRED
{
    const db = fresh_db();
    db.starred_ids.add(1);

    const state = new StarredMessageState(make_message({ id: 1 }));
    state.request_unstar();

    db.starred_ids.delete(1);
    assert(state.handle_star_event());
    assert.equal(state.button_state, ButtonState.UNSTARRED);
}

// handle_star_event confirms restar → STARRED
{
    const db = fresh_db();

    const state = new StarredMessageState(make_message({ id: 1 }));
    state.button_state = ButtonState.UNSTARRED;
    state.request_restar();

    db.starred_ids.add(1);
    assert(state.handle_star_event());
    assert.equal(state.button_state, ButtonState.STARRED);
}

// handle_star_event ignores events when not pending
{
    const db = fresh_db();
    db.starred_ids.add(1);

    const state = new StarredMessageState(make_message({ id: 1 }));
    assert(!state.handle_star_event());
    assert.equal(state.button_state, ButtonState.STARRED);
}

// --- StarredPluginModel tests ---

// refresh() collects starred, non-dismissed messages sorted by timestamp desc
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    add_to_db(db, make_message({ id: 3 }));
    db.starred_ids.add(1);
    db.starred_ids.add(3);

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.messages.length, 2);
    assert.equal(model.messages[0].id, 3); // newest first
    assert.equal(model.messages[1].id, 1);
}

// dismissed messages are excluded
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    db.starred_ids.add(1);
    db.starred_ids.add(2);

    const model = new StarredPluginModel();
    model.dismiss(1);
    model.refresh();

    assert.equal(model.messages.length, 1);
    assert.equal(model.messages[0].id, 2);
}

// starred_count and unstarred_count
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    db.starred_ids.add(1);
    db.starred_ids.add(2);

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.starred_count, 2);
    assert.equal(model.unstarred_count, 0);

    db.starred_ids.delete(1);
    assert.equal(model.starred_count, 1);
    assert.equal(model.unstarred_count, 1);
}

// counts_by_topic groups correctly
{
    const db = fresh_db();
    const topic = db.topic_map.get_or_make_topic_for(10, "test topic");
    add_to_db(db, make_message({ id: 1, topic_id: topic.topic_id }));
    add_to_db(db, make_message({ id: 2, topic_id: topic.topic_id }));
    db.starred_ids.add(1);
    db.starred_ids.add(2);

    const model = new StarredPluginModel();
    model.refresh();

    const counts = model.counts_by_topic;
    assert.equal(counts.length, 1);
    assert.equal(counts[0].count, 2);
    assert(counts[0].label.includes("General"));
}

// empty model
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.messages.length, 0);
}

console.log("  starred_test: OK");
