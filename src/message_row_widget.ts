import { APP } from "./app";
import { is_starred } from "./backend/database";
import * as zulip_client from "./backend/zulip_client";
import { Button } from "./button";
import * as colors from "./colors";
import { render_message_content } from "./message_content";
import { MessagePopup } from "./message_popup";
import type { MessageRow } from "./backend/message_row";
import { pop } from "./popup";
import { ReactionsRowWidget } from "./reactions_row_widget";
import * as mouse_drag from "./util/mouse_drag";

function render_message_box() {
    const div = document.createElement("div");

    div.style.paddingTop = "5px";
    div.style.marginBottom = "5px";
    div.style.borderBottom = `1px dotted ${colors.primary}`;
    div.style.fontSize = "16px";
    div.style.fontFamily = `"Source Sans 3 VF", sans-serif`;
    div.style.lineHeight = "22.4px";
    div.style.cursor = "pointer";

    return div;
}

export function render_sender_name(sender_name: string): HTMLElement {
    const div = document.createElement("div");
    div.innerText = sender_name;
    div.style.fontWeight = "bold";
    div.style.fontSize = "16px";
    div.style.color = colors.text_body;
    return div;
}

function time_widget(timestamp: number): HTMLDivElement {
    const div = document.createElement("div");
    const date = new Date(timestamp * 1000);
    const formatted_time = date.toLocaleString();
    div.innerText = `${formatted_time}`;
    div.style.fontSize = "12px";
    div.style.marginLeft = "5px";
    return div;
}

function top_line(message_row: MessageRow): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "flex-end";
    div.style.marginTop = "12px";

    div.append(render_sender_name(message_row.sender_name()));
    div.append(time_widget(message_row.timestamp()));

    return div;
}

function address_line(message_row: MessageRow): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.marginTop = "3px";
    div.style.marginBottom = "3px";

    const from_div = document.createElement("div");
    from_div.innerText = message_row.channel_topic();
    from_div.style.fontSize = "16px";
    from_div.style.fontWeight = "bold";
    from_div.style.color = colors.text_body;

    const button = new Button("view", 60, () => {
        APP.add_navigator(message_row.address());
        button.set_normal_color();
    });

    button.div.style.marginRight = "10px";

    div.append(button.div);
    div.append(from_div);
    return div;
}

export class MessageRowWidget {
    div: HTMLElement;

    constructor(message_row: MessageRow, topic_id: number | undefined) {
        const div = render_message_box();

        div.addEventListener("click", (e) => {
            if (mouse_drag.is_drag(e)) {
                return;
            }

            const message_popup = new MessagePopup(message_row);
            const popup = pop({
                div: message_popup.div,
                confirm_button_text: "Ok",
                callback() {},
            });
            message_popup.set_focus_confirm(() => popup.focus_confirm_button());

            e.stopPropagation();
        });

        const message_id = message_row.message_id();

        // Starred takes visual priority over unread.
        if (is_starred(message_id)) {
            div.style.backgroundColor = "#c6f6c6";
        } else if (message_row.unread()) {
            div.style.backgroundColor = colors.unread_bg;
        }

        div.append(top_line(message_row));

        if (message_row.topic_id() !== topic_id) {
            div.append(address_line(message_row));
        }

        const content = message_row.content();
        const content_div = render_message_content(content);

        const reactions_widget = new ReactionsRowWidget(message_id);

        // Put the unstar button in the same row as reactions.
        if (is_starred(message_id)) {
            const unstar_button = new Button("Unstar", 70, () => {
                zulip_client.set_message_starred(message_id, false);
            });
            reactions_widget.div.append(unstar_button.div);
        }

        div.append(content_div);
        div.append(reactions_widget.div);

        this.div = div;
    }
}
