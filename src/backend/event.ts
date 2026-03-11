import type { Message } from "./db_types";

import { DB } from "./database";
import * as fetch from "./fetch";
import * as parse from "./parse";

export const enum EventFlavor {
    MESSAGE,
    MUTATE_MESSAGE_ADDRESS,
    MUTATE_MESSAGE_CONTENT,
    MUTATE_UNREAD,
    UNKNOWN,
    REACTION_ADD_EVENT,
    REACTION_REMOVE_EVENT,
}

type MessageEvent = {
    flavor: EventFlavor.MESSAGE;
    message: Message;
    info: string;
};

type ReactionEvent = {
    flavor: EventFlavor.REACTION_ADD_EVENT | EventFlavor.REACTION_REMOVE_EVENT;
    message_id: number;
    user_id: number;
    emoji_code: string;
    emoji_name: string;
};

type MutateUnreadEvent = {
    flavor: EventFlavor.MUTATE_UNREAD;
    message_ids: number[];
    unread: boolean;
};

type MutateMessageAddressEvent = {
    flavor: EventFlavor.MUTATE_MESSAGE_ADDRESS;
    message_ids: number[];
    new_channel_id: number;
    new_topic_id: number;
};

type MutateMessageContentEvent = {
    flavor: EventFlavor.MUTATE_MESSAGE_CONTENT;
    message_id: number;
    raw_content: string;
    content: string;
};

type UnknownEvent = {
    flavor: EventFlavor.UNKNOWN;
    raw_event: any;
};

export type ZulipEvent =
    | MessageEvent
    | MutateMessageAddressEvent
    | MutateMessageContentEvent
    | MutateUnreadEvent
    | ReactionEvent
    | UnknownEvent;

function build_event(raw_event: any): ZulipEvent | undefined {
    // console.log(JSON.stringify(raw_event, null, 4));
    switch (raw_event.type) {
        case "message": {
            const local_message_id = raw_event.local_message_id;
            const raw_message = raw_event.message;

            if (raw_message.type === "stream") {
                const topic = DB.topic_map.get_or_make_topic_for(
                    raw_message.stream_id,
                    raw_message.subject,
                );

                if (local_message_id) {
                    console.log("local_message_id", local_message_id);
                }

                const unread =
                    raw_event.flags.find((flag: string) => flag === "read") ===
                    undefined;

                const message: Message = {
                    code_snippets: [],
                    content: raw_message.content,
                    github_refs: [],
                    id: raw_message.id,
                    is_super_new: true,
                    local_message_id,
                    reactions: fetch.convert_server_reactions(
                        raw_message.reactions,
                        raw_message.id,
                    ),
                    sender_id: raw_message.sender_id,
                    stream_id: raw_message.stream_id,
                    timestamp: raw_message.timestamp,
                    topic_id: topic.topic_id,
                    type: "stream",
                    unread,
                };
                parse.parse_content(message);

                return {
                    flavor: EventFlavor.MESSAGE,
                    message,
                    info: `stream message id ${message.id}`,
                };
            }

            return undefined;
        }

        case "update_message_flags": {
            if (raw_event.flag === "read") {
                return {
                    flavor: EventFlavor.MUTATE_UNREAD,
                    message_ids: raw_event.messages,
                    unread: raw_event.op === "remove",
                };
            }

            return undefined;
        }

        case "update_message": {
            if (raw_event.message_ids && raw_event.orig_content === undefined) {
                const new_channel_id =
                    raw_event.new_stream_id ?? raw_event.stream_id;
                const new_topic_name =
                    raw_event.subject ?? raw_event.orig_subject;
                const new_topic_id = DB.topic_map.get_topic_id(
                    new_channel_id,
                    new_topic_name,
                );

                return {
                    flavor: EventFlavor.MUTATE_MESSAGE_ADDRESS,
                    message_ids: raw_event.message_ids,
                    new_channel_id,
                    new_topic_id,
                };
            }

            return {
                flavor: EventFlavor.MUTATE_MESSAGE_CONTENT,
                message_id: raw_event.message_id,
                raw_content: raw_event.content,
                content: raw_event.rendered_content,
            };
        }

        case "reaction": {
            if (raw_event.reaction_type !== "unicode_emoji") return undefined;
            const flavor =
                raw_event.op === "add"
                    ? EventFlavor.REACTION_ADD_EVENT
                    : EventFlavor.REACTION_REMOVE_EVENT;
            const event_object: ReactionEvent = {
                flavor,
                message_id: raw_event.message_id,
                user_id: raw_event.user_id,
                emoji_code: raw_event.emoji_code,
                emoji_name: raw_event.emoji_name,
            };
            return event_object;
        }
    }

    return undefined;
}

type EventCallbackType = (event: ZulipEvent) => void;

export class EventHandler {
    callback: EventCallbackType;

    constructor(callback: EventCallbackType) {
        this.callback = callback;
    }

    process_events(raw_events: any): void {
        for (const raw_event of raw_events) {
            if (raw_event.type === "heartbeat") {
                // We may re-visit heartbeats when we want more
                // robustnness for staying connected to the server.
                // Until then, they are just too much noise.
                continue;
            }

            const event = build_event(raw_event) ?? {
                flavor: EventFlavor.UNKNOWN,
                raw_event,
            };

            if (event) {
                this.callback(event);
            }
        }
    }
}
