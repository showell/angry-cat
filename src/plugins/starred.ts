// Starred Messages plugin — shows all starred messages with options
// to unstar (soft: keeps message visible) or dismiss (hard: unstars
// and removes from the list).

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

function render_starred_message(
    message: Message,
    on_change: () => void,
): HTMLDivElement {
    const message_row = new MessageRow(message);

    const div = document.createElement("div");
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.paddingBottom = "8px";
    div.style.marginBottom = "8px";

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

    // Action buttons
    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "6px";
    button_row.style.marginTop = "4px";

    // Soft unstar: removes the star but keeps the message visible
    // until the next refresh (or until the event arrives and rebuilds).
    const unstar_button = new Button("Unstar", 80, () => {
        zulip_client.set_message_starred(message.id, false);
    });

    // Hard dismiss: unstars AND immediately hides the message.
    const dismiss_button = new Button("Dismiss", 80, () => {
        zulip_client.set_message_starred(message.id, false);
        dismissed_ids.add(message.id);
        on_change();
    });

    button_row.append(unstar_button.div, dismiss_button.div);
    div.append(button_row);

    return div;
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No starred messages. Star messages in the official Zulip client, or use this as a future feature.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

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

    function rebuild(): void {
        const messages = get_starred_messages();
        count_div.innerText = `${messages.length} starred message${messages.length === 1 ? "" : "s"}`;

        list_div.innerHTML = "";
        if (messages.length === 0) {
            list_div.append(build_empty_message());
        } else {
            for (const message of messages) {
                list_div.append(render_starred_message(message, rebuild));
            }
        }
    }

    rebuild();

    // Rebuild when star state changes via server events.
    function handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MUTATE_STARRED) {
            rebuild();
        }
    }

    return { div, handle_zulip_event };
}
