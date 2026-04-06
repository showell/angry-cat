// All logic for the ArrowDown and ArrowUp hotkeys lives here so it can be
// understood and tested in isolation. Navigator implements ArrowKeyContext.
//
// Arrow keys navigate the channel→topic hierarchy using a cursor model:
//
//   ArrowDown drills deeper or advances:
//     no channel  → first channel
//     no topic    → first topic
//     topic N     → topic N+1  (stops at last with a status message)
//
//   ArrowUp backs out or retreats:
//     topic N > 0 → topic N-1
//     first topic → deselect topic (back to channel level)
//     no topic    → deselect channel (back to channel list)
//     no channel  → status message (already at the top)
//
// Because pressing the opposite key always reverses the last action,
// modals are not needed — status bar messages are sufficient at boundaries.

import { StatusBar } from "./status_bar";

export interface ArrowKeyContext {
    channel_selected(): boolean;
    get_first_channel_id(): number | undefined;
    select_channel(channel_id: number): void;
    topic_selected(): boolean;
    get_first_topic_id(): number | undefined;
    get_next_topic_id(): number | undefined;
    get_prev_topic_id(): number | undefined;
    set_topic_id(topic_id: number): void;
    clear_message_view(): void;
    close_channel(): void;
}

export function handle_arrow_down(ctx: ArrowKeyContext): boolean {
    if (!ctx.channel_selected()) {
        const channel_id = ctx.get_first_channel_id();
        if (channel_id === undefined) {
            StatusBar.inform("No channels available.");
            return true;
        }
        ctx.select_channel(channel_id);
        return true;
    }

    if (!ctx.topic_selected()) {
        const topic_id = ctx.get_first_topic_id();
        if (topic_id === undefined) {
            StatusBar.inform("No topics in this channel.");
            return true;
        }
        ctx.set_topic_id(topic_id);
        return true;
    }

    const next_id = ctx.get_next_topic_id();
    if (next_id !== undefined) {
        ctx.set_topic_id(next_id);
        return true;
    }
    StatusBar.inform("You're at the last topic.");
    return true;
}

export function handle_arrow_up(ctx: ArrowKeyContext): boolean {
    if (!ctx.channel_selected()) {
        StatusBar.inform("You're at the top of navigation.");
        return true;
    }

    if (!ctx.topic_selected()) {
        ctx.close_channel();
        return true;
    }

    const prev_id = ctx.get_prev_topic_id();
    if (prev_id !== undefined) {
        ctx.set_topic_id(prev_id);
        return true;
    }

    // At the first topic — back up to the channel level.
    ctx.clear_message_view();
    return true;
}
