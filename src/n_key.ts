// All logic for the 'n' (next unread) hotkey lives here so it can be
// understood and tested in isolation. Navigator implements NKeyContext.

import * as popup from "./popup";
import { StatusBar } from "./status_bar";

export const enum NextTopicResult {
    ADVANCED = "ADVANCED",
    CLEARED = "CLEARED",
}

export interface NKeyContext {
    channel_selected(): boolean;
    get_channel_name(): string | undefined;
    get_first_unread_channel_id(): number | undefined;
    get_next_unread_channel_id(): number | undefined;
    select_channel(channel_id: number): void;
    topic_selected(): boolean;
    get_first_unread_topic_id(): number | undefined;
    set_topic_id(topic_id: number): void;
    focus_message_list(): void;
    mark_topic_read(): void;
    go_to_next_topic(): NextTopicResult;
}

function show_inbox_zero_popup(): void {
    const div = document.createElement("div");
    div.innerText = "Congratulations! You have no unread messages.";
    div.style.padding = "8px 4px";
    popup.pop({ div, confirm_button_text: "Awesome!", callback: () => {} });
}

function show_channel_cleared_popup(
    channel_name: string,
    next_channel_id: number,
    ctx: NKeyContext,
): void {
    const div = document.createElement("div");
    div.innerText = `Congratulations! No more unread topics in #${channel_name}. We'll take you to the next channel with unreads.`;
    div.style.padding = "8px 4px";
    div.style.maxWidth = "320px";
    popup.pop({
        div,
        confirm_button_text: "Awesome!",
        callback: () => {
            ctx.select_channel(next_channel_id);
        },
    });
}

function show_channel_done_popup(ctx: NKeyContext): void {
    const next_channel_id = ctx.get_next_unread_channel_id();
    if (next_channel_id === undefined) {
        show_inbox_zero_popup();
    } else {
        show_channel_cleared_popup(
            ctx.get_channel_name() ?? "this channel",
            next_channel_id,
            ctx,
        );
    }
}

export function handle_n_key(ctx: NKeyContext): boolean {
    if (!ctx.channel_selected()) {
        const channel_id = ctx.get_first_unread_channel_id();
        if (channel_id === undefined) {
            show_inbox_zero_popup();
            return true;
        }
        ctx.select_channel(channel_id);
        StatusBar.inform(
            "You hit 'n', so we jumped to the first channel with unread topics.",
        );
        return true;
    }

    if (!ctx.topic_selected()) {
        const topic_id = ctx.get_first_unread_topic_id();
        if (topic_id === undefined) {
            show_channel_done_popup(ctx);
            return true;
        }
        ctx.set_topic_id(topic_id);
        ctx.focus_message_list();
        StatusBar.inform("You hit 'n', so we jumped to the first unread topic.");
        return true;
    }

    ctx.mark_topic_read();
    const result = ctx.go_to_next_topic();
    if (result === NextTopicResult.ADVANCED) {
        ctx.focus_message_list();
        StatusBar.inform(
            "You hit 'n', so we marked the topic as read and moved to the next unread topic.",
        );
    } else {
        show_channel_done_popup(ctx);
    }
    return true;
}
