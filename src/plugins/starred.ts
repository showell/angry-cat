// Starred Messages plugin — shows all starred messages with per-message
// actions:
//
//   Unstar (soft): dims the message to 50% opacity and waits for the
//     server event to confirm. Shows a spinner while waiting. Once
//     confirmed, replaces Unstar with Restar. The message stays visible
//     so the user can review their full list without losing context.
//
//   Restar: re-stars a previously unstarred message (same wait pattern).
//
//   Dismiss (hard): unstars AND immediately hides the message from the
//     list. For messages the user is done with entirely.

import { DB, is_starred } from "../backend/database";
import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import { MessageRow } from "../backend/message_row";
import * as zulip_client from "../backend/zulip_client";
import { Button } from "../button";
import * as colors from "../colors";
import { render_message_content } from "../message_content";
import type { Plugin, PluginContext } from "../plugin_helper";

// Messages the user has explicitly dismissed (unstarred + hidden).
const dismissed_ids = new Set<number>();

function get_starred_messages(): Message[] {
    const result: Message[] = [];
    for (const message of DB.message_map.values()) {
        if (is_starred(message.id) && !dismissed_ids.has(message.id)) {
            result.push(message);
        }
    }
    result.sort((a, b) => b.timestamp - a.timestamp);
    return result;
}

// Each rendered message manages its own button state so that unstar/restar
// can update in place without a full list rebuild.
function render_starred_message(
    message: Message,
    on_dismiss: () => void,
): HTMLDivElement {
    const message_row = new MessageRow(message);

    const div = document.createElement("div");
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.paddingBottom = "8px";
    div.style.marginBottom = "8px";
    div.style.transition = "opacity 0.3s ease";

    // Header: sender, topic, time
    const header = document.createElement("div");
    header.style.fontWeight = "bold";
    header.style.color = colors.primary;
    header.style.marginBottom = "2px";

    const time = new Date(message.timestamp * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    header.innerText = `${message_row.sender_name()} — ${message_row.topic_link()} — ${time}`;
    div.append(header);

    // Message content
    div.append(render_message_content(message_row.content()));

    // Action buttons — managed as a row that swaps between states.
    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "6px";
    button_row.style.marginTop = "4px";
    button_row.style.alignItems = "center";
    div.append(button_row);

    const spinner = document.createElement("span");
    spinner.innerText = "waiting...";
    spinner.style.fontSize = "13px";
    spinner.style.color = colors.text_muted;

    // pending_event_id tracks which message_id we're waiting on for
    // a MUTATE_STARRED confirmation. null means not waiting.
    let pending_starred: boolean | null = null;

    function show_starred_buttons(): void {
        button_row.innerHTML = "";
        const unstar_button = new Button("Unstar", 80, () => {
            pending_starred = false;
            zulip_client.set_message_starred(message.id, false);
            show_pending();
        });
        const dismiss_button = new Button("Dismiss", 80, () => {
            zulip_client.set_message_starred(message.id, false);
            dismissed_ids.add(message.id);
            on_dismiss();
        });
        button_row.append(unstar_button.div, dismiss_button.div);
    }

    function show_unstarred_buttons(): void {
        button_row.innerHTML = "";
        div.style.opacity = "0.5";
        const restar_button = new Button("Restar", 80, () => {
            pending_starred = true;
            zulip_client.set_message_starred(message.id, true);
            show_pending();
        });
        button_row.append(restar_button.div);
    }

    function show_pending(): void {
        button_row.innerHTML = "";
        button_row.append(spinner);
    }

    // Called by the plugin when a MUTATE_STARRED event arrives.
    function handle_star_change(): void {
        const starred = is_starred(message.id);

        // Only react if we were waiting for this confirmation.
        if (pending_starred === null) return;
        if (starred !== pending_starred) return;

        pending_starred = null;
        if (starred) {
            div.style.opacity = "1";
            show_starred_buttons();
        } else {
            show_unstarred_buttons();
        }
    }

    // Initial state.
    show_starred_buttons();

    return Object.assign(div, { handle_star_change });
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No starred messages.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

type StarredMessageDiv = HTMLDivElement & {
    handle_star_change: () => void;
};

export function plugin(context: PluginContext): Plugin {
    context.update_label("Starred");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "700px";
    div.style.height = "100%";
    div.style.overflow = "auto";

    const count_div = document.createElement("div");
    count_div.style.fontWeight = "bold";
    count_div.style.color = colors.primary;
    count_div.style.marginBottom = "8px";

    const list_div = document.createElement("div");

    div.append(count_div, list_div);

    // Track rendered message divs so we can notify them of star changes
    // without rebuilding the entire list.
    let message_divs: StarredMessageDiv[] = [];

    function rebuild(): void {
        const messages = get_starred_messages();
        count_div.innerText = `${messages.length} starred message${messages.length === 1 ? "" : "s"}`;

        list_div.innerHTML = "";
        message_divs = [];
        if (messages.length === 0) {
            list_div.append(build_empty_message());
        } else {
            for (const message of messages) {
                const msg_div = render_starred_message(
                    message,
                    rebuild,
                ) as StarredMessageDiv;
                list_div.append(msg_div);
                message_divs.push(msg_div);
            }
        }
    }

    rebuild();

    // When star state changes, notify each rendered message so it can
    // update its buttons in place. Only rebuild for new stars (messages
    // that weren't in our list before).
    function handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor !== EventFlavor.MUTATE_STARRED) return;

        // Notify existing message rows about the change.
        for (const msg_div of message_divs) {
            msg_div.handle_star_change();
        }

        // If new messages were starred (not by us), rebuild to include them.
        if (event.starred) {
            rebuild();
        }
    }

    return { div, handle_zulip_event };
}
