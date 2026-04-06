import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import { MessageRow } from "../backend/message_row";
import { MessageRowWidget } from "../message_row_widget";
import type { Plugin, PluginContext } from "../plugin_helper";

export function plugin(context: PluginContext): Plugin {
    const radio = new EventRadio(context);
    return {
        div: radio.div,
        handle_zulip_event: (event) => radio.handle_zulip_event(event),
    };
}

class EventRadio {
    div: HTMLDivElement;
    context: PluginContext;

    constructor(context: PluginContext) {
        this.context = context;
        context.update_label("Events");

        const div = document.createElement("div");

        const heading = document.createElement("div");
        heading.innerText = "(waiting for events)";
        div.style.fontWeight = "bold";

        div.append(heading);

        this.div = div;
    }

    handle_zulip_event(event: ZulipEvent): void {
        const div = this.div;

        if (event.flavor === EventFlavor.MESSAGE) {
            const message = event.message;

            const message_row = new MessageRow(message);

            const address_div = document.createElement("div");

            const topic_id = undefined;
            const message_row_widget = new MessageRowWidget(
                message_row,
                topic_id,
            );

            div.append(address_div);
            div.append(message_row_widget.div);
        } else {
            const json = JSON.stringify(event, null, 4);
            const elem = document.createElement("div");
            elem.innerText = json;
            div.append(elem);
        }

        this.context.highlight_tab();

        this.scroll_to_bottom();
    }

    scroll_to_bottom(): void {
        const div = this.div;
        div.scrollTop = div.scrollHeight - div.clientHeight;
    }
}
