import { APP } from "../app";
import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import * as model from "../backend/model";
import { Button } from "../button";
import { render_unread_count } from "../dom/render";
import * as table_widget from "../dom/table_widget";
import { render_topic_name } from "../dom/topic_row_widget";
import { render_message_content } from "../message_content";
import { render_sender_name } from "../message_row_widget";
import type { PluginHelper } from "../plugin_helper";
import { MessageRow } from "../row_types";

function build_topic_cell(message_row: MessageRow): HTMLDivElement {
    const topic_name = message_row.topic_name();
    const address = message_row.address();

    const div = render_topic_name(topic_name);

    div.addEventListener("click", () => {
        APP.add_navigator(address);
    });

    return div;
}

function build_table(): HTMLElement {
    const messages = model.all_messages();
    messages.sort((a, b) => b.timestamp - a.timestamp);

    const grouped = model.messages_grouped_by_topic();

    const used_topic_ids = new Set<number>();
    const recent_message_rows = [];

    for (const message of messages) {
        const topic_id = message.topic_id;

        if (used_topic_ids.has(topic_id)) continue;
        used_topic_ids.add(topic_id);

        recent_message_rows.push(new MessageRow(message));

        if (recent_message_rows.length >= 30) break;
    }

    const rows = [];
    for (const message_row of recent_message_rows) {
        const channel_name = message_row.stream_name();
        const content = message_row.content();
        const topic_id = message_row.topic_id();
        const topic_messages = grouped.get(topic_id) ?? [];
        const participants = model.participants_for_messages(topic_messages);

        const unread_count = topic_messages.filter((msg) => msg.unread).length;
        const count_cell = document.createElement("div");
        const total_div = document.createElement("div");
        total_div.innerText = String(topic_messages.length);
        total_div.style.textAlign = "right";
        count_cell.append(total_div);
        if (unread_count > 0) {
            count_cell.append(render_unread_count(unread_count));
        }

        const channel_cell = document.createElement("div");
        const topic_cell = build_topic_cell(message_row);
        const senders_cell = document.createElement("div");
        const message_cell = document.createElement("div");
        message_cell.style.maxWidth = "400px";
        channel_cell.innerText = channel_name;
        senders_cell.innerText = participants
            .map((u) => u.full_name)
            .join(", ");

        message_cell.append(render_sender_name(message_row.sender_name()));
        message_cell.append(render_message_content(content));

        const row_widget: table_widget.RowWidget = {
            divs: [
                count_cell,
                channel_cell,
                topic_cell,
                senders_cell,
                message_cell,
            ],
        };
        rows.push(row_widget);
    }

    return table_widget.table(
        ["Count", "Channel", "Topic", "Senders", "Last message"],
        rows,
    );
}

class RecentConversations {
    div: HTMLDivElement;
    plugin_helper: PluginHelper;
    notification_div: HTMLDivElement;
    inner_div: HTMLDivElement;

    constructor(plugin_helper: PluginHelper) {
        this.plugin_helper = plugin_helper;

        const notification_div = document.createElement("div");
        notification_div.style.display = "none";
        notification_div.style.alignItems = "center";
        notification_div.style.gap = "10px";
        notification_div.style.marginBottom = "8px";

        const notification_text = document.createElement("span");
        notification_text.innerText = "New messages have arrived.";

        const refresh_button = new Button("Refresh", 100, () => {
            this.refresh();
        });

        notification_div.append(notification_text);
        notification_div.append(refresh_button.div);

        const inner_div = document.createElement("div");
        inner_div.style.maxHeight = "82vh";
        inner_div.style.overflow = "auto";
        inner_div.append(build_table());

        const div = document.createElement("div");
        div.style.paddingTop = "15px";
        div.style.maxHeight = "fit-content";
        div.style.maxWidth = "fit-content";

        div.append(notification_div);
        div.append(inner_div);

        this.div = div;
        this.notification_div = notification_div;
        this.inner_div = inner_div;
    }

    handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MESSAGE) {
            this.notification_div.style.display = "flex";
            this.plugin_helper.violet();
        }
    }

    refresh(): void {
        this.notification_div.style.display = "none";
        this.plugin_helper.redraw_tab_button();
        this.inner_div.innerHTML = "";
        this.inner_div.append(build_table());
    }
}

export function plugin(plugin_helper: PluginHelper) {
    plugin_helper.update_label("Recent conversations");

    const widget = new RecentConversations(plugin_helper);

    plugin_helper.set_zulip_event_listener((event) => {
        widget.handle_zulip_event(event);
    });

    return { div: widget.div };
}
