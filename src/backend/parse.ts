import { get_dom_parser } from "../parser";
import type { Message } from "./db_types";

type ParseSets = {
    image_message_ids: Set<number>;
    code_message_ids: Set<number>;
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
}
