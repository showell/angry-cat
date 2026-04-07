import assert from "node:assert/strict";
import type { Database } from "../backend/database";
import * as database from "../backend/database";
import { EventFlavor } from "../backend/event";
import { MessageIndex } from "../backend/message_index";
import { ReactionsMap } from "../backend/reactions";
import { TopicMap } from "../backend/topic_map";
import type { Message } from "../backend/db_types";

function make_db(): Database {
    return {
        current_user_id: 1,
        user_map: new Map([
            [1, { id: 1, email: "steve@test.com", full_name: "Steve", is_admin: true }],
            [2, { id: 2, email: "claude@test.com", full_name: "Claude", is_admin: false }],
        ]),
        channel_map: new Map([
            [10, { stream_id: 10, name: "general", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
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

function make_message(id: number, topic_id: number): Message {
    return {
        id,
        content: "<p>test</p>",
        sender_id: 1,
        stream_id: 10,
        timestamp: 1000,
        topic_id,
        local_message_id: undefined,
        type: "stream",
    };
}

function set_db(db: Database): void {
    database.set_db_for_testing(db);
}

// MESSAGE event adds to message_map and message_index
{
    const db = make_db();
    set_db(db);

    const topic = db.topic_map.get_or_make_topic_for(10, "hello");
    const msg = make_message(100, topic.topic_id);

    database.handle_event({
        flavor: EventFlavor.MESSAGE,
        message: msg,
        info: "",
    });

    assert(db.message_map.has(100));
    const ids = db.message_index.candidate_message_ids_for_topic_id(topic.topic_id);
    assert(ids.has(100));
}

// MUTATE_UNREAD event toggles unread_ids
{
    const db = make_db();
    set_db(db);

    const topic = db.topic_map.get_or_make_topic_for(10, "hello");
    const msg = make_message(100, topic.topic_id);
    db.message_map.set(100, msg);

    // Mark unread.
    database.handle_event({
        flavor: EventFlavor.MUTATE_UNREAD,
        message_ids: [100],
        unread: true,
    });
    assert(db.unread_ids.has(100));

    // Mark read.
    database.handle_event({
        flavor: EventFlavor.MUTATE_UNREAD,
        message_ids: [100],
        unread: false,
    });
    assert(!db.unread_ids.has(100));
}

// MUTATE_STARRED event toggles starred_ids
{
    const db = make_db();
    set_db(db);

    const msg = make_message(100, 1);
    db.message_map.set(100, msg);

    database.handle_event({
        flavor: EventFlavor.MUTATE_STARRED,
        message_ids: [100],
        starred: true,
    });
    assert(db.starred_ids.has(100));

    database.handle_event({
        flavor: EventFlavor.MUTATE_STARRED,
        message_ids: [100],
        starred: false,
    });
    assert(!db.starred_ids.has(100));
}

// MUTATE_MESSAGE_CONTENT event updates content
{
    const db = make_db();
    set_db(db);

    const msg = make_message(100, 1);
    db.message_map.set(100, msg);

    database.handle_event({
        flavor: EventFlavor.MUTATE_MESSAGE_CONTENT,
        message_id: 100,
        raw_content: "updated",
        content: "<p>updated</p>",
    });

    assert.equal(db.message_map.get(100)!.content, "<p>updated</p>");
}

// MUTATE_STREAM event updates channel description
{
    const db = make_db();
    set_db(db);

    database.handle_event({
        flavor: EventFlavor.MUTATE_STREAM,
        stream_id: 10,
        description: "new desc",
        rendered_description: "<p>new desc</p>",
    });

    assert.equal(db.channel_map.get(10)!.description, "new desc");
    assert.equal(db.channel_map.get(10)!.rendered_description, "<p>new desc</p>");
}

// is_unread and is_starred helpers
{
    const db = make_db();
    set_db(db);

    assert(!database.is_unread(100));
    db.unread_ids.add(100);
    assert(database.is_unread(100));

    assert(!database.is_starred(100));
    db.starred_ids.add(100);
    assert(database.is_starred(100));
}

console.log("  database_test: OK");
