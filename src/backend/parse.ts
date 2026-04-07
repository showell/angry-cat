import { get_dom_parser } from "../parser";
import type { Message } from "./db_types";

export type ParseSets = {
    image_message_ids: Set<number>;
    code_message_ids: Set<number>;
    mention_message_ids: Set<number>;
    current_user_id: number;
};

export function parse_content(message: Message, sets: ParseSets): void {
    if (typeof window === "undefined") {
        return;
    }

    const parser = get_dom_parser();
    const doc = parser.parseFromString(message.content, "text/html");

    if (doc.querySelector("div.codehilite")) {
        sets.code_message_ids.add(message.id);
    }
    if (doc.querySelector("img")) {
        sets.image_message_ids.add(message.id);
    }

    // Check if any user-mention span references the current user.
    const mentions = doc.querySelectorAll("span.user-mention");
    for (const span of mentions) {
        const uid = span.getAttribute("data-user-id");
        if (uid && parseInt(uid) === sets.current_user_id) {
            sets.mention_message_ids.add(message.id);
            break;
        }
    }
}
