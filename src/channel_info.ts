import type { User } from "./backend/db_types";
import { stream_filter } from "./backend/filter";
import * as model from "./backend/model";
import { render_list_heading } from "./dom/render";
import * as layout from "./layout";
import { render_message_content } from "./message_content";
import type { ChannelRow } from "./row_types";

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

    constructor(channel_row: ChannelRow) {
        const div = document.createElement("div");
        layout.layout_pane_div(div);
        div.style.minWidth = "180px";

        div.append(render_list_heading(`#${channel_row.name()}`));

        const rendered_description = channel_row.rendered_description();
        if (rendered_description) {
            div.append(render_section_label("Description"));
            div.append(render_message_content(rendered_description));
        }

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
}
