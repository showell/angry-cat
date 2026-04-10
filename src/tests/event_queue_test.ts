import assert from "node:assert/strict";

import { assert_event_id, last_real_event_id } from "../backend/event_queue";

// assert_event_id accepts integers
{
    assert.equal(assert_event_id(0), 0);
    assert.equal(assert_event_id(42), 42);
    assert.equal(assert_event_id(-1), -1);
}

// assert_event_id rejects non-integers
{
    assert.throws(() => assert_event_id(1.5));
    assert.throws(() => assert_event_id("3"));
    assert.throws(() => assert_event_id(null));
    assert.throws(() => assert_event_id(undefined));
}

// last_real_event_id returns the last real event's id
{
    const events = [
        { type: "message", id: 0 },
        { type: "message", id: 1 },
        { type: "message", id: 2 },
    ];
    assert.equal(last_real_event_id(events, -1), 2);
}

// last_real_event_id skips heartbeats
{
    const events = [
        { type: "message", id: 0 },
        { type: "heartbeat", id: 1 },
    ];
    // The real event is id=0; the heartbeat at id=1 must not
    // advance the cursor, because the next real event from the
    // server will also use id=1.
    assert.equal(last_real_event_id(events, -1), 0);
}

// last_real_event_id returns fallback when all events are heartbeats
{
    const events = [
        { type: "heartbeat", id: 5 },
    ];
    assert.equal(last_real_event_id(events, 4), 4);
}

// last_real_event_id handles interleaved heartbeats
{
    const events = [
        { type: "heartbeat", id: 99 },
        { type: "message", id: 3 },
        { type: "heartbeat", id: 100 },
        { type: "update_message", id: 4 },
        { type: "heartbeat", id: 101 },
    ];
    assert.equal(last_real_event_id(events, -1), 4);
}

// last_real_event_id with empty array returns fallback
{
    assert.equal(last_real_event_id([], 7), 7);
}

console.log("  event_queue_test: OK");
