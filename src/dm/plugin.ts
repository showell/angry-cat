import * as buddy_list from "../buddy_list";
import { Button } from "../button";
import * as colors from "../colors";
import { render_message_content } from "../message_content";
import type { Plugin, PluginContext } from "../plugin_helper";
import { StatusBar } from "../status_bar";
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

    div.append(render_message_content(msg.content));

    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("DMs");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "600px";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";

    const content_div = document.createElement("div");
    div.append(content_div);

    let current_other_user_id: number | undefined;

    function show_conversation_list(): void {
        current_other_user_id = undefined;
        content_div.innerHTML = "";

        const heading = document.createElement("div");
        heading.innerText = "Direct Messages";
        heading.style.fontSize = "18px";
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        heading.style.marginBottom = "12px";
        content_div.append(heading);

        // New DM button.
        const new_dm_btn = new Button("New DM", 100, () => {
            show_user_picker();
        });
        new_dm_btn.div.style.marginBottom = "12px";
        content_div.append(new_dm_btn.div);

        // Conversation list.
        const convos = dm_model.get_conversations();
        if (convos.length === 0) {
            const empty = document.createElement("div");
            empty.innerText = "No conversations yet. Start one!";
            empty.style.color = colors.text_muted;
            empty.style.padding = "12px 0";
            content_div.append(empty);
        } else {
            for (const convo of convos) {
                const row = document.createElement("div");
                row.style.padding = "8px";
                row.style.border = `1px solid ${colors.border_subtle}`;
                row.style.borderRadius = "4px";
                row.style.marginBottom = "4px";
                row.style.cursor = "pointer";
                row.addEventListener("mouseenter", () => {
                    row.style.background = "#f0f0ff";
                });
                row.addEventListener("mouseleave", () => {
                    row.style.background = "";
                });

                const name = document.createElement("b");
                name.innerText = convo.full_name;
                row.append(name);

                const count = document.createElement("span");
                count.style.color = colors.text_muted;
                count.style.marginLeft = "8px";
                count.innerText = `(${convo.message_count} messages)`;
                row.append(count);

                row.addEventListener("click", () => {
                    show_conversation(convo.other_user_id, convo.full_name);
                });

                content_div.append(row);
            }
        }
    }

    function show_user_picker(): void {
        content_div.innerHTML = "";

        const heading = document.createElement("div");
        heading.innerText = "Send a DM to...";
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        heading.style.marginBottom = "8px";
        content_div.append(heading);

        const back_btn = new Button("Back", 60, show_conversation_list);
        back_btn.div.style.marginBottom = "8px";
        content_div.append(back_btn.div);

        const users = buddy_list.get_all_users().filter(
            (u) => u.id !== (globalThis as any).DB?.current_user_id,
        );

        // Simpler: just use the full user list from buddy_list.
        const all_users = buddy_list.get_all_users();
        for (const user of all_users) {
            if (user.id === dm_model.current_user_id()) continue;

            const row = document.createElement("div");
            row.style.padding = "6px 8px";
            row.style.cursor = "pointer";
            row.style.borderRadius = "4px";
            row.addEventListener("mouseenter", () => {
                row.style.background = "#f0f0ff";
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = "";
            });
            row.innerText = user.full_name;
            row.addEventListener("click", () => {
                show_conversation(user.id, user.full_name);
            });
            content_div.append(row);
        }
    }

    async function show_conversation(
        other_user_id: number,
        name: string,
    ): Promise<void> {
        current_other_user_id = other_user_id;
        content_div.innerHTML = "";

        const header_div = document.createElement("div");
        header_div.style.display = "flex";
        header_div.style.alignItems = "center";
        header_div.style.gap = "8px";
        header_div.style.marginBottom = "12px";

        const back_btn = new Button("Back", 60, show_conversation_list);
        header_div.append(back_btn.div);

        const heading = document.createElement("b");
        heading.innerText = name;
        heading.style.fontSize = "16px";
        heading.style.color = colors.primary;
        header_div.append(heading);

        content_div.append(header_div);

        // Loading state.
        const loading = document.createElement("div");
        loading.innerText = "Loading...";
        loading.style.color = colors.text_muted;
        content_div.append(loading);

        const msgs = await dm_model.load_messages_with(other_user_id);
        if (current_other_user_id !== other_user_id) return; // navigated away

        loading.remove();

        const messages_div = document.createElement("div");
        messages_div.style.marginBottom = "12px";
        if (msgs.length === 0) {
            const empty = document.createElement("div");
            empty.innerText = "No messages yet.";
            empty.style.color = colors.text_muted;
            messages_div.append(empty);
        } else {
            for (const msg of msgs) {
                messages_div.append(render_dm(msg));
            }
        }
        content_div.append(messages_div);

        // Compose area.
        const textarea = document.createElement("textarea");
        textarea.placeholder = `Message ${name}...`;
        textarea.style.width = "100%";
        textarea.style.height = "60px";
        textarea.style.padding = "6px";
        textarea.style.boxSizing = "border-box";
        textarea.style.marginBottom = "6px";
        content_div.append(textarea);

        const send_btn = new Button("Send", 80, async () => {
            const text = textarea.value.trim();
            if (!text) return;

            send_btn.disable();
            textarea.disabled = true;
            StatusBar.inform("Sending...");

            const result = await dm_model.send_dm(other_user_id, text);
            if (result.result === "success") {
                textarea.value = "";
                StatusBar.celebrate("Sent!");
                // Reload the conversation to show the new message.
                show_conversation(other_user_id, name);
            } else {
                StatusBar.scold(
                    `Failed to send: ${(result as { msg?: string }).msg ?? "unknown error"}`,
                );
                send_btn.enable();
                textarea.disabled = false;
            }
        });
        content_div.append(send_btn.div);

        textarea.focus();
    }

    // Listen for new DM events to refresh the current view.
    dm_model.on_change(() => {
        if (current_other_user_id !== undefined) {
            const name =
                buddy_list
                    .get_all_users()
                    .find((u) => u.id === current_other_user_id)?.full_name ??
                "Unknown";
            show_conversation(current_other_user_id, name);
        }
    });

    show_conversation_list();

    return {
        div,
        refresh() {
            if (current_other_user_id === undefined) {
                show_conversation_list();
            }
        },
    };
}
