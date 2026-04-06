import { api_form_request } from "../backend/api_helpers";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
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

async function create_channel(
    name: string,
    description: string,
    is_private: boolean,
): Promise<void> {
    const subscription = {
        name,
        description,
    };
    const params: Record<string, string> = {
        subscriptions: JSON.stringify([subscription]),
    };
    if (is_private) {
        params.invite_only = "true";
    }
    const data = await api_form_request(
        "POST",
        "users/me/subscriptions",
        params,
    );
    if (data.result === "success") {
        StatusBar.celebrate(`Channel "#${name}" created!`);
    } else {
        StatusBar.scold(`Failed to create channel: ${data.msg ?? "unknown error"}`);
    }
}

function build_create_channel_form(): HTMLDivElement {
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

    const button_div = document.createElement("div");
    button_div.style.marginTop = "16px";
    const create_button = new Button("Create", 100, () => {
        const name = name_input.value.trim();
        if (name === "") {
            StatusBar.scold("Channel name cannot be empty.");
            return;
        }
        create_channel(
            name,
            desc_input.value.trim(),
            visibility_select.value === "private",
        );
    });
    button_div.append(create_button.div);
    form.append(button_div);

    return form;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Admin");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "500px";

    div.append(build_create_channel_form());

    return { div };
}
