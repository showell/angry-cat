import { api_form_request } from "../backend/api_helpers";
import { DB } from "../backend/database";
import type { User } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import * as buddy_list from "../buddy_list";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
import * as popup from "../popup";
import { StatusBar } from "../status_bar";

function render_label(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.innerText = text;
    label.style.fontWeight = "bold";
    label.style.display = "block";
    label.style.marginTop = "12px";
    label.style.marginBottom = "4px";
    return label;
}

function render_text_input(placeholder: string): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.style.width = "300px";
    input.style.padding = "4px";
    return input;
}

function render_textarea(placeholder: string): HTMLTextAreaElement {
    const textarea = document.createElement("textarea");
    textarea.placeholder = placeholder;
    textarea.style.width = "300px";
    textarea.style.height = "60px";
    textarea.style.padding = "4px";
    return textarea;
}

function build_subscriber_picker(): {
    div: HTMLDivElement;
    get_selected_ids: () => number[];
} {
    const div = document.createElement("div");
    const me = DB.current_user_id;
    const other_buddies = buddy_list
        .get_buddies()
        .filter((u) => u.id !== me);

    const checkboxes: { user: User; checkbox: HTMLInputElement }[] = [];

    for (const user of other_buddies) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "2px 0";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        const name = document.createElement("span");
        name.innerText = user.full_name;

        row.append(checkbox, name);
        div.append(row);
        checkboxes.push({ user, checkbox });
    }

    if (other_buddies.length === 0) {
        const empty = document.createElement("div");
        empty.innerText = "No buddies to add. Select some in the Buddies tab.";
        empty.style.color = colors.text_muted;
        div.append(empty);
    }

    function get_selected_ids(): number[] {
        return checkboxes
            .filter((c) => c.checkbox.checked)
            .map((c) => c.user.id);
    }

    return { div, get_selected_ids };
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Admin");

    let pending_channel_name: string | undefined;
    let waiting_popup: ReturnType<typeof popup.pop> | undefined;

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "500px";

    function rebuild_form(): void {
        div.innerHTML = "";
        div.append(build_form());
    }

    function build_form(): HTMLDivElement {
        const form = document.createElement("div");

        const heading = document.createElement("div");
        heading.innerText = "Create Channel";
        heading.style.fontSize = "18px";
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        heading.style.marginBottom = "8px";
        form.append(heading);

        form.append(render_label("Channel name"));
        const name_input = render_text_input("e.g. design-reviews");
        form.append(name_input);

        form.append(render_label("Description (optional)"));
        const desc_input = render_textarea("What is this channel about?");
        form.append(desc_input);

        form.append(render_label("Visibility"));
        const visibility_select = document.createElement("select");
        const public_option = document.createElement("option");
        public_option.value = "public";
        public_option.innerText = "Public";
        const private_option = document.createElement("option");
        private_option.value = "private";
        private_option.innerText = "Private";
        visibility_select.append(public_option, private_option);
        form.append(visibility_select);

        form.append(render_label("Subscribe buddies"));
        const subscriber_picker = build_subscriber_picker();
        form.append(subscriber_picker.div);

        const button_div = document.createElement("div");
        button_div.style.marginTop = "16px";
        const create_button = new Button("Create", 100, () => {
            const name = name_input.value.trim();
            if (name === "") {
                StatusBar.scold("Channel name cannot be empty.");
                return;
            }
            submit_create(
                name,
                desc_input.value.trim(),
                visibility_select.value === "private",
                subscriber_picker.get_selected_ids(),
            );
        });
        button_div.append(create_button.div);
        form.append(button_div);

        return form;
    }

    async function submit_create(
        name: string,
        description: string,
        is_private: boolean,
        subscriber_ids: number[],
    ): Promise<void> {
        pending_channel_name = name;

        const waiting_div = document.createElement("div");
        waiting_div.innerText = `Creating channel "#${name}"...`;
        waiting_div.style.padding = "8px 4px";
        waiting_popup = popup.pop({
            div: waiting_div,
            confirm_button_text: "Waiting...",
            callback: () => {},
        });
        waiting_popup.confirm_button.disable();

        const subscription = { name, description };
        const params: Record<string, string> = {
            subscriptions: JSON.stringify([subscription]),
        };
        if (is_private) {
            params.invite_only = "true";
        }
        if (subscriber_ids.length > 0) {
            params.principals = JSON.stringify(subscriber_ids);
        }
        const data = await api_form_request(
            "POST",
            "users/me/subscriptions",
            params,
        );
        if (data.result !== "success") {
            pending_channel_name = undefined;
            waiting_popup.finish();
            waiting_popup = undefined;
            StatusBar.scold(
                `Failed to create channel: ${data.msg ?? "unknown error"}`,
            );
        }
    }

    function handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor !== EventFlavor.SUBSCRIPTION_ADD) return;
        if (pending_channel_name === undefined) return;
        if (!event.stream_names.includes(pending_channel_name)) return;

        const name = pending_channel_name;
        pending_channel_name = undefined;

        if (waiting_popup) {
            waiting_popup.finish();
            waiting_popup = undefined;
        }

        const success_div = document.createElement("div");
        success_div.innerText = `Channel "#${name}" created!`;
        success_div.style.padding = "8px 4px";
        popup.pop({
            div: success_div,
            confirm_button_text: "OK",
            callback: () => {
                rebuild_form();
            },
        });
    }

    rebuild_form();

    return {
        div,
        handle_zulip_event,
    };
}
