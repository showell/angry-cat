import * as colors from "../colors";
import type { Navigator } from "../navigator";
import type { TopicRow } from "../topic_row";
import { render_unread_count } from "./render";

function render_topic_count(count: number): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = `${count}`;
    div.style.textAlign = "right";
    div.style.paddingRight = "3px";

    return div;
}

export function render_topic_name(topic_name: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "> " + topic_name;
    div.style.maxWidth = "270px";
    div.style.overflowWrap = "break-word";
    div.style.color = colors.text_heading;
    div.style.cursor = "pointer";
    div.style.paddingLeft = "3px";

    return div;
}

function render_name_div(
    topic_row: TopicRow,
    selected: boolean,
    navigator: Navigator,
): HTMLDivElement {
    const topic_id = topic_row.topic_id();
    const topic_name = topic_row.name();

    const div = render_topic_name(topic_name);

    div.addEventListener("click", () => {
        if (selected) {
            navigator.clear_message_view();
        } else {
            navigator.set_topic_id(topic_id);
        }
    });

    if (selected) {
        div.style.backgroundColor = colors.selected_bg;
    }

    return div;
}

export function row_widget(
    topic_row: TopicRow,
    selected: boolean,
    navigator: Navigator,
): { divs: HTMLDivElement[] } {
    const name_div = render_name_div(topic_row, selected, navigator);

    return {
        divs: [
            render_unread_count(topic_row.unread_count()),
            name_div,
            render_topic_count(topic_row.num_messages()),
        ],
    };
}
