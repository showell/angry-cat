import type { PluginHelper } from "../plugin_helper";
import type { TodoItemData } from "../todo_list";

import { APP } from "../app";
import { DB } from "../backend/database";
import { TodoList } from "../todo_list";

function render_content(data: TodoItemData): HTMLElement {
    if (data.kind === "text") {
        const span = document.createElement("span");
        span.innerText = data.text;
        return span;
    }

    const { channel_id, topic_id, message_id } = data.address;
    const channel_name =
        channel_id !== undefined
            ? (DB.channel_map.get(channel_id)?.name ?? `channel:${channel_id}`)
            : "?";
    const topic_name =
        topic_id !== undefined
            ? (DB.topic_map.get(topic_id)?.topic_name ?? `topic:${topic_id}`)
            : "?";

    const button = document.createElement("button");
    button.innerText = `#${channel_name} > ${topic_name} (msg ${message_id})`;
    button.style.color = "darkgreen";
    button.style.fontWeight = "bold";
    button.style.background = "none";
    button.style.border = "none";
    button.style.cursor = "pointer";
    button.style.padding = "0";
    button.style.textAlign = "left";
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        APP.add_navigator(data.address);
    });
    return button;
}

function on_remove(_data: TodoItemData): void {
    // message ID tracking added in next step
}

export function plugin(plugin_helper: PluginHelper) {
    plugin_helper.update_label("Reading List");

    const todo_list = new TodoList({ render_content, on_remove });
    APP.set_reading_list(todo_list);

    return { div: todo_list.div };
}
