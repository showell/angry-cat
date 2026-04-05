import * as table_widget from "./dom/table_widget";

import { APP } from "./app";
import { Button } from "./button";
import { MessageRow } from "./row_types";

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

    constructor(message_row: MessageRow) {
        const div = document.createElement("div");

        div.append(link_table(message_row));

        const button_container = document.createElement("div");
        button_container.style.marginTop = "10px";

        const read_later_button = new Button("Read Later", 120, () => {
            APP.add_to_reading_list(`Read ${message_row.message_link()}`);
            button_container.innerHTML = "";
            const confirmation = document.createElement("span");
            confirmation.innerText = "OK! Reading list updated.";
            button_container.append(confirmation);
        });

        button_container.append(read_later_button.div);
        div.append(button_container);

        this.div = div;
    }
}
