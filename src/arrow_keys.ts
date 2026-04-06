// All logic for the ArrowDown and ArrowUp hotkeys lives here so it can be
// understood and tested in isolation. Navigator implements ArrowKeyContext.
//
// The navigation mode is derived from state — no flag needed:
//   topic_selected() === true  →  topic mode  (arrows navigate topics)
//   topic_selected() === false →  channel mode (arrows navigate channels)
//
// Use Enter to drill from channel mode into topic mode (see enter_key.ts).
// Use ESC to back out (see esc_key.ts).
//
//   Channel mode:
//     Down  → next channel  (first if none selected; status at last)
//     Up    → prev channel  (deselect at first; status if none)
//
//   Topic mode:
//     Down  → next topic    (status at last)
//     Up    → prev topic    (deselect → exits to channel mode at first)

import { StatusBar } from "./status_bar";

export interface ArrowKeyContext {
    channel_selected(): boolean;
    get_first_channel_id(): number | undefined;
    get_next_channel_id(): number | undefined;
    get_prev_channel_id(): number | undefined;
    select_channel(channel_id: number): void;
    close_channel(): void;
    topic_selected(): boolean;
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
        // At first topic — back to channel mode.
        ctx.clear_message_view();
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
