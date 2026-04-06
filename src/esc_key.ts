// All logic for the ESC key in Navigator lives here so it can be
// understood and tested in isolation. Navigator implements EscKeyContext.
//
// ESC uses a "peeling order" — each press removes exactly one layer of
// context, from innermost to outermost:
//
//   1. Composing (textarea focused + has text) → blur the textarea
//   2. Reply pane open                         → close the reply pane
//   3. Add-topic pane open                     → close the add-topic pane
//   4. Message list focused                    → blur the message list
//   5. Topic selected (reading messages)       → deselect the topic
//   6. In topic mode (no topic selected)       → exit topic mode
//   7. Channel selected (browsing channels)    → deselect the channel
//
// If nothing is left to peel, returns false so Page can offer to close
// the tab (Page handles this for all plugin types, not just Navigator).

export interface EscKeyContext {
    is_composing(): boolean;
    blur_compose(): void;
    reply_pane_open(): boolean;
    close_reply_pane(): void;
    add_topic_pane_open(): boolean;
    close_add_topic_pane(): void;
    message_list_focused(): boolean;
    blur_message_list(): void;
    topic_selected(): boolean;
    clear_message_view(): void;
    in_topic_mode(): boolean;
    exit_topic_mode(): void;
    channel_selected(): boolean;
    close_channel(): void;
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
    if (ctx.message_list_focused()) {
        ctx.blur_message_list();
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
    return false;
}
