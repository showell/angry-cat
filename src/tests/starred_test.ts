// Tests for the Starred Messages plugin model (pure logic, no DOM).

import assert from "node:assert/strict";
import type { Database } from "../backend/database";
import * as database from "../backend/database";
import { MessageIndex } from "../backend/message_index";
import { ReactionsMap } from "../backend/reactions";
import { TopicMap } from "../backend/topic_map";
import type { Message } from "../backend/db_types";
import {
    ButtonState,
    StarredMessageState,
    StarredPluginModel,
} from "../plugins/starred_model";

function make_db(): Database {
    return {
        current_user_id: 1,
        user_map: new Map([
            [1, { id: 1, email: "steve@test.com", full_name: "Steve", is_admin: true }],
            [2, { id: 2, email: "claude@test.com", full_name: "Claude", is_admin: false }],
        ]),
        channel_map: new Map([
            [10, { stream_id: 10, name: "General", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
        ]),
        topic_map: new TopicMap(),
        message_map: new Map(),
        message_index: new MessageIndex(),
        reactions_map: new ReactionsMap(),
        unread_ids: new Set(),
        image_message_ids: new Set(),
        code_message_ids: new Set(),
        mention_message_ids: new Set(),
        starred_ids: new Set(),
    };
}

function add_message(db: Database, id: number, sender_id: number): Message {
    const topic = db.topic_map.get_or_make_topic_for(10, "test topic");
    const msg: Message = {
        id,
        content: `<p>message ${id}</p>`,
        sender_id,
        stream_id: 10,
        timestamp: 1000 + id,
        topic_id: topic.topic_id,
        local_message_id: undefined,
        type: "stream",
    };
    db.message_map.set(id, msg);
    db.message_index.add_message(msg);
    return msg;
}

// --- StarredMessageState tests ---

// Initial state is STARRED
{
    const msg: Message = {
        id: 1, content: "", sender_id: 1, stream_id: 10,
        timestamp: 1000, topic_id: 1, local_message_id: undefined, type: "stream",
    };
    const state = new StarredMessageState(msg);
    assert.equal(state.button_state, ButtonState.STARRED);
}

// request_unstar transitions to PENDING
{
    const msg: Message = {
        id: 1, content: "", sender_id: 1, stream_id: 10,
        timestamp: 1000, topic_id: 1, local_message_id: undefined, type: "stream",
    };
    const state = new StarredMessageState(msg);
    state.request_unstar();
    assert.equal(state.button_state, ButtonState.PENDING);
}

// handle_star_event confirms unstar → UNSTARRED
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    db.starred_ids.add(1);

    const state = new StarredMessageState(db.message_map.get(1)!);
    state.request_unstar();

    // Simulate server confirming the unstar.
    db.starred_ids.delete(1);
    const changed = state.handle_star_event();

    assert(changed);
    assert.equal(state.button_state, ButtonState.UNSTARRED);
}

// handle_star_event confirms restar → STARRED
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    // Message starts unstarred in the model's view.
    const state = new StarredMessageState(db.message_map.get(1)!);
    state.button_state = ButtonState.UNSTARRED;
    state.request_restar();

    // Server confirms.
    db.starred_ids.add(1);
    const changed = state.handle_star_event();

    assert(changed);
    assert.equal(state.button_state, ButtonState.STARRED);
}

// handle_star_event ignores events when not pending
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    db.starred_ids.add(1);

    const state = new StarredMessageState(db.message_map.get(1)!);
    // No request made — event should be ignored.
    const changed = state.handle_star_event();
    assert(!changed);
    assert.equal(state.button_state, ButtonState.STARRED);
}

// --- StarredPluginModel tests ---

// refresh() collects starred, non-dismissed messages sorted by timestamp desc
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    add_message(db, 2, 2);
    add_message(db, 3, 1);

    db.starred_ids.add(1);
    db.starred_ids.add(3);

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.messages.length, 2);
    // Newest first (id 3 has higher timestamp).
    assert.equal(model.messages[0].id, 3);
    assert.equal(model.messages[1].id, 1);
}

// dismissed messages are excluded
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    add_message(db, 2, 1);
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
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    add_message(db, 2, 1);
    db.starred_ids.add(1);
    db.starred_ids.add(2);

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.starred_count, 2);
    assert.equal(model.unstarred_count, 0);

    // Unstar one.
    db.starred_ids.delete(1);
    assert.equal(model.starred_count, 1);
    assert.equal(model.unstarred_count, 1);
}

// counts_by_topic groups correctly
{
    const db = make_db();
    database.set_db_for_testing(db);

    // Two messages in "test topic" (same topic from add_message).
    add_message(db, 1, 1);
    add_message(db, 2, 1);
    db.starred_ids.add(1);
    db.starred_ids.add(2);

    const model = new StarredPluginModel();
    model.refresh();

    const counts = model.counts_by_topic;
    assert.equal(counts.length, 1);
    assert.equal(counts[0].count, 2);
    assert(counts[0].label.includes("General"));
    assert(counts[0].label.includes("test topic"));
}

// empty model
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, 1);
    // Not starred.

    const model = new StarredPluginModel();
    model.refresh();

    assert.equal(model.messages.length, 0);
    assert.equal(model.starred_count, 0);
}

console.log("  starred_test: OK");
