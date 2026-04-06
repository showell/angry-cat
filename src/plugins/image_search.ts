import type { Message } from "../backend/db_types";
import * as model from "../backend/model";
import { MessageList } from "../message_list";
import type { Plugin, PluginContext } from "../plugin_helper";

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "center";
    div.style.height = "100%";
    div.style.overflow = "auto";

    context.update_label("Image Search");

    const filter = {
        predicate(message: Message) {
            return message.has_images;
        },
    };

    const messages = model.recent_filtered_messages(filter, 100);

    const message_list = new MessageList({
        messages,
        filter,
        max_width: 750,
        topic_id: undefined,
    });

    div.append(message_list.div);

    return { div };
}
