import { get_dom_parser } from "../parser";
import type { Message } from "./db_types";

export function parse_content(message: Message) {
    const parser = get_dom_parser();
    const doc = parser.parseFromString(message.content, "text/html");

    doc.querySelectorAll("a").forEach((a) => {
        if (a.href.startsWith("https://github.com/")) {
            message.github_refs.push(a.href);
        }
    });
    doc.querySelectorAll("div.codehilite").forEach((code_div) => {
        message.code_snippets.push(code_div.textContent);
    });
}
