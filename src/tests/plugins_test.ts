// Tests for plugin logic. We populate the detection Sets directly
// (code_message_ids, image_message_ids, mention_message_ids) rather
// than going through parse_content, so we test the predicates and
// filtering without depending on the DOMParser mock.

import assert from "node:assert/strict";
import { has_code, has_images, has_mention } from "../backend/database";
import type { Message } from "../backend/db_types";
import * as model from "../backend/model";
import { ReadingList } from "../plugins/reading_list";
import { fresh_db, make_message, add_to_db } from "./test_helpers";

// --- Code Search: finds messages with code blocks ---
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    db.code_message_ids.add(2);

    assert(!has_code(1));
    assert(has_code(2));

    const filtered = model.recent_filtered_messages(
        { predicate: (m: Message) => has_code(m.id) }, 100,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 2);
}

// --- Image Search: finds messages with images ---
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    db.image_message_ids.add(2);

    assert(!has_images(1));
    assert(has_images(2));
}

// --- Mentions: finds messages where current user is mentioned ---
{
    const db = fresh_db();
    add_to_db(db, make_message({ id: 1 }));
    add_to_db(db, make_message({ id: 2 }));
    add_to_db(db, make_message({ id: 3 }));
    db.mention_message_ids.add(2); // current user mentioned

    assert(!has_mention(1));
    assert(has_mention(2));
    assert(!has_mention(3));

    const filtered = model.recent_filtered_messages(
        { predicate: (m: Message) => has_mention(m.id) }, 100,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 2);
}

// --- recent_filtered_messages respects limit ---
{
    const db = fresh_db();
    for (let i = 1; i <= 10; i++) {
        add_to_db(db, make_message({ id: i }));
        db.code_message_ids.add(i);
    }

    const limited = model.recent_filtered_messages(
        { predicate: (m: Message) => has_code(m.id) }, 3,
    );
    assert.equal(limited.length, 3);
    // Should be the 3 most recent (highest timestamps).
    assert.equal(limited[0].id, 8);
    assert.equal(limited[2].id, 10);
}

// --- Reading List: add items and check membership ---
{
    const db = fresh_db();

    const rl = new ReadingList();
    assert.equal(rl.item_count(), 0);

    rl.add_text_item("Read this article");
    assert.equal(rl.item_count(), 1);

    const topic = db.topic_map.get_or_make_topic_for(10, "design");
    rl.add_address_link_item({ channel_id: 10, topic_id: topic.topic_id, message_id: undefined });
    assert.equal(rl.item_count(), 2);

    assert(rl.is_topic_in_list(topic.topic_id));
    assert(!rl.is_topic_in_list(999));
}

// --- Recent Conversations: messages_grouped_by_topic ---
{
    const db = fresh_db();

    const topicA = db.topic_map.get_or_make_topic_for(10, "topic A");
    const topicB = db.topic_map.get_or_make_topic_for(10, "topic B");

    for (const [id, tid] of [[1, topicA.topic_id], [2, topicA.topic_id], [3, topicA.topic_id], [4, topicB.topic_id], [5, topicB.topic_id]] as [number, number][]) {
        add_to_db(db, make_message({ id, topic_id: tid }));
    }

    const grouped = model.messages_grouped_by_topic();
    assert.equal(grouped.get(topicA.topic_id)!.length, 3);
    assert.equal(grouped.get(topicB.topic_id)!.length, 2);
}

console.log("  plugins_test: OK");
