// Invite plugin — lets admins generate one-time invite links for
// new users. The invitee clicks the link and is automatically
// logged in with a fresh account, subscribed to public channels.

import { gopher_form_request } from "../backend/api_helpers";
import * as config from "../backend/config";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
import { StatusBar } from "../status_bar";

function build_invite_form(on_submit: (name: string, email: string) => void): HTMLDivElement {
    const form = document.createElement("div");

    const heading = document.createElement("div");
    heading.innerText = "Invite a New User";
    heading.style.fontSize = "18px";
    heading.style.fontWeight = "bold";
    heading.style.color = colors.primary;
    heading.style.marginBottom = "12px";
    form.append(heading);

    const instructions = document.createElement("div");
    instructions.style.marginBottom = "12px";
    instructions.style.lineHeight = "1.5";
    instructions.innerText =
        "Enter the person's name and email. We'll generate a " +
        "one-time invite link that you can send them. The link " +
        "expires after 24 hours.";
    form.append(instructions);

    function add_field(label_text: string, placeholder: string, type: string): HTMLInputElement {
        const label = document.createElement("div");
        label.innerText = label_text;
        label.style.fontWeight = "bold";
        label.style.marginTop = "8px";
        label.style.marginBottom = "4px";
        form.append(label);

        const input = document.createElement("input");
        input.type = type;
        input.placeholder = placeholder;
        input.style.width = "300px";
        input.style.padding = "4px";
        input.style.fontSize = "16px";
        form.append(input);
        return input;
    }

    const name_input = add_field("Full Name", "e.g. Mom", "text");
    const email_input = add_field("Email", "e.g. mom@example.com", "email");

    const button_div = document.createElement("div");
    button_div.style.marginTop = "16px";
    const submit_button = new Button("Create Invite", 140, () => {
        const name = name_input.value.trim();
        const email = email_input.value.trim();
        if (!name || !email) {
            StatusBar.scold("Please fill in both name and email.");
            return;
        }
        on_submit(name, email);
    });
    button_div.append(submit_button.div);
    form.append(button_div);

    return form;
}

function build_invite_result(invite_url: string, name: string): HTMLDivElement {
    const div = document.createElement("div");

    const heading = document.createElement("div");
    heading.innerText = `Invite for ${name}`;
    heading.style.fontSize = "18px";
    heading.style.fontWeight = "bold";
    heading.style.color = colors.primary;
    heading.style.marginBottom = "12px";
    div.append(heading);

    const instructions = document.createElement("div");
    instructions.innerText = "Send this link to your invitee. It can only be used once and expires after 24 hours.";
    instructions.style.marginBottom = "12px";
    instructions.style.lineHeight = "1.5";
    div.append(instructions);

    const link_box = document.createElement("input");
    link_box.type = "text";
    link_box.readOnly = true;
    link_box.value = invite_url;
    link_box.style.width = "100%";
    link_box.style.padding = "8px";
    link_box.style.fontSize = "14px";
    link_box.style.fontFamily = "monospace";
    link_box.style.border = `1px solid ${colors.border_subtle}`;
    link_box.style.borderRadius = "4px";
    div.append(link_box);

    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "8px";
    button_row.style.marginTop = "12px";

    const copy_button = new Button("Copy Link", 120, () => {
        link_box.select();
        navigator.clipboard.writeText(invite_url);
        StatusBar.celebrate("Link copied to clipboard!");
    });

    button_row.append(copy_button.div);
    div.append(button_row);

    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Invite");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "500px";

    // History of created invites during this session.
    const history_div = document.createElement("div");
    history_div.style.marginTop = "24px";

    function show_form(): void {
        div.innerHTML = "";
        div.append(build_invite_form(create_invite));
        div.append(history_div);
    }

    async function create_invite(name: string, email: string): Promise<void> {
        const result = await gopher_form_request("POST", "invites", {
            full_name: name,
            email,
        });

        if (result.result !== "success") {
            StatusBar.scold(`Failed to create invite: ${result.msg ?? "unknown error"}`);
            return;
        }

        const token = (result as any).token;
        const realm_url = config.get_current_realm_url();
        const nickname = config.get_current_realm_nickname();
        const invite_url = `${realm_url.replace(/:\d+$/, "")}:8000/${nickname}?invite=${token}`;

        // Add to history.
        const entry = document.createElement("div");
        entry.style.padding = "8px";
        entry.style.marginBottom = "8px";
        entry.style.border = `1px solid ${colors.border_subtle}`;
        entry.style.borderRadius = "4px";
        entry.style.fontSize = "14px";
        entry.innerHTML = `<b>${name}</b> (${email})`;
        history_div.prepend(entry);

        // Show the result with the copy-able link.
        div.innerHTML = "";
        div.append(build_invite_result(invite_url, name));

        const another_button = new Button("Invite Another", 140, show_form);
        another_button.div.style.marginTop = "16px";
        div.append(another_button.div);
        div.append(history_div);

        StatusBar.celebrate(`Invite created for ${name}!`);
    }

    show_form();

    return { div };
}
