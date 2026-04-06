// All logic for the 'n' (next unread) hotkey lives here so it can be
// understood and tested in isolation. Navigator implements NKeyContext.

import { StatusBar } from "./status_bar";

export const enum NextTopicResult {
    ADVANCED = "ADVANCED",
    CLEARED = "CLEARED",
}

export interface NKeyContext {
    channel_selected(): boolean;
    get_first_unread_channel_id(): number | undefined;
    select_channel(channel_id: number): void;
    topic_selected(): boolean;
    get_first_unread_topic_id(): number | undefined;
    set_topic_id(topic_id: number): void;
    mark_topic_read(): void;
    go_to_next_topic(): NextTopicResult;
}

export function handle_n_key(ctx: NKeyContext): boolean {
    if (!ctx.channel_selected()) {
        const channel_id = ctx.get_first_unread_channel_id();
        if (channel_id === undefined) return false;
        ctx.select_channel(channel_id);
        StatusBar.inform(
            "You hit 'n', so we jumped to the first channel with unread topics.",
        );
        return true;
    }

    if (!ctx.topic_selected()) {
        const topic_id = ctx.get_first_unread_topic_id();
        if (topic_id === undefined) return false;
        ctx.set_topic_id(topic_id);
        StatusBar.inform("You hit 'n', so we jumped to the first unread topic.");
        return true;
    }

    ctx.mark_topic_read();
    const result = ctx.go_to_next_topic();
    if (result === NextTopicResult.ADVANCED) {
        StatusBar.inform(
            "You hit 'n', so we marked the topic as read and moved to the next unread topic.",
        );
    } else {
        StatusBar.inform(
            "You hit 'n', so we marked the topic as read. No more unread topics in this channel.",
        );
    }
    return true;
}
