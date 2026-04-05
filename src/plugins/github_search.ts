import type { Message } from "../backend/db_types";
import * as model from "../backend/model";
import { MessageList } from "../message_list";
import type { PluginHelper } from "../plugin_helper";

export function plugin(plugin_helper: PluginHelper) {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "center";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";
    plugin_helper.update_label("GitHub Search");

    const filter = {
        predicate(message: Message) {
            return message.github_refs.length > 0;
        },
    };

    const messages = model.filtered_messages(filter);
    messages.reverse();

    const message_list = new MessageList({
        messages,
        filter,
        max_width: 750,
        topic_id: undefined,
    });

    div.append(message_list.div);

    return { div };
}
