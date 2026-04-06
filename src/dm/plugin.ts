import * as colors from "../colors";
import { render_message_content } from "../message_content";
import type { Plugin, PluginContext } from "../plugin_helper";
import * as dm_model from "./model";

function render_dm(msg: dm_model.DirectMessage): HTMLDivElement {
    const div = document.createElement("div");
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.paddingBottom = "6px";
    div.style.marginBottom = "6px";

    const header = document.createElement("div");
    header.style.fontWeight = "bold";
    header.style.color = colors.primary;
    header.style.marginBottom = "2px";

    const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    header.innerText = `${dm_model.user_name(msg.sender_id)} — ${time}`;
    div.append(header);

    const recipients = document.createElement("div");
    recipients.style.fontSize = "12px";
    recipients.style.color = colors.text_muted;
    recipients.innerText = `To: ${dm_model.recipient_names(msg)}`;
    div.append(recipients);

    div.append(render_message_content(msg.content));

    return div;
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No direct messages yet.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("DMs");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "600px";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";

    function refresh(): void {
        div.innerHTML = "";
        const messages = dm_model.get_messages();
        if (messages.length === 0) {
            div.append(build_empty_message());
            return;
        }
        const sorted = [...messages].sort(
            (a, b) => b.timestamp - a.timestamp,
        );
        for (const msg of sorted.slice(0, 30)) {
            div.append(render_dm(msg));
        }
    }

    dm_model.on_change(refresh);
    refresh();

    return { div };
}
