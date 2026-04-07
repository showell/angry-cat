import * as dm_model from "../dm/model";
import { DB } from "./database";
import type { Message } from "./db_types";
import * as parse from "./parse";

export enum EventFlavor {
    MESSAGE,
    MUTATE_MESSAGE_ADDRESS,
    MUTATE_MESSAGE_CONTENT,
    MUTATE_UNREAD,
    MUTATE_STARRED,
    MUTATE_STREAM,
    SUBSCRIPTION_ADD,
    UNKNOWN,
    REACTION_ADD_EVENT,
    REACTION_REMOVE_EVENT,
    PRESENCE,
}

type MessageEvent = {
    flavor: EventFlavor.MESSAGE;
    message: Message;
    info: string;
};

export type ReactionEvent = {
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

type MutateStarredEvent = {
    flavor: EventFlavor.MUTATE_STARRED;
    message_ids: number[];
    starred: boolean;
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

type MutateStreamEvent = {
    flavor: EventFlavor.MUTATE_STREAM;
    stream_id: number;
    description: string | undefined;
    rendered_description: string;
};

export type SubscriptionInfo = {
    stream_id: number;
    name: string;
    description: string;
    rendered_description: string;
    stream_weekly_traffic: number;
};

type SubscriptionAddEvent = {
    flavor: EventFlavor.SUBSCRIPTION_ADD;
    stream_names: string[];
    subscriptions: SubscriptionInfo[];
};

export type PresenceEvent = {
    flavor: EventFlavor.PRESENCE;
    user_id: number;
    status: string; // "active" or "offline"
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
    | MutateStarredEvent
    | MutateStreamEvent
    | SubscriptionAddEvent
    | ReactionEvent
    | PresenceEvent
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

                if (unread) {
                    DB.unread_ids.add(raw_message.id);
                }
                if (raw_event.flags.includes("starred")) {
                    DB.starred_ids.add(raw_message.id);
                }

                const message: Message = {
                    content: raw_message.content,
                    id: raw_message.id,
                    local_message_id,
                    sender_id: raw_message.sender_id,
                    stream_id: raw_message.stream_id,
                    timestamp: raw_message.timestamp,
                    topic_id: topic.topic_id,
                    type: "stream",
                };
                parse.parse_content(message, DB);

                return {
                    flavor: EventFlavor.MESSAGE,
                    message,
                    info: `stream message id ${message.id}`,
                };
            }

            if (raw_message.type === "private") {
                const unread =
                    raw_event.flags.find(
                        (flag: string) => flag === "read",
                    ) === undefined;
                const recipient_ids: number[] = Array.isArray(
                    raw_message.display_recipient,
                )
                    ? raw_message.display_recipient.map(
                          (r: { id: number }) => r.id,
                      )
                    : [];
                dm_model.add_message({
                    id: raw_message.id,
                    sender_id: raw_message.sender_id,
                    recipient_ids,
                    content: raw_message.content,
                    timestamp: raw_message.timestamp,
                    unread,
                });
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
            if (raw_event.flag === "starred") {
                return {
                    flavor: EventFlavor.MUTATE_STARRED,
                    message_ids: raw_event.messages,
                    starred: raw_event.op === "add",
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

        case "stream": {
            if (raw_event.op !== "update") return undefined;
            if (raw_event.property === "description") {
                return {
                    flavor: EventFlavor.MUTATE_STREAM,
                    stream_id: raw_event.stream_id,
                    description: raw_event.value,
                    rendered_description: raw_event.rendered_description,
                };
            }
            if (raw_event.property === "rendered_description") {
                return {
                    flavor: EventFlavor.MUTATE_STREAM,
                    stream_id: raw_event.stream_id,
                    description: undefined,
                    rendered_description: raw_event.value,
                };
            }
            return undefined;
        }

        case "subscription": {
            if (raw_event.op === "add") {
                const subscriptions: SubscriptionInfo[] =
                    raw_event.subscriptions.map((s: any) => ({
                        stream_id: s.stream_id,
                        name: s.name,
                        description: s.description ?? "",
                        rendered_description: s.rendered_description ?? "",
                        stream_weekly_traffic: s.stream_weekly_traffic ?? 0,
                    }));
                const stream_names = subscriptions.map((s) => s.name);
                return {
                    flavor: EventFlavor.SUBSCRIPTION_ADD,
                    stream_names,
                    subscriptions,
                };
            }
            return undefined;
        }

        case "presence": {
            return {
                flavor: EventFlavor.PRESENCE,
                user_id: raw_event.user_id,
                status: raw_event.status,
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
