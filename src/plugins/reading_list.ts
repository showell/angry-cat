import { APP } from "../app";
import { DB, is_starred, label_for_address } from "../backend/database";
import { StatusBar } from "../status_bar";
import { MessageRow } from "../backend/message_row";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
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
    button.style.color = colors.primary;
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

function import_starred_messages(todo_list: TodoList): void {
    // Collect starred messages sorted by most recent first.
    const starred = [...DB.message_map.values()]
        .filter((m) => is_starred(m.id))
        .sort((a, b) => b.timestamp - a.timestamp);

    for (const message of starred) {
        const row = new MessageRow(message);
        todo_list.add_address_link_item(row.address());
    }
}

function maybe_show_import_banner(
    todo_list: TodoList,
    container: HTMLDivElement,
): void {
    // Only show if the reading list is empty and there are starred messages.
    if (todo_list.item_count() > 0) return;
    if (DB.starred_ids.size === 0) return;

    const banner = document.createElement("div");
    banner.style.padding = "12px";
    banner.style.marginBottom = "12px";
    banner.style.border = `1px solid ${colors.accent_border}`;
    banner.style.borderRadius = "8px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "10px";
    header.style.marginBottom = "8px";

    const avatar = document.createElement("img");
    avatar.src = "images/angry_cat.png";
    avatar.style.width = "40px";
    avatar.style.height = "40px";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";

    const name = document.createElement("span");
    name.innerText = "Angry Cat says:";
    name.style.fontWeight = "bold";
    name.style.color = colors.primary;

    header.append(avatar, name);
    banner.append(header);

    const text = document.createElement("div");
    text.style.fontSize = "14px";
    text.style.lineHeight = "1.5";
    text.style.marginBottom = "10px";
    text.innerText = `Your reading list is empty, but you have ${DB.starred_ids.size} starred message${DB.starred_ids.size === 1 ? "" : "s"}. Want to import them as reading list items?`;
    banner.append(text);

    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "6px";

    const no_thanks = new Button("No thanks", 100, () => {
        banner.remove();
    });
    const import_button = new Button("Import", 100, () => {
        const count = DB.starred_ids.size;
        import_starred_messages(todo_list);
        banner.remove();
        StatusBar.celebrate(`Imported ${count} starred message${count === 1 ? "" : "s"} into your reading list!`);
    });

    button_row.append(import_button.div, no_thanks.div);
    banner.append(button_row);

    // Insert the banner before the todo list content.
    container.prepend(banner);

    // Defer focus until the container is in the DOM (Page appends it
    // after the plugin factory returns).
    requestAnimationFrame(() => import_button.focus());
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Reading List");

    const todo_list = new TodoList({ render_content, on_remove });
    APP.set_reading_list(todo_list);

    const container = document.createElement("div");
    container.append(todo_list.div);

    maybe_show_import_banner(todo_list, container);

    return { div: container };
}
