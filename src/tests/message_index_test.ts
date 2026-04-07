import assert from "node:assert/strict";
import { MessageIndex } from "../backend/message_index";

// Empty index returns empty set
{
    const idx = new MessageIndex();
    const result = idx.candidate_message_ids_for_topic_id(1);
    assert.equal(result.size, 0);
}

// add_item and retrieval
{
    const idx = new MessageIndex();
    idx.add_item({ topic_id: 1, message_id: 100 });
    idx.add_item({ topic_id: 1, message_id: 101 });
    idx.add_item({ topic_id: 2, message_id: 200 });

    const topic1 = idx.candidate_message_ids_for_topic_id(1);
    assert.equal(topic1.size, 2);
    assert(topic1.has(100));
    assert(topic1.has(101));

    const topic2 = idx.candidate_message_ids_for_topic_id(2);
    assert.equal(topic2.size, 1);
    assert(topic2.has(200));
}

// add_message works the same way
{
    const idx = new MessageIndex();
    idx.add_message({
        id: 42,
        topic_id: 5,
        content: "",
        sender_id: 1,
        stream_id: 1,
        timestamp: 0,
        local_message_id: undefined,
        type: "stream",
    });

    const result = idx.candidate_message_ids_for_topic_id(5);
    assert.equal(result.size, 1);
    assert(result.has(42));
}

// Duplicate message IDs are deduplicated (returns a Set)
{
    const idx = new MessageIndex();
    idx.add_item({ topic_id: 1, message_id: 100 });
    idx.add_item({ topic_id: 1, message_id: 100 });

    const result = idx.candidate_message_ids_for_topic_id(1);
    assert.equal(result.size, 1);
}

console.log("  message_index_test: OK");
