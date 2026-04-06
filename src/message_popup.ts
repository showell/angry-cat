import { APP } from "./app";
import { Button } from "./button";
import * as table_widget from "./dom/table_widget";
import type { MessageRow } from "./backend/message_row";
import * as star_widget from "./star_widget";

function text(s: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = s;
    return div;
}

function link_table(message_row: MessageRow): HTMLTableElement {
    const columns = ["Link type", "Syntax"];

    const row_widgets = [
        { divs: [text("Sender mention"), text(message_row.sender_mention())] },
        { divs: [text("Channel link"), text(message_row.channel_link())] },
        { divs: [text("Topic link"), text(message_row.topic_link())] },
        { divs: [text("Message link"), text(message_row.message_link())] },
    ];

    return table_widget.table(columns, row_widgets);
}

export class MessagePopup {
    div: HTMLDivElement;
    focus_confirm: () => void;

    constructor(message_row: MessageRow) {
        this.focus_confirm = () => {};

        const div = document.createElement("div");
        div.append(link_table(message_row));

        const button_container = document.createElement("div");
        button_container.style.marginTop = "10px";

        const read_later_button = new Button("Read Later", 120, () => {
            APP.add_address_link_to_reading_list(message_row.address());
            button_container.innerHTML = "";
            const confirmation = document.createElement("span");
            confirmation.innerText = "OK! Reading list updated.";
            button_container.append(confirmation);
            this.focus_confirm();
        });

        const star_button = star_widget.render_star_button(
            message_row.message_id(),
            () => {
                button_container.innerHTML = "";
                const confirmation = document.createElement("span");
                confirmation.innerText = "Message starred!";
                button_container.append(confirmation);
                this.focus_confirm();
            },
        );
        if (star_button) {
            button_container.append(star_button.div);
        }

        button_container.append(read_later_button.div);
        div.append(button_container);

        this.div = div;
    }

    set_focus_confirm(fn: () => void): void {
        this.focus_confirm = fn;
    }
}
