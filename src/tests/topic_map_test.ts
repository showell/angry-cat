import assert from "node:assert/strict";
import { TopicMap } from "../backend/topic_map";

// get_or_make_topic_for creates topics with sequential IDs
{
    const tm = new TopicMap();
    const t1 = tm.get_or_make_topic_for(10, "hello");
    const t2 = tm.get_or_make_topic_for(10, "world");
    assert.equal(t1.topic_id, 1);
    assert.equal(t2.topic_id, 2);
    assert.equal(t1.channel_id, 10);
    assert.equal(t1.topic_name, "hello");
}

// get_or_make_topic_for returns existing topic on duplicate
{
    const tm = new TopicMap();
    const t1 = tm.get_or_make_topic_for(10, "hello");
    const t2 = tm.get_or_make_topic_for(10, "hello");
    assert.equal(t1.topic_id, t2.topic_id);
    assert.equal(tm.map.size, 1);
}

// Same topic name in different channels gets different IDs
{
    const tm = new TopicMap();
    const t1 = tm.get_or_make_topic_for(10, "hello");
    const t2 = tm.get_or_make_topic_for(20, "hello");
    assert.notEqual(t1.topic_id, t2.topic_id);
}

// get retrieves by ID
{
    const tm = new TopicMap();
    const t1 = tm.get_or_make_topic_for(10, "hello");
    assert.equal(tm.get(t1.topic_id).topic_name, "hello");
}

// find_topic returns undefined for unknown topics
{
    const tm = new TopicMap();
    assert.equal(tm.find_topic(10, "nope"), undefined);
}

// find_topic returns the topic without creating it
{
    const tm = new TopicMap();
    tm.get_or_make_topic_for(10, "hello");
    const found = tm.find_topic(10, "hello");
    assert.equal(found?.topic_name, "hello");

    // Searching for an unknown topic should not create it.
    tm.find_topic(10, "nope");
    assert.equal(tm.map.size, 1);
}

console.log("  topic_map_test: OK");
