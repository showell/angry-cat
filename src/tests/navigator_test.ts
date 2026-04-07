// Tests for navigator keyboard handlers.
//
// Each test tells a story from the user's perspective: "I want to
// find the unread message, read it, and mark it as read." We mock
// the Context interfaces to track what the navigator does in
// response to each keypress.

import assert from "node:assert/strict";
import { handle_arrow_down, handle_arrow_up } from "../arrow_keys";
import { handle_enter_key } from "../enter_key";
import { handle_esc_key } from "../esc_key";
import { handle_n_key, NextTopicResult } from "../n_key";

// --- Mock context builder ---
//
// Simulates a navigator with channels and topics. The user can
// browse channels, drill into topics, and read messages. Each
// mock tracks which methods were called so we can assert the
// navigation path.

type Channel = {
    id: number;
    name: string;
    topics: { id: number; name: string; unread: boolean }[];
};

function make_navigator(channels: Channel[]) {
    let selected_channel_id: number | undefined;
    let selected_topic_id: number | undefined;
    let topic_mode = false;
    let message_list_focused = false;
    let composing = false;
    let reply_open = false;
    let add_topic_open = false;
    const calls: string[] = [];

    function selected_channel(): Channel | undefined {
        return channels.find((c) => c.id === selected_channel_id);
    }

    function selected_topic() {
        const ch = selected_channel();
        return ch?.topics.find((t) => t.id === selected_topic_id);
    }

    // Shared context methods used by all key handlers.
    const ctx = {
        // --- State queries ---
        channel_selected: () => selected_channel_id !== undefined,
        topic_selected: () => selected_topic_id !== undefined,
        in_topic_mode: () => topic_mode,
        is_composing: () => composing,
        reply_pane_open: () => reply_open,
        add_topic_pane_open: () => add_topic_open,
        message_list_focused: () => message_list_focused,

        get_channel_name: () => selected_channel()?.name,
        get_topic_name: () => selected_topic()?.name,

        // --- Channel navigation ---
        get_first_channel_id: () => channels[0]?.id,
        get_next_channel_id: () => {
            const idx = channels.findIndex((c) => c.id === selected_channel_id);
            return channels[idx + 1]?.id;
        },
        get_prev_channel_id: () => {
            const idx = channels.findIndex((c) => c.id === selected_channel_id);
            return idx > 0 ? channels[idx - 1].id : undefined;
        },
        select_channel: (id: number) => {
            selected_channel_id = id;
            selected_topic_id = undefined;
            calls.push(`select_channel(${id})`);
        },
        close_channel: () => {
            selected_channel_id = undefined;
            topic_mode = false;
            selected_topic_id = undefined;
            calls.push("close_channel");
        },

        // --- Topic navigation ---
        get_first_topic_id: () => selected_channel()?.topics[0]?.id,
        get_next_topic_id: () => {
            const topics = selected_channel()?.topics ?? [];
            const idx = topics.findIndex((t) => t.id === selected_topic_id);
            return topics[idx + 1]?.id;
        },
        get_prev_topic_id: () => {
            const topics = selected_channel()?.topics ?? [];
            const idx = topics.findIndex((t) => t.id === selected_topic_id);
            return idx > 0 ? topics[idx - 1].id : undefined;
        },
        set_topic_id: (id: number) => {
            selected_topic_id = id;
            topic_mode = true;
            calls.push(`set_topic_id(${id})`);
        },
        clear_message_view: () => {
            selected_topic_id = undefined;
            calls.push("clear_message_view");
        },
        exit_topic_mode: () => {
            topic_mode = false;
            selected_topic_id = undefined;
            calls.push("exit_topic_mode");
        },

        // --- Message reading ---
        focus_message_list: () => {
            message_list_focused = true;
            calls.push("focus_message_list");
        },
        blur_message_list: () => {
            message_list_focused = false;
            calls.push("blur_message_list");
        },

        // --- Compose ---
        blur_compose: () => {
            composing = false;
            calls.push("blur_compose");
        },
        close_reply_pane: () => {
            reply_open = false;
            calls.push("close_reply_pane");
        },
        close_add_topic_pane: () => {
            add_topic_open = false;
            calls.push("close_add_topic_pane");
        },

        // --- N key specific ---
        get_first_unread_channel_id: () =>
            channels.find((c) => c.topics.some((t) => t.unread))?.id,
        get_next_unread_channel_id: () => {
            const idx = channels.findIndex((c) => c.id === selected_channel_id);
            for (let i = idx + 1; i < channels.length; i++) {
                if (channels[i].topics.some((t) => t.unread)) return channels[i].id;
            }
            return undefined;
        },
        get_first_unread_topic_id: () =>
            selected_channel()?.topics.find((t) => t.unread)?.id,
        mark_topic_read: () => {
            const topic = selected_topic();
            if (topic) topic.unread = false;
            calls.push("mark_topic_read");
        },
        go_to_next_topic: (): NextTopicResult => {
            const ch = selected_channel();
            if (!ch) return NextTopicResult.CLEARED;
            const next = ch.topics.find(
                (t) => t.unread && t.id !== selected_topic_id,
            );
            if (next) {
                selected_topic_id = next.id;
                calls.push(`go_to_next_topic(${next.id})`);
                return NextTopicResult.ADVANCED;
            }
            calls.push("go_to_next_topic(cleared)");
            return NextTopicResult.CLEARED;
        },
    };

    return {
        ctx,
        calls,
        set composing(v: boolean) { composing = v; },
        set reply_open(v: boolean) { reply_open = v; },
        set add_topic_open(v: boolean) { add_topic_open = v; },
        get selected_channel_id() { return selected_channel_id; },
        get selected_topic_id() { return selected_topic_id; },
        get topic_mode() { return topic_mode; },
        get message_list_focused() { return message_list_focused; },
    };
}

// ============================================================
// Story: I open the app and want to browse channels with arrow keys.
// ============================================================

{
    const nav = make_navigator([
        { id: 1, name: "General", topics: [] },
        { id: 2, name: "Random", topics: [] },
    ]);

    // I press Down — should select the first channel.
    handle_arrow_down(nav.ctx);
    assert.equal(nav.selected_channel_id, 1);

    // I press Down again — should move to the next channel.
    handle_arrow_down(nav.ctx);
    assert.equal(nav.selected_channel_id, 2);

    // I press Down at the last channel — should stay (no crash).
    handle_arrow_down(nav.ctx);
    assert.equal(nav.selected_channel_id, 2);

    // I press Up — should go back to the first channel.
    handle_arrow_up(nav.ctx);
    assert.equal(nav.selected_channel_id, 1);

    // I press Up again — should deselect (back to nothing).
    handle_arrow_up(nav.ctx);
    assert.equal(nav.selected_channel_id, undefined);
}

// ============================================================
// Story: I select a channel, press Enter to see topics, browse
// them with arrows, then press Enter to read messages.
// ============================================================

{
    const nav = make_navigator([
        {
            id: 1,
            name: "General",
            topics: [
                { id: 10, name: "hello", unread: false },
                { id: 11, name: "world", unread: false },
            ],
        },
    ]);

    // I arrow down to select the channel.
    handle_arrow_down(nav.ctx);
    assert.equal(nav.selected_channel_id, 1);

    // I press Enter to drill into topics.
    handle_enter_key(nav.ctx);
    assert.equal(nav.selected_topic_id, 10);
    assert(nav.message_list_focused);

    // I press Escape to stop reading and browse topics.
    handle_esc_key(nav.ctx);
    assert(!nav.message_list_focused);

    // I arrow down to the next topic.
    handle_arrow_down(nav.ctx);
    assert.equal(nav.selected_topic_id, 11);

    // I press Enter to read that topic's messages.
    handle_enter_key(nav.ctx);
    assert(nav.message_list_focused);
}

// ============================================================
// Story: I want to back out of everything with Escape.
// The peel order should be: message focus → topic → topic mode → channel.
// ============================================================

{
    const nav = make_navigator([
        {
            id: 1,
            name: "General",
            topics: [{ id: 10, name: "hello", unread: false }],
        },
    ]);

    // Set up: channel selected, topic selected, messages focused.
    handle_arrow_down(nav.ctx);
    handle_enter_key(nav.ctx);
    assert(nav.message_list_focused);
    assert.equal(nav.selected_topic_id, 10);

    // ESC 1: blur the message list.
    handle_esc_key(nav.ctx);
    assert(!nav.message_list_focused);
    assert.equal(nav.selected_topic_id, 10); // topic still selected

    // ESC 2: deselect the topic.
    handle_esc_key(nav.ctx);
    assert.equal(nav.selected_topic_id, undefined);
    assert(nav.topic_mode); // still in topic mode

    // ESC 3: exit topic mode.
    handle_esc_key(nav.ctx);
    assert(!nav.topic_mode);
    assert.equal(nav.selected_channel_id, 1); // channel still selected

    // ESC 4: close the channel.
    handle_esc_key(nav.ctx);
    assert.equal(nav.selected_channel_id, undefined);

    // ESC 5: nothing left — should return false.
    const handled = handle_esc_key(nav.ctx);
    assert(!handled);
}

// ============================================================
// Story: I have one unread message. I press 'n' to jump to it,
// read it, and then press 'n' again to mark it read and see
// that there are no more unreads.
// ============================================================

{
    const nav = make_navigator([
        {
            id: 1,
            name: "General",
            topics: [
                { id: 10, name: "greetings", unread: true },
                { id: 11, name: "other", unread: false },
            ],
        },
    ]);

    // I press 'n' — should jump to the channel with unreads.
    handle_n_key(nav.ctx);
    assert.equal(nav.selected_channel_id, 1);

    // I press 'n' again — should jump to the unread topic.
    handle_n_key(nav.ctx);
    assert.equal(nav.selected_topic_id, 10);
    assert(nav.message_list_focused);

    // I read the messages (the app shows them). Now I press 'n'
    // to mark this topic as read and move on.
    handle_n_key(nav.ctx);

    // The topic should be marked read.
    assert(nav.calls.includes("mark_topic_read"));

    // No more unreads — should have called go_to_next_topic which
    // returned CLEARED.
    assert(nav.calls.includes("go_to_next_topic(cleared)"));
}

// ============================================================
// Story: Two channels have unreads. After clearing the first,
// 'n' should offer to take me to the next channel.
// ============================================================

{
    const nav = make_navigator([
        {
            id: 1,
            name: "General",
            topics: [{ id: 10, name: "hello", unread: true }],
        },
        {
            id: 2,
            name: "Random",
            topics: [{ id: 20, name: "stuff", unread: true }],
        },
    ]);

    // Jump to first channel, then to the unread topic.
    handle_n_key(nav.ctx);
    handle_n_key(nav.ctx);
    assert.equal(nav.selected_channel_id, 1);
    assert.equal(nav.selected_topic_id, 10);

    // Mark read and advance — General is cleared, so go_to_next_topic
    // returns CLEARED. The popup would offer to jump to Random.
    handle_n_key(nav.ctx);
    assert(nav.calls.includes("mark_topic_read"));
}

// ============================================================
// Story: I'm composing a reply and press Escape. It should blur
// the compose area first, not close the reply pane.
// ============================================================

{
    const nav = make_navigator([
        {
            id: 1,
            name: "General",
            topics: [{ id: 10, name: "hello", unread: false }],
        },
    ]);

    // Set up: reading messages with reply pane open, typing.
    handle_arrow_down(nav.ctx);
    handle_enter_key(nav.ctx);
    nav.reply_open = true;
    nav.composing = true;

    // ESC 1: should blur compose (not close reply).
    handle_esc_key(nav.ctx);
    assert(nav.calls.includes("blur_compose"));
    assert(!nav.calls.includes("close_reply_pane"));

    // ESC 2: now close the reply pane.
    handle_esc_key(nav.ctx);
    assert(nav.calls.includes("close_reply_pane"));
}

console.log("  navigator_test: OK");
