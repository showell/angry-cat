import type { TopicRow } from "../row_types";
import type { SearchWidget } from "../search_widget";

import { render_unread_count } from "./render";

function render_topic_count(count: number): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = `${count}`;
    div.style.textAlign = "right";
    div.style.paddingRight = "3px";

    return div;
}

function render_topic_name(topic_name: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "> " + topic_name;
    div.style.maxWidth = "270px";
    div.style.overflowWrap = "break-word";
    div.style.color = "#000080";
    div.style.cursor = "pointer";
    div.style.paddingLeft = "3px";

    return div;
}

function render_name_div(
    topic_row: TopicRow,
    selected: boolean,
    search_widget: SearchWidget,
): HTMLDivElement {
    const topic_id = topic_row.topic_id();
    const topic_name = topic_row.name();

    const div = render_topic_name(topic_name);

    div.addEventListener("click", () => {
        if (selected) {
            search_widget.clear_message_view();
        } else {
            search_widget.set_topic_id(topic_id);
        }
    });

    if (selected) {
        div.style.backgroundColor = "cyan";
    }

    return div;
}

export function row_widget(
    topic_row: TopicRow,
    selected: boolean,
    search_widget: SearchWidget,
): { divs: HTMLDivElement[] } {
    const name_div = render_name_div(topic_row, selected, search_widget);

    return {
        divs: [
            render_unread_count(topic_row.unread_count()),
            name_div,
            render_topic_count(topic_row.num_messages()),
        ],
    };
}
