// All logic for the Enter hotkey lives here so it can be understood and
// tested in isolation. Navigator implements EnterKeyContext.
//
// Enter drills from one navigation level to the next:
//   channel mode (no topic selected) → select first topic (enters topic mode)
//   topic mode (topic selected)      → focus the message list for keyboard scrolling
//   no channel selected              → status message

import { StatusBar } from "./status_bar";

export interface EnterKeyContext {
    channel_selected(): boolean;
    topic_selected(): boolean;
    get_first_topic_id(): number | undefined;
    set_topic_id(topic_id: number): void;
    focus_message_list(): void;
}

export function handle_enter_key(ctx: EnterKeyContext): boolean {
    if (ctx.topic_selected()) {
        ctx.focus_message_list();
        return true;
    }

    if (ctx.channel_selected()) {
        const topic_id = ctx.get_first_topic_id();
        if (topic_id === undefined) {
            StatusBar.inform("No topics in this channel.");
            return true;
        }
        ctx.set_topic_id(topic_id);
        ctx.focus_message_list();
        return true;
    }

    StatusBar.inform("Select a channel first with the arrow keys.");
    return true;
}
