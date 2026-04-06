import * as colors from "./colors";
import type { TopicRow } from "./backend/topic_row";

function render_topic_heading_count(count: number): HTMLElement {
    const div = document.createElement("div");
    div.innerText = `(${count} messages)`;
    div.style.padding = "2px";
    div.style.marginLeft = "3px";

    return div;
}

function render_topic_heading(topic_row: TopicRow): HTMLElement {
    const div = document.createElement("div");
    div.innerText = "> " + topic_row.name();
    div.style.paddingBottom = "0px";
    div.style.fontSize = "19px";

    return div;
}

export class MessageViewHeader {
    div: HTMLDivElement;

    constructor(topic_row: TopicRow) {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.borderBottom = `1px solid ${colors.border}`;
        div.style.paddingBottom = "4px";
        div.style.marginBottom = "12px";

        div.append(render_topic_heading(topic_row));
        div.append(render_topic_heading_count(topic_row.num_messages()));

        this.div = div;
    }
}
