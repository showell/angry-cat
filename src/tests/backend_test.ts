// Tests for backend leaf modules: filter, message_list, channel_row,
// channel_row_query, grouping_sort, and action_log.

import assert from "node:assert/strict";
import type { Database } from "../backend/database";
import * as database from "../backend/database";
import { stream_filter, topic_filter } from "../backend/filter";
import { MessageList } from "../backend/message_list";
import { ChannelRow } from "../backend/channel_row";
import * as channel_row_query from "../backend/channel_row_query";
import { MessageIndex } from "../backend/message_index";
import { ReactionsMap } from "../backend/reactions";
import { TopicMap } from "../backend/topic_map";
import type { Message } from "../backend/db_types";
import { SortCycle, get_display_rows, sort_recent } from "../grouping_sort";
import * as action_log from "../action_log";

function make_db(): Database {
    return {
        current_user_id: 1,
        user_map: new Map([
            [1, { id: 1, email: "steve@test.com", full_name: "Steve", is_admin: true }],
        ]),
        channel_map: new Map([
            [10, { stream_id: 10, name: "General", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
            [20, { stream_id: 20, name: "Random", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
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

function make_msg(id: number, stream_id: number, topic_id: number): Message {
    return {
        id, content: "", sender_id: 1, stream_id,
        timestamp: 1000 + id, topic_id,
        local_message_id: undefined, type: "stream",
    };
}

// --- stream_filter and topic_filter ---

// stream_filter matches messages in the target channel
{
    const f = stream_filter(10);
    assert(f.predicate(make_msg(1, 10, 1)));
    assert(!f.predicate(make_msg(2, 20, 1)));
}

// topic_filter matches messages in the target topic
{
    const f = topic_filter(5);
    assert(f.predicate(make_msg(1, 10, 5)));
    assert(!f.predicate(make_msg(2, 10, 6)));
}

// --- MessageList ---

// Empty list has zeroed stats
{
    const ml = new MessageList();
    const info = ml.list_info();
    assert.equal(info.count, 0);
    assert.equal(info.last_msg_id, -1);
    assert.equal(info.num_topics, 0);
}

// list_info computes correct stats
{
    const db = make_db();
    database.set_db_for_testing(db);
    db.unread_ids.add(2);

    const ml = new MessageList();
    ml.push(make_msg(1, 10, 1));
    ml.push(make_msg(2, 10, 1));
    ml.push(make_msg(3, 10, 2));

    const info = ml.list_info();
    assert.equal(info.count, 3);
    assert.equal(info.last_msg_id, 3);
    assert.equal(info.unread_count, 1);
    assert.equal(info.num_topics, 2);
}

// --- ChannelRow ---

// ChannelRow wraps channel + list_info
{
    const channel = { stream_id: 10, name: "General", description: "", rendered_description: "", stream_weekly_traffic: 42 };
    const list_info = { last_msg_id: 5, count: 3, unread_count: 1, num_topics: 2 };
    const row = new ChannelRow(channel, list_info);

    assert.equal(row.name(), "General");
    assert.equal(row.stream_id(), 10);
    assert.equal(row.num_messages(), 3);
    assert.equal(row.unread_count(), 1);
    assert.equal(row.num_topics(), 2);
    assert.equal(row.num_children(), 2); // alias for num_topics
    assert.equal(row.stream_weekly_traffic(), 42);
}

// --- channel_row_query ---

// Builds channel rows from messages
{
    const db = make_db();
    database.set_db_for_testing(db);

    const msgs = [
        make_msg(1, 10, 1),
        make_msg(2, 10, 1),
        make_msg(3, 20, 2),
    ];

    const rows = channel_row_query.get_unsorted_rows(db.channel_map, msgs);
    assert.equal(rows.length, 2);

    // Rows follow channel_map iteration order, not sorted.
    const general = rows.find(r => r.name() === "General")!;
    const random = rows.find(r => r.name() === "Random")!;
    assert.equal(general.num_messages(), 2);
    assert.equal(random.num_messages(), 1);
}

// --- SortCycle ---

// Cycles through modes
{
    const sc = new SortCycle("Most Topics", "recent");
    assert.equal(sc.mode, "recent");
    assert.equal(sc.label(), "Most Recent");

    sc.toggle();
    assert.equal(sc.mode, "alpha");
    assert.equal(sc.label(), "A-Z");

    sc.toggle();
    assert.equal(sc.mode, "count");
    assert.equal(sc.label(), "Most Topics"); // custom count label

    sc.toggle();
    assert.equal(sc.mode, "recent");
}

// --- get_display_rows ---

type FakeGrouping = { _name: string; _children: number; _last: number };

function fg(name: string, children: number, last: number): FakeGrouping {
    return { _name: name, _children: children, _last: last };
}

// Make FakeGrouping implement MessageGrouping
const wrap = (items: FakeGrouping[]) =>
    items.map(i => ({
        name: () => i._name,
        num_children: () => i._children,
        last_msg_id: () => i._last,
    }));

// recent mode returns all rows in original order
{
    const rows = wrap([fg("B", 2, 10), fg("A", 1, 5)]);
    const result = get_display_rows(rows, "recent", 100);
    assert.equal(result.length, 2);
    assert.equal(result[0].name(), "B");
}

// count mode sorts by num_children descending
{
    const rows = wrap([fg("A", 1, 10), fg("B", 5, 5), fg("C", 3, 1)]);
    const result = get_display_rows(rows, "count", 100);
    assert.equal(result[0].name(), "B");
    assert.equal(result[1].name(), "C");
}

// alpha mode sorts alphabetically and respects batch_size
{
    const rows = wrap([fg("C", 1, 1), fg("A", 1, 2), fg("B", 1, 3)]);
    const result = get_display_rows(rows, "alpha", 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].name(), "A");
    assert.equal(result[1].name(), "C");
}

// --- sort_recent ---

{
    const rows = wrap([fg("A", 1, 5), fg("B", 1, 10), fg("C", 1, 1)]);
    sort_recent(rows);
    assert.equal(rows[0].name(), "B");
    assert.equal(rows[2].name(), "C");
}

// --- action_log ---

// Records entries and notifies listener
{
    let notified = false;
    action_log.on_change(() => { notified = true; });

    const addr = { channel_id: 10, topic_id: 1, message_id: undefined };
    action_log.record(action_log.ActionType.TOPIC_VIEWED, addr);

    assert(notified);
    const entries = action_log.get_entries();
    assert(entries.length >= 1);
    const last = entries[entries.length - 1];
    assert.equal(last.action, "Viewed topic");
    assert.equal(last.address.channel_id, 10);
}

console.log("  backend_test: OK");
