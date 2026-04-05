import type { ChannelRow } from "../channel_row";

import { render_unread_count } from "../dom/render";

function render_num_topics(count: number): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = `${count}`;
    div.style.textAlign = "right";
    div.style.paddingRight = "3px";

    return div;
}

function render_channel_name(channel_name: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "#" + channel_name;
    div.style.maxWidth = "270px";
    div.style.overflowWrap = "break-word";
    div.style.color = "#000080";
    div.style.cursor = "pointer";

    return div;
}

export function row_widget(opts: {
    channel_row: ChannelRow;
    selected: boolean;
    set_channel_id: (channel_id: number) => void;
    clear_channel: () => void;
}): { divs: HTMLDivElement[] } {
    const { channel_row, selected, set_channel_id, clear_channel } = opts;

    const name_div = render_channel_name(channel_row.name());

    if (selected) {
        name_div.style.backgroundColor = "cyan";
    }

    name_div.addEventListener("click", () => {
        if (selected) {
            clear_channel();
        } else {
            set_channel_id(channel_row.stream_id());
        }
    });

    return {
        divs: [
            render_unread_count(channel_row.unread_count()),
            name_div,
            render_num_topics(channel_row.num_topics()),
        ],
    };
}
