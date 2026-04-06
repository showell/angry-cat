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

import { APP } from "../app";
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

    // Content area (header + message body) dims on unstar;
    // buttons stay at full opacity so they remain clearly clickable.
    const content_area = document.createElement("div");
    content_area.style.transition = "opacity 0.3s ease";
    div.append(content_area);

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
    content_area.append(header);

    // Message content
    content_area.append(render_message_content(message_row.content()));

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

    const view_topic_button = new Button("View Topic", 100, () => {
        APP.add_navigator(message_row.address());
    });

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
        button_row.append(unstar_button.div, dismiss_button.div, view_topic_button.div);
    }

    function show_unstarred_buttons(): void {
        button_row.innerHTML = "";
        content_area.style.opacity = "0.5";
        const restar_button = new Button("Restar", 80, () => {
            pending_starred = true;
            zulip_client.set_message_starred(message.id, true);
            show_pending();
        });
        const dismiss_button = new Button("Dismiss", 80, () => {
            dismissed_ids.add(message.id);
            on_dismiss();
        });
        button_row.append(restar_button.div, dismiss_button.div, view_topic_button.div);
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
            content_area.style.opacity = "1";
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

function build_stats(messages: Message[]): HTMLDivElement {
    const div = document.createElement("div");
    div.style.fontSize = "15px";
    div.style.color = colors.text_body;
    div.style.lineHeight = "1.8";

    const starred_count = messages.filter((m) => is_starred(m.id)).length;
    const unstarred_count = messages.length - starred_count;

    // Summary
    const summary = document.createElement("div");
    summary.style.marginBottom = "16px";
    summary.innerHTML = [
        `<b>${messages.length}</b> starred message${messages.length === 1 ? "" : "s"}`,
        starred_count > 0 ? `<b>${starred_count}</b> still starred` : "",
        unstarred_count > 0 ? `<b>${unstarred_count}</b> unstarred` : "",
    ]
        .filter(Boolean)
        .join("<br>");
    div.append(summary);

    // Breakdown by topic
    const by_topic = new Map<string, number>();
    for (const m of messages) {
        if (!is_starred(m.id)) continue;
        const row = new MessageRow(m);
        const key = `#${row.stream_name()} > ${row.topic_name()}`;
        by_topic.set(key, (by_topic.get(key) ?? 0) + 1);
    }

    if (by_topic.size > 0) {
        const heading = document.createElement("div");
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        heading.style.marginBottom = "4px";
        heading.innerText = "By topic";
        div.append(heading);

        const sorted = [...by_topic.entries()].sort((a, b) => b[1] - a[1]);
        for (const [topic, count] of sorted) {
            const line = document.createElement("div");
            line.innerText = `${topic}: ${count}`;
            div.append(line);
        }
    }

    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Starred");

    // Two-pane layout: scrollable message list on the left, stats on the right.
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.gap = "20px";
    div.style.paddingTop = "15px";
    div.style.height = "100%";

    const left_pane = document.createElement("div");
    left_pane.style.flex = "1";
    left_pane.style.overflow = "auto";
    left_pane.style.maxWidth = "700px";

    const right_pane = document.createElement("div");
    right_pane.style.width = "250px";
    right_pane.style.flexShrink = "0";
    right_pane.style.paddingTop = "4px";

    div.append(left_pane, right_pane);

    // Track rendered message divs so we can notify them of star changes
    // without rebuilding the entire list.
    let message_divs: StarredMessageDiv[] = [];
    let current_messages: Message[] = [];

    function refresh_stats(): void {
        right_pane.innerHTML = "";
        right_pane.append(build_stats(current_messages));
    }

    function rebuild(): void {
        current_messages = get_starred_messages();

        left_pane.innerHTML = "";
        message_divs = [];
        if (current_messages.length === 0) {
            left_pane.append(build_empty_message());
        } else {
            for (const message of current_messages) {
                const msg_div = render_starred_message(
                    message,
                    rebuild,
                ) as StarredMessageDiv;
                left_pane.append(msg_div);
                message_divs.push(msg_div);
            }
        }

        refresh_stats();
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

        // Update stats to reflect the new star/unstar counts.
        refresh_stats();

        // If new messages were starred (not by us), rebuild to include them.
        if (event.starred) {
            rebuild();
        }
    }

    return { div, handle_zulip_event };
}
