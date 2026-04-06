import * as colors from "./colors";
import { ComposeBox } from "./compose";
import * as layout from "./layout";
import { render_list_heading } from "./render";
import type { TopicRow } from "./topic_row";

function render_heading(stream_name: string): HTMLElement {
    const title = `Send message to channel: ${stream_name}`;
    const div = render_list_heading(title);

    div.style.color = colors.success;

    return div;
}

export class ReplyPane {
    div: HTMLElement;
    compose_box: ComposeBox;

    constructor(topic_row: TopicRow) {
        const div = document.createElement("div");
        layout.layout_pane_div(div);
        div.style.alignSelf = "flex-start";

        div.append(render_heading(topic_row.stream_name()));

        const stream_id = topic_row.stream_id();
        const topic_name = topic_row.name();
        const compose_box = new ComposeBox(stream_id, topic_name);
        div.append(compose_box.div);

        this.div = div;
        this.compose_box = compose_box;
    }

    has_text(): boolean {
        return this.compose_box.has_text();
    }

    is_textarea_focused(): boolean {
        return this.compose_box.is_textarea_focused();
    }

    blur(): void {
        this.compose_box.blur_textarea();
    }

    focus(): void {
        this.compose_box.focus_textarea();
    }
}
