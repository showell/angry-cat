import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import { MessageRow } from "../message_row";
import { MessageRowWidget } from "../message_row_widget";
import type { PluginHelper } from "../plugin_helper";

export function plugin(plugin_helper: PluginHelper): EventRadio {
    return new EventRadio(plugin_helper);
}

class EventRadio {
    div: HTMLDivElement;
    plugin_helper: PluginHelper;

    constructor(plugin_helper: PluginHelper) {
        this.plugin_helper = plugin_helper;
        plugin_helper.update_label("Events");

        const div = document.createElement("div");

        const heading = document.createElement("div");
        heading.innerText = "(waiting for events)";
        div.style.fontWeight = "bold";

        div.append(heading);

        this.div = div;

        plugin_helper.set_zulip_event_listener((event) => {
            this.handle_zulip_event(event);
        });
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

        this.plugin_helper!.violet();

        this.scroll_to_bottom();
    }

    scroll_to_bottom(): void {
        const div = this.div;

        div.scrollTop = div.scrollHeight - div.clientHeight;
    }
}
