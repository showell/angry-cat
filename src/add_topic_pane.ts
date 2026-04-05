import type { ChannelRow } from "./channel_row";
import { ComposeBox } from "./compose";
import * as layout from "./layout";
import { render_list_heading } from "./render";
import { StatusBar } from "./status_bar";

function render_heading(stream_name: string): HTMLElement {
    const title = `Start new topic on channel: ${stream_name}`;
    const div = render_list_heading(title);

    div.style.color = "green";

    return div;
}

export class AddTopicPane {
    div: HTMLElement;
    compose_box: ComposeBox;

    constructor(channel_row: ChannelRow) {
        const div = document.createElement("div");
        layout.layout_pane_div(div);

        StatusBar.inform("Choose a fairly short topic name, please.");

        const compose_box = this.make_compose_box(channel_row.stream_id());

        div.innerHTML = "";
        div.style.height = "fit-content";

        div.append(render_heading(channel_row.name()));
        div.append(compose_box.div);

        this.div = div;
        this.compose_box = compose_box;
    }

    make_compose_box(stream_id: number): ComposeBox {
        const blank_name = "";
        return new ComposeBox(stream_id, blank_name);
    }

    focus_compose_box(): void {
        this.compose_box.focus_topic_input();
    }
}
