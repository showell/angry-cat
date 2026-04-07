// Tests for plugin logic. We test the data/filtering layer rather
// than the DOM rendering. For plugins that are pure UI wrappers
// around a predicate, we verify the predicate works correctly.

import assert from "node:assert/strict";
import type { Database } from "../backend/database";
import * as database from "../backend/database";
import {
    has_code,
    has_images,
    has_mention,
} from "../backend/database";
import * as model from "../backend/model";
import { MessageIndex } from "../backend/message_index";
import { ReactionsMap } from "../backend/reactions";
import { TopicMap } from "../backend/topic_map";
import type { Message } from "../backend/db_types";
import * as parse from "../backend/parse";
import { ReadingList } from "../plugins/reading_list";

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

function add_message(db: Database, id: number, content: string): Message {
    const topic = db.topic_map.get_or_make_topic_for(10, "test");
    const msg: Message = {
        id,
        content,
        sender_id: 2,
        stream_id: 10,
        timestamp: 1000 + id,
        topic_id: topic.topic_id,
        local_message_id: undefined,
        type: "stream",
    };
    db.message_map.set(id, msg);
    db.message_index.add_message(msg);
    // Run parse_content so the Sets get populated.
    parse.parse_content(msg, db);
    return msg;
}

// --- Code Search: finds messages with code blocks ---
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, "<p>no code here</p>");
    add_message(db, 2, `<div class="codehilite"><pre><code>x = 1</code></pre></div>`);
    add_message(db, 3, "<p>also no code</p>");

    assert(!has_code(1));
    assert(has_code(2));
    assert(!has_code(3));

    const filtered = model.recent_filtered_messages(
        { predicate: (m: Message) => has_code(m.id) },
        100,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 2);
}

// --- Image Search: finds messages with images ---
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, "<p>just text</p>");
    add_message(db, 2, `<p>look: <img src="/uploads/cat.png"></p>`);

    assert(!has_images(1));
    assert(has_images(2));

    const filtered = model.recent_filtered_messages(
        { predicate: (m: Message) => has_images(m.id) },
        100,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 2);
}

// --- Mentions: finds messages where current user is mentioned ---
{
    const db = make_db();
    database.set_db_for_testing(db);

    add_message(db, 1, "<p>hello world</p>");
    add_message(db, 2, `<p>hey <span class="user-mention" data-user-id="1">@Steve</span></p>`);
    add_message(db, 3, `<p>hey <span class="user-mention" data-user-id="2">@Claude</span></p>`);

    assert(!has_mention(1));
    assert(has_mention(2));  // mentions user 1 (current user)
    assert(!has_mention(3)); // mentions user 2, not current user

    const filtered = model.recent_filtered_messages(
        { predicate: (m: Message) => has_mention(m.id) },
        100,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 2);
}

// --- recent_filtered_messages respects limit ---
{
    const db = make_db();
    database.set_db_for_testing(db);

    for (let i = 1; i <= 10; i++) {
        const msg = add_message(db, i, `<div class="codehilite"><pre><code>${i}</code></pre></div>`);
    }

    const limited = model.recent_filtered_messages(
        { predicate: (m: Message) => has_code(m.id) },
        3,
    );
    assert.equal(limited.length, 3);
    // Should be the 3 most recent (highest timestamps).
    assert.equal(limited[0].id, 8);
    assert.equal(limited[2].id, 10);
}

// --- Reading List: add items and check membership ---
{
    const db = make_db();
    database.set_db_for_testing(db);

    const rl = new ReadingList();
    assert.equal(rl.item_count(), 0);

    rl.add_text_item("Read this article");
    assert.equal(rl.item_count(), 1);

    const topic = db.topic_map.get_or_make_topic_for(10, "design");
    const addr = { channel_id: 10, topic_id: topic.topic_id, message_id: undefined };
    rl.add_address_link_item(addr);
    assert.equal(rl.item_count(), 2);

    assert(rl.is_topic_in_list(topic.topic_id));
    assert(!rl.is_topic_in_list(999));
}

// --- Recent Conversations: get_recent_message_rows returns unique topics ---
// (We test the underlying data query, not the DOM table.)
{
    const db = make_db();
    database.set_db_for_testing(db);

    // 3 messages in topic A, 2 in topic B.
    const topicA = db.topic_map.get_or_make_topic_for(10, "topic A");
    const topicB = db.topic_map.get_or_make_topic_for(10, "topic B");

    for (const [id, tid] of [[1, topicA.topic_id], [2, topicA.topic_id], [3, topicA.topic_id], [4, topicB.topic_id], [5, topicB.topic_id]] as [number, number][]) {
        const msg: Message = {
            id, content: "", sender_id: 1, stream_id: 10,
            timestamp: 1000 + id, topic_id: tid,
            local_message_id: undefined, type: "stream",
        };
        db.message_map.set(id, msg);
        db.message_index.add_message(msg);
    }

    const grouped = model.messages_grouped_by_topic();
    assert.equal(grouped.get(topicA.topic_id)!.length, 3);
    assert.equal(grouped.get(topicB.topic_id)!.length, 2);
}

console.log("  plugins_test: OK");
