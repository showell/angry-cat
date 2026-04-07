// Tests for backend leaf modules: filter, message_list, channel_row,
// channel_row_query, grouping_sort, and action_log.

import assert from "node:assert/strict";
import * as database from "../backend/database";
import { stream_filter, topic_filter } from "../backend/filter";
import { MessageList } from "../backend/message_list";
import { ChannelRow } from "../backend/channel_row";
import * as channel_row_query from "../backend/channel_row_query";
import { SortCycle, get_display_rows, sort_recent } from "../grouping_sort";
import * as action_log from "../action_log";
import { fresh_db, make_message } from "./test_helpers";

// --- stream_filter and topic_filter ---

{
    const f = stream_filter(10);
    assert(f.predicate(make_message({ id: 1, stream_id: 10 })));
    assert(!f.predicate(make_message({ id: 2, stream_id: 20 })));
}

{
    const f = topic_filter(5);
    assert(f.predicate(make_message({ id: 1, topic_id: 5 })));
    assert(!f.predicate(make_message({ id: 2, topic_id: 6 })));
}

// --- MessageList ---

// Empty list has zeroed stats
{
    fresh_db();
    const ml = new MessageList();
    const info = ml.list_info();
    assert.equal(info.count, 0);
    assert.equal(info.last_msg_id, -1);
}

// list_info computes correct stats
{
    const db = fresh_db();
    db.unread_ids.add(2);

    const ml = new MessageList();
    ml.push(make_message({ id: 1, topic_id: 1 }));
    ml.push(make_message({ id: 2, topic_id: 1 }));
    ml.push(make_message({ id: 3, topic_id: 2 }));

    const info = ml.list_info();
    assert.equal(info.count, 3);
    assert.equal(info.last_msg_id, 3);
    assert.equal(info.unread_count, 1);
    assert.equal(info.num_topics, 2);
}

// --- ChannelRow ---

{
    const channel = { stream_id: 10, name: "General", description: "", rendered_description: "", stream_weekly_traffic: 42 };
    const list_info = { last_msg_id: 5, count: 3, unread_count: 1, num_topics: 2 };
    const row = new ChannelRow(channel, list_info);

    assert.equal(row.name(), "General");
    assert.equal(row.num_messages(), 3);
    assert.equal(row.unread_count(), 1);
    assert.equal(row.num_children(), 2);
    assert.equal(row.stream_weekly_traffic(), 42);
}

// --- channel_row_query ---

{
    const db = fresh_db();
    const msgs = [
        make_message({ id: 1, stream_id: 10, topic_id: 1 }),
        make_message({ id: 2, stream_id: 10, topic_id: 1 }),
        make_message({ id: 3, stream_id: 20, topic_id: 2 }),
    ];

    const rows = channel_row_query.get_unsorted_rows(db.channel_map, msgs);
    assert.equal(rows.length, 2);

    const general = rows.find(r => r.name() === "General")!;
    const random = rows.find(r => r.name() === "Random")!;
    assert.equal(general.num_messages(), 2);
    assert.equal(random.num_messages(), 1);
}

// --- SortCycle ---

{
    const sc = new SortCycle("Most Topics", "recent");
    assert.equal(sc.label(), "Most Recent");

    sc.toggle();
    assert.equal(sc.mode, "alpha");

    sc.toggle();
    assert.equal(sc.label(), "Most Topics");

    sc.toggle();
    assert.equal(sc.mode, "recent");
}

// --- get_display_rows ---

type FG = { name: () => string; num_children: () => number; last_msg_id: () => number };

function fg(name: string, children: number, last: number): FG {
    return { name: () => name, num_children: () => children, last_msg_id: () => last };
}

// count mode sorts by num_children descending
{
    const rows = [fg("A", 1, 10), fg("B", 5, 5), fg("C", 3, 1)];
    const result = get_display_rows(rows, "count", 100);
    assert.equal(result[0].name(), "B");
    assert.equal(result[1].name(), "C");
}

// alpha mode sorts alphabetically and respects batch_size
{
    const rows = [fg("C", 1, 1), fg("A", 1, 2), fg("B", 1, 3)];
    const result = get_display_rows(rows, "alpha", 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].name(), "A");
    assert.equal(result[1].name(), "C");
}

// sort_recent
{
    const rows = [fg("A", 1, 5), fg("B", 1, 10), fg("C", 1, 1)];
    sort_recent(rows);
    assert.equal(rows[0].name(), "B");
    assert.equal(rows[2].name(), "C");
}

// --- action_log ---

{
    let notified = false;
    action_log.on_change(() => { notified = true; });

    const addr = { channel_id: 10, topic_id: 1, message_id: undefined };
    action_log.record(action_log.ActionType.TOPIC_VIEWED, addr);

    assert(notified);
    const last = action_log.get_entries()[action_log.get_entries().length - 1];
    assert.equal(last.action, "Viewed topic");
    assert.equal(last.address.channel_id, 10);
}

console.log("  backend_test: OK");
