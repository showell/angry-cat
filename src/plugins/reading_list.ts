import type { PluginHelper } from "../plugin_helper";
import type { TodoItemData } from "../todo_list";

import { APP } from "../app";
import { TodoList } from "../todo_list";

function render_content(data: TodoItemData): HTMLElement {
    const span = document.createElement("span");
    if (data.kind === "text") {
        span.innerText = data.text;
    } else {
        span.innerText = data.link_text;
        span.style.color = "#000080";
        span.style.fontWeight = "bold";
    }
    return span;
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
