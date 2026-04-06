// All logic for the ArrowDown and ArrowUp hotkeys lives here so it can be
// understood and tested in isolation. Navigator implements ArrowKeyContext.
//
// The navigation mode is determined by two checks:
//   topic_selected() → arrows navigate topics
//   in_topic_mode()  → arrows navigate topics (select first on Down, exit on Up)
//   otherwise        → arrows navigate channels
//
// Use Enter to drill from channel mode into topic mode (see enter_key.ts).
// Use ESC to back out one layer at a time (see esc_key.ts).
//
//   Channel mode:
//     Down  → next channel  (first if none selected; status at last)
//     Up    → prev channel  (deselect at first; status if none)
//
//   Topic mode (topic selected):
//     Down  → next topic    (status at last)
//     Up    → prev topic    (deselect topic at first, stay in topic mode)
//
//   Topic mode (no topic selected — e.g. after ESC deselected topic):
//     Down  → first topic
//     Up    → exit topic mode (back to channel navigation)

import { StatusBar } from "./status_bar";

export interface ArrowKeyContext {
    channel_selected(): boolean;
    topic_selected(): boolean;
    in_topic_mode(): boolean;
    exit_topic_mode(): void;
    get_first_channel_id(): number | undefined;
    get_next_channel_id(): number | undefined;
    get_prev_channel_id(): number | undefined;
    select_channel(channel_id: number): void;
    close_channel(): void;
    get_first_topic_id(): number | undefined;
    get_next_topic_id(): number | undefined;
    get_prev_topic_id(): number | undefined;
    set_topic_id(topic_id: number): void;
    clear_message_view(): void;
}

export function handle_arrow_down(ctx: ArrowKeyContext): boolean {
    if (ctx.topic_selected()) {
        const next_id = ctx.get_next_topic_id();
        if (next_id !== undefined) {
            ctx.set_topic_id(next_id);
            return true;
        }
        StatusBar.inform("You're at the last topic.");
        return true;
    }

    if (ctx.in_topic_mode()) {
        const topic_id = ctx.get_first_topic_id();
        if (topic_id === undefined) {
            StatusBar.inform("No topics in this channel.");
            return true;
        }
        ctx.set_topic_id(topic_id);
        return true;
    }

    // Channel mode.
    if (!ctx.channel_selected()) {
        const channel_id = ctx.get_first_channel_id();
        if (channel_id === undefined) {
            StatusBar.inform("No channels available.");
            return true;
        }
        ctx.select_channel(channel_id);
        return true;
    }

    const next_id = ctx.get_next_channel_id();
    if (next_id !== undefined) {
        ctx.select_channel(next_id);
        return true;
    }
    StatusBar.inform("You're at the last channel.");
    return true;
}

export function handle_arrow_up(ctx: ArrowKeyContext): boolean {
    if (ctx.topic_selected()) {
        const prev_id = ctx.get_prev_topic_id();
        if (prev_id !== undefined) {
            ctx.set_topic_id(prev_id);
            return true;
        }
        // At first topic — deselect topic but stay in topic mode.
        ctx.clear_message_view();
        return true;
    }

    if (ctx.in_topic_mode()) {
        // No topic selected — exit topic mode, back to channel navigation.
        ctx.exit_topic_mode();
        return true;
    }

    // Channel mode.
    if (!ctx.channel_selected()) {
        StatusBar.inform("You're at the top of navigation.");
        return true;
    }

    const prev_id = ctx.get_prev_channel_id();
    if (prev_id !== undefined) {
        ctx.select_channel(prev_id);
        return true;
    }
    // At first channel — deselect.
    ctx.close_channel();
    return true;
}
