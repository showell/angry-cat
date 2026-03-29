import type { PluginHelper } from "../plugin_helper";
import { APP } from "../app";
import * as model from "../backend/model";

import { RowWidget, table } from "../dom/table_widget";
import { render_topic_name } from "../dom/topic_row_widget";

import { render_message_content } from "../message_content";
import { MessageRow } from "../row_types";

function build_topic_cell(message_row: MessageRow): HTMLDivElement {
    const topic_name = message_row.topic_name();
    const address = message_row.address();

    const div = render_topic_name(topic_name);

    div.addEventListener("click", () => {
        APP.add_search_widget(address);
    });

    return div;
}

export function plugin(plugin_helper: PluginHelper) {
    const div = document.createElement("div");
    div.style.maxWidth = "100vw";

    plugin_helper.update_label("Recent conversations");

    const messages = model.all_messages();
    messages.sort((a, b) => b.timestamp - a.timestamp);

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

        const channel_cell = document.createElement("div");
        const topic_cell = build_topic_cell(message_row); // has click handler
        const message_cell = document.createElement("div");

        message_cell.style.maxWidth = "400px";
        channel_cell.innerText = channel_name;

        message_cell.append(render_message_content(content));

        const row_widget: RowWidget = {
            divs: [channel_cell, topic_cell, message_cell],
        };
        rows.push(row_widget);
    }
    const table_widget = table(["Channel", "Topic", "Last message"], rows);
    div.append(table_widget);

    return { div };
}
