import assert from "node:assert/strict";
import * as database from "../backend/database";
import { EventFlavor } from "../backend/event";
import { fresh_db, make_message } from "./test_helpers";

// MESSAGE event adds to message_map and message_index
{
    const db = fresh_db();
    const topic = db.topic_map.get_or_make_topic_for(10, "hello");
    const msg = make_message({ id: 100, topic_id: topic.topic_id });

    database.handle_event({ flavor: EventFlavor.MESSAGE, message: msg, info: "" });

    assert(db.message_map.has(100));
    assert(db.message_index.candidate_message_ids_for_topic_id(topic.topic_id).has(100));
}

// MUTATE_UNREAD event toggles unread_ids
{
    const db = fresh_db();
    db.message_map.set(100, make_message({ id: 100 }));

    database.handle_event({ flavor: EventFlavor.MUTATE_UNREAD, message_ids: [100], unread: true });
    assert(db.unread_ids.has(100));

    database.handle_event({ flavor: EventFlavor.MUTATE_UNREAD, message_ids: [100], unread: false });
    assert(!db.unread_ids.has(100));
}

// MUTATE_STARRED event toggles starred_ids
{
    const db = fresh_db();
    db.message_map.set(100, make_message({ id: 100 }));

    database.handle_event({ flavor: EventFlavor.MUTATE_STARRED, message_ids: [100], starred: true });
    assert(db.starred_ids.has(100));

    database.handle_event({ flavor: EventFlavor.MUTATE_STARRED, message_ids: [100], starred: false });
    assert(!db.starred_ids.has(100));
}

// MUTATE_MESSAGE_CONTENT event updates content
{
    const db = fresh_db();
    db.message_map.set(100, make_message({ id: 100 }));

    database.handle_event({
        flavor: EventFlavor.MUTATE_MESSAGE_CONTENT,
        message_id: 100, raw_content: "updated", content: "<p>updated</p>",
    });
    assert.equal(db.message_map.get(100)!.content, "<p>updated</p>");
}

// MUTATE_STREAM event updates channel description
{
    const db = fresh_db();

    database.handle_event({
        flavor: EventFlavor.MUTATE_STREAM,
        stream_id: 10, description: "new desc", rendered_description: "<p>new desc</p>",
    });
    assert.equal(db.channel_map.get(10)!.description, "new desc");
}

// is_unread and is_starred helpers
{
    const db = fresh_db();

    assert(!database.is_unread(100));
    db.unread_ids.add(100);
    assert(database.is_unread(100));

    assert(!database.is_starred(100));
    db.starred_ids.add(100);
    assert(database.is_starred(100));
}

console.log("  database_test: OK");
