import * as config from "../config";
import {
    api_form_request,
    api_get,
    api_url,
    get_headers,
    slash_join,
} from "./api_helpers";
import type { Message } from "./db_types";
import type { ZulipEvent } from "./event";
import { EventFlavor } from "./event";
import { get_queue_id } from "./event_queue";

let local_id_seq = 0;

export type MessageCallback = (message: Message) => void;
type LocalIdType = string;

const SENT_MESSAGE_CALLBACKS = new Map<LocalIdType, MessageCallback>();

export type ServerMessage = {
    content: string;
    flags: string[];
    id: number;
    reactions: unknown[];
    sender_email: string;
    sender_full_name: string;
    sender_id: number;
    stream_id: number;
    subject: string;
    timestamp: number;
    type: "stream" | "private";
};

export async function get_messages(anchor: string, num_before: number) {
    return api_get("messages", {
        narrow: "[]",
        num_before: JSON.stringify(num_before),
        anchor,
    });
}

export async function get_users() {
    const data = await api_get("users");
    return data.members;
}

export async function get_subscriptions() {
    const data = await api_get("users/me/subscriptions");
    return data.subscriptions;
}

export async function upload_file(file: File) {
    const formData = new FormData();
    formData.append("FILE", file);

    const response = await fetch(api_url("user_uploads"), {
        method: "POST",
        headers: get_headers(),
        body: formData,
    });
    const data = await response.json();
    return data.uri;
}

export async function fetch_image(image_url: string): Promise<string> {
    // image_url already contains the /api/v1 prefix
    const url = new URL(`/api/v1${image_url}`, config.get_current_realm_url());
    const response = await fetch(url, { headers: get_headers() });
    const data = await response.json();

    // we get a temporary url that we have access to
    return slash_join(config.get_current_realm_url(), data.url);
}

type SendInfo = {
    channel_id: number;
    topic_name: string;
    content: string;
};

export function mark_message_id_unread(message_id: number): void {
    api_form_request("POST", "messages/flags", {
        op: "remove",
        flag: "read",
        messages: JSON.stringify([message_id]),
    });
}

export function mark_message_ids_unread(unread_message_ids: number[]): void {
    api_form_request("POST", "messages/flags", {
        op: "add",
        flag: "read",
        messages: JSON.stringify(unread_message_ids),
    });
}

export function send_message(
    info: SendInfo,
    callback: MessageCallback,
    on_error?: (msg: string) => void,
): void {
    const queue_id = get_queue_id();

    if (queue_id === undefined) {
        console.log("send_message called before queue initialized");
        return;
    }

    local_id_seq += 1;
    const local_id = local_id_seq.toString();

    SENT_MESSAGE_CALLBACKS.set(local_id, callback);

    api_form_request("POST", "messages", {
        type: "stream",
        local_id,
        queue_id,
        to: `${info.channel_id}`,
        topic: info.topic_name,
        content: info.content,
        read_by_sender: "true",
    }).then((data) => {
        if (data.result !== "success") {
            SENT_MESSAGE_CALLBACKS.delete(local_id);
            on_error?.(data.msg ?? "Unknown error sending message");
        }
    });
}

export function edit_message(
    message_id: number,
    content: string,
    on_success: () => void,
    on_error: (msg: string) => void,
): void {
    api_form_request("PATCH", `messages/${message_id}`, { content }).then(
        (data) => {
            if (data.result === "success") {
                on_success();
            } else {
                on_error(data.msg ?? "Unknown error editing message");
            }
        },
    );
}

export function update_stream_description(
    stream_id: number,
    description: string,
): void {
    api_form_request("PATCH", `streams/${stream_id}`, { description });
}

export function toggle_reaction_on_message(
    message_id: number,
    emoji_name: string,
    emoji_code: string,
    current_user_has_reacted: boolean,
): void {
    api_form_request(
        current_user_has_reacted ? "DELETE" : "POST",
        `messages/${message_id}/reactions`,
        { emoji_name, emoji_code, reaction_type: "unicode_emoji" },
    );
}

export function handle_event(event: ZulipEvent): void {
    if (event.flavor === EventFlavor.MESSAGE) {
        const local_message_id = event.message.local_message_id;

        if (local_message_id) {
            const callback = SENT_MESSAGE_CALLBACKS.get(local_message_id);
            if (callback) {
                callback(event.message);
            }
        }
    }
}
