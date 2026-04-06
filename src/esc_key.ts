// All logic for the ESC key lives here so it can be understood and tested
// in isolation. Navigator implements EscKeyContext.
//
// ESC uses a "peeling order" — each press removes exactly one layer of
// context, from innermost to outermost:
//
//   1. Composing (textarea focused + has text) → blur the textarea
//   2. Reply pane open                         → close the reply pane
//   3. Add-topic pane open                     → close the add-topic pane
//   4. Topic selected (reading messages)       → deselect the topic
//   5. In topic mode (no topic selected)       → exit topic mode
//   6. Channel selected (browsing channels)    → deselect the channel
//   7. Nothing left                            → offer to close the tab
//
// Every state produces a visible action, so ESC is never a silent no-op.

import * as popup from "./popup";

export interface EscKeyContext {
    is_composing(): boolean;
    blur_compose(): void;
    reply_pane_open(): boolean;
    close_reply_pane(): void;
    add_topic_pane_open(): boolean;
    close_add_topic_pane(): void;
    topic_selected(): boolean;
    clear_message_view(): void;
    in_topic_mode(): boolean;
    exit_topic_mode(): void;
    channel_selected(): boolean;
    close_channel(): void;
    tab_count(): number;
    close_tab(): void;
}

function show_close_tab_popup(ctx: EscKeyContext): void {
    const div = document.createElement("div");
    div.style.padding = "8px 4px";

    if (ctx.tab_count() <= 1) {
        div.innerText =
            "This is your only open tab, so we'll keep it open for you.";
        popup.pop({ div, confirm_button_text: "OK", callback: () => {} });
    } else {
        div.innerText = "Close this tab?";
        popup.pop({
            div,
            confirm_button_text: "Close",
            cancel_button_text: "Cancel",
            callback: () => ctx.close_tab(),
        });
    }
}

export function handle_esc_key(ctx: EscKeyContext): boolean {
    if (ctx.is_composing()) {
        ctx.blur_compose();
        return true;
    }
    if (ctx.reply_pane_open()) {
        ctx.close_reply_pane();
        return true;
    }
    if (ctx.add_topic_pane_open()) {
        ctx.close_add_topic_pane();
        return true;
    }
    if (ctx.topic_selected()) {
        ctx.clear_message_view();
        return true;
    }
    if (ctx.in_topic_mode()) {
        ctx.exit_topic_mode();
        return true;
    }
    if (ctx.channel_selected()) {
        ctx.close_channel();
        return true;
    }
    show_close_tab_popup(ctx);
    return true;
}
