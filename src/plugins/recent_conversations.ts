import type { Message } from "../backend/db_types";

import type { PluginHelper } from "../plugin_helper";
import { APP } from "../app";
import * as model from "../backend/model";

import { DB } from "../backend/database";
import { Address } from "../address";
import { RowWidget, table } from "../dom/table_widget";
import { render_message_content } from "../message_content";

export function plugin(plugin_helper: PluginHelper) {
    const div = document.createElement("div");
    div.style.maxWidth = "100vw";

    plugin_helper.update_label("Recent conversations");

    const filter = {
        predicate(_message: Message) {
            return true;
        },
    };

    const messages = model.filtered_messages(filter);
    messages.sort((a, b) => b.timestamp - a.timestamp);
    const channel_topic_map = new Map<number, Address>();

    for (const message of messages) {
        const key = message.topic_id;
        if (channel_topic_map.has(key)) continue;
        channel_topic_map.set(key, {
            channel_id: message.stream_id!,
            message_id: message.id!,
            topic_id: message.topic_id!,
        });
    }

    const rows = [];
    for (const [_key, address] of channel_topic_map.entries()) {
        const channel_cell = document.createElement("div");
        const topic_cell = document.createElement("div");
        const message_cell = document.createElement("div");

        message_cell.style.maxWidth = "400px";
        channel_cell.innerText = DB.channel_map.get(address.channel_id!)!.name;
        topic_cell.innerText = DB.topic_map.get(address.topic_id!)!.topic_name;

        message_cell.append(
            render_message_content(
                DB.message_map.get(address.message_id!)!.content,
            ),
        );
        topic_cell.addEventListener("click", () => {
            APP.add_search_widget(address);
        });

        const row_widget: RowWidget = {
            divs: [channel_cell, topic_cell, message_cell],
        };
        rows.push(row_widget);
    }
    const table_widget = table(["Channel", "Topic", "Last message"], rows);
    div.append(table_widget);

    return { div };
}
