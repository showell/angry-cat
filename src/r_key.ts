// All logic for the 'r' (reply) hotkey lives here so it can be understood
// and tested in isolation. Navigator implements RKeyContext.
//
// The 'r' key always does something:
//   topic selected  → open the reply pane (or focus it if already open)
//   channel selected, no topic → offer to create a new topic (modal)
//   nothing selected → educate the user about the 'r' key

import * as popup from "./popup";
import { StatusBar } from "./status_bar";

export interface RKeyContext {
    channel_selected(): boolean;
    topic_selected(): boolean;
    reply(): void;
    add_topic(): void;
}

export function handle_r_key(ctx: RKeyContext): boolean {
    if (ctx.topic_selected()) {
        ctx.reply();
        return true;
    }

    if (ctx.channel_selected()) {
        show_new_topic_popup(ctx);
        return true;
    }

    StatusBar.inform(
        "You hit 'r' to reply, but no channel or topic is selected yet.",
    );
    return true;
}

function show_new_topic_popup(ctx: RKeyContext): void {
    const div = document.createElement("div");
    div.innerText =
        "No topic is selected. Would you like to start a new topic on this channel?";
    div.style.padding = "8px 4px";
    div.style.maxWidth = "320px";
    popup.pop({
        div,
        confirm_button_text: "New Topic",
        cancel_button_text: "Cancel",
        callback: () => ctx.add_topic(),
    });
}
