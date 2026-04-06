import { APP } from "../app";
import { label_for_address } from "../backend/database";
import * as colors from "../colors";
import type { PluginHelper } from "../plugin_helper";
import type { TodoItemData } from "../todo_list";
import { TodoList } from "../todo_list";

function render_content(data: TodoItemData): HTMLElement {
    if (data.kind === "text") {
        const span = document.createElement("span");
        span.innerText = data.text;
        return span;
    }

    const label = label_for_address(data.address);

    const button = document.createElement("button");
    button.innerText = label;
    button.style.color = colors.link_text;
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
