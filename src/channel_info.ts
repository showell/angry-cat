import type { User } from "./backend/db_types";
import { stream_filter } from "./backend/filter";
import * as model from "./backend/model";
import * as zulip_client from "./backend/zulip_client";
import { render_list_heading } from "./dom/render";
import * as layout from "./layout";
import { render_message_content } from "./message_content";
import type { ChannelRow } from "./row_types";
import { StatusBar } from "./status_bar";

function render_section_label(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = text;
    div.style.fontSize = "13px";
    div.style.fontWeight = "bold";
    div.style.color = "#000080";
    div.style.marginTop = "12px";
    div.style.marginBottom = "4px";
    div.style.textTransform = "uppercase";
    div.style.letterSpacing = "0.05em";
    return div;
}

function render_participant(user: User): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = user.full_name;
    div.style.padding = "3px 6px";
    div.style.color = "#333";
    div.style.fontSize = "14px";
    div.style.borderLeft = "3px solid #CCCCFF";
    div.style.marginBottom = "3px";
    return div;
}

function render_participants(participants: User[]): HTMLDivElement {
    const div = document.createElement("div");
    for (const user of participants) {
        div.append(render_participant(user));
    }
    return div;
}

export class ChannelInfo {
    div: HTMLElement;
    stream_id: number;
    description_content_div: HTMLDivElement;

    constructor(channel_row: ChannelRow) {
        this.stream_id = channel_row.stream_id();

        const div = document.createElement("div");
        layout.layout_pane_div(div);
        div.style.minWidth = "180px";

        div.append(render_list_heading(`#${channel_row.name()}`));

        const rendered_description = channel_row.rendered_description();
        if (rendered_description || model.current_user_is_admin()) {
            const label_row = document.createElement("div");
            label_row.style.display = "flex";
            label_row.style.alignItems = "baseline";
            label_row.style.gap = "8px";
            label_row.append(render_section_label("Description"));

            if (model.current_user_is_admin()) {
                const edit_button = document.createElement("button");
                edit_button.innerText = "edit";
                edit_button.style.fontSize = "11px";
                edit_button.style.color = "#888";
                edit_button.style.background = "none";
                edit_button.style.border = "none";
                edit_button.style.cursor = "pointer";
                edit_button.style.padding = "0";
                edit_button.addEventListener("click", () => {
                    this.show_edit_form();
                });
                label_row.append(edit_button);
            }

            div.append(label_row);
        }

        const description_content_div = document.createElement("div");
        div.append(description_content_div);
        this.description_content_div = description_content_div;
        this.show_description(rendered_description);

        const stream_weekly_traffic = channel_row.stream_weekly_traffic();
        if (stream_weekly_traffic) {
            div.append(render_section_label("Traffic"));
            const traffic_div = document.createElement("div");
            traffic_div.innerText = `~${stream_weekly_traffic} messages/week`;
            traffic_div.style.fontSize = "14px";
            traffic_div.style.color = "#333";
            div.append(traffic_div);
        }

        const filter = stream_filter(channel_row.stream_id());
        const messages = model.filtered_messages(filter);
        const participants = model.participants_for_messages(messages);

        if (participants.length > 0) {
            div.append(render_section_label("Participants"));
            div.append(render_participants(participants));
        }

        this.div = div;
    }

    show_description(rendered_description: string): void {
        const div = this.description_content_div;
        div.innerHTML = "";
        if (rendered_description) {
            div.append(render_message_content(rendered_description));
        }
    }

    show_edit_form(): void {
        const stream = model.stream_for(this.stream_id);
        const div = this.description_content_div;
        div.innerHTML = "";

        const textarea = document.createElement("textarea");
        textarea.value = stream.description;
        textarea.style.width = "100%";
        textarea.style.minHeight = "80px";
        textarea.style.fontSize = "14px";
        textarea.style.padding = "4px";
        textarea.style.boxSizing = "border-box";
        textarea.style.marginBottom = "6px";

        const button_row = document.createElement("div");
        button_row.style.display = "flex";
        button_row.style.gap = "8px";

        const save_button = document.createElement("button");
        save_button.innerText = "Save";
        save_button.style.fontSize = "13px";
        save_button.style.padding = "3px 10px";

        const cancel_button = document.createElement("button");
        cancel_button.innerText = "Cancel";
        cancel_button.style.fontSize = "13px";
        cancel_button.style.padding = "3px 10px";

        save_button.addEventListener("click", () => {
            const new_description = textarea.value;
            zulip_client.update_stream_description(
                this.stream_id,
                new_description,
            );
            this.show_description(stream.rendered_description);
            StatusBar.inform("Saving description…");
        });

        cancel_button.addEventListener("click", () => {
            this.show_description(stream.rendered_description);
        });

        button_row.append(save_button, cancel_button);
        div.append(textarea, button_row);
        textarea.focus();
    }

    handle_stream_update(rendered_description: string): void {
        this.show_description(rendered_description);
        StatusBar.celebrate("Channel description updated!");
    }
}
