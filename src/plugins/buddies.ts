import type { User } from "../backend/db_types";
import * as buddy_list from "../buddy_list";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";

function render_user_row(user: User): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.padding = "4px 0";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = buddy_list.is_buddy(user.id);
    checkbox.addEventListener("change", () => {
        buddy_list.toggle_buddy(user.id);
    });

    const name = document.createElement("span");
    name.innerText = user.full_name;

    div.append(checkbox, name);
    return div;
}

function render_section_header(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = text;
    div.style.fontWeight = "bold";
    div.style.color = colors.text_body;
    div.style.padding = "8px 0 4px";
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.marginBottom = "4px";
    return div;
}

function build_user_list(
    current_users: User[],
    other_users: User[],
): HTMLDivElement {
    const div = document.createElement("div");

    if (current_users.length > 0) {
        div.append(render_section_header("Current users"));
        for (const user of current_users) {
            div.append(render_user_row(user));
        }
    }

    if (other_users.length > 0) {
        div.append(render_section_header("Other users"));
        for (const user of other_users) {
            div.append(render_user_row(user));
        }
    }

    return div;
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No users found. Messages need to load first.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Buddies");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";
    div.style.maxWidth = "400px";

    const count_div = document.createElement("div");
    count_div.style.fontWeight = "bold";
    count_div.style.color = colors.primary;
    count_div.style.marginBottom = "8px";

    const list_div = document.createElement("div");

    div.append(count_div, list_div);

    function refresh(): void {
        const users = buddy_list.get_all_users();
        const buddy_count = buddy_list.get_buddies().length;
        const sender_ids = buddy_list.get_message_sender_ids();

        const current_users = users.filter((u) => sender_ids.has(u.id));
        const other_users = users.filter((u) => !sender_ids.has(u.id));

        count_div.innerText = `${buddy_count} buddy${buddy_count === 1 ? "" : "s"} selected`;

        list_div.innerHTML = "";
        if (users.length === 0) {
            list_div.append(build_empty_message());
        } else {
            list_div.append(build_user_list(current_users, other_users));
        }
    }

    buddy_list.on_change(refresh);
    refresh();

    return { div };
}
