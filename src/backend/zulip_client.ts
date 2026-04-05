import * as config from "../config";
import { DB } from "./database";
import type { Message } from "./db_types";
import type { EventHandler, ZulipEvent } from "./event";
import { EventFlavor } from "./event";

let queue_id: string | undefined;
let last_event_id: string | undefined;
let local_id_seq = 0;

export type MessageCallback = (message: Message) => void;
type LocalIdType = string;

const SENT_MESSAGE_CALLBACKS = new Map<LocalIdType, MessageCallback>();

export function addr(): string {
    return `${DB.current_user_id}-${queue_id}`;
}

export function slash_join(s1: string, s2: string): string {
    return s1.replace(/\/+$/, "") + "/" + s2.replace(/^\/+/, "");
}

function api_url(path: string): URL {
    return new URL(`/api/v1/${path}`, config.get_current_realm_url());
}

function get_headers(): Record<string, string> {
    const auth = btoa(
        `${config.get_email_for_current_realm()}:${config.get_api_key_for_current_realm()}`,
    );
    return { Authorization: `Basic ${auth}` };
}

function form_headers(): Record<string, string> {
    return {
        ...get_headers(),
        "Content-Type": "application/x-www-form-urlencoded",
    };
}

async function api_get(
    path: string,
    params?: Record<string, string>,
): Promise<any> {
    const url = api_url(path);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    const response = await fetch(url, { headers: get_headers() });
    return response.json();
}

function api_form_request(
    method: string,
    path: string,
    params: Record<string, string>,
): void {
    fetch(api_url(path), {
        method,
        headers: form_headers(),
        body: new URLSearchParams(params).toString(),
    });
    // TODO: actually look at response
}

export async function register_queue() {
    const url = api_url("register");
    url.searchParams.set("apply_markdown", "true");
    url.searchParams.set("include_subscribers", "false");
    url.searchParams.set("slim_presence", "true");
    url.searchParams.set("all_public_streams", "false");
    url.searchParams.set("client", "Angry Cat (showell)");

    const response = await fetch(url, {
        method: "POST",
        headers: get_headers(),
    });
    const data = await response.json();
    queue_id = data.queue_id;
    last_event_id = data.last_event_id;
}

export async function start_polling(event_handler: EventHandler) {
    if (queue_id === undefined || last_event_id === undefined) {
        return;
    }

    const url = api_url("events");

    while (queue_id !== undefined && last_event_id !== undefined) {
        url.searchParams.set("queue_id", queue_id);
        url.searchParams.set("last_event_id", last_event_id);

        const response = await fetch(url, { headers: get_headers() });
        const data = await response.json();

        if (data.result !== "success") {
            window.location.reload();
        }
        if (data.events?.length) {
            last_event_id = data.events[data.events.length - 1].id;
            event_handler.process_events(data.events);
        }
    }
}

export type ServerMessage = {
    content: string;
    flags: string[];
    id: number;
    reactions: any[];
    sender_email: string;
    sender_full_name: string;
    sender_id: number;
    stream_id: number;
    subject: string;
    timestamp: number;
    type: "stream";
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

export function send_message(info: SendInfo, callback: MessageCallback): void {
    local_id_seq += 1;
    const local_id = local_id_seq.toString();

    api_form_request("POST", "messages", {
        type: "stream",
        local_id,
        queue_id: queue_id!,
        to: `${info.channel_id}`,
        topic: info.topic_name,
        content: info.content,
        read_by_sender: "true",
    });

    SENT_MESSAGE_CALLBACKS.set(local_id, callback);
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
