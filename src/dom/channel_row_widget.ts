import type { ChannelRow } from "../row_types";
import type { SearchWidget } from "../search_widget";

import { render_unread_count } from "./render";

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

function render_name_div(
    channel_row: ChannelRow,
    selected: boolean,
    search_widget: SearchWidget,
) {
    const div = render_channel_name(channel_row.name());

    div.addEventListener("click", () => {
        if (selected) {
            search_widget.clear_channel();
        } else {
            search_widget.set_channel_id(channel_row.stream_id());
        }
    });

    if (selected) {
        div.style.backgroundColor = "cyan";
    }

    return div;
}

export function row_widget(
    channel_row: ChannelRow,
    selected: boolean,
    search_widget: SearchWidget,
): { divs: HTMLDivElement[] } {
    const name_div = render_name_div(
        channel_row,
        selected,
        search_widget,
    );

    return {
        divs: [
            render_unread_count(channel_row.unread_count()),
            name_div,
            render_num_topics(channel_row.num_topics()),
        ],
    };
}
