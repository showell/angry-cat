import type { EventHandler } from "./event";

import * as config from "../config";

function get_headers() {
    const auth = btoa(
        `${config.get_email_for_current_realm()}:${config.get_api_key_for_current_realm()}`,
    );
    const auth_header = `Basic ${auth}`;
    return { Authorization: auth_header };
}

let queue_id: string | undefined;
let last_event_id: string | undefined;

export async function register_queue() {
    const url = new URL("/api/v1/register", config.get_current_realm_url());
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

    const url = new URL("/api/v1/events", config.get_current_realm_url());

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

export async function get_messages(num_before: number) {
    const url = new URL(`/api/v1/messages`, config.get_current_realm_url());
    url.searchParams.set("narrow", `[]`);
    url.searchParams.set("num_before", JSON.stringify(num_before));
    url.searchParams.set("anchor", "newest");
    const response = await fetch(url, { headers: get_headers() });
    const data = await response.json();
    return data.messages;
}

export async function get_users() {
    const url = new URL(`/api/v1/users`, config.get_current_realm_url());
    const response = await fetch(url, { headers: get_headers() });
    const data = await response.json();
    return data.members;
}

export async function get_subscriptions() {
    const url = new URL(
        `/api/v1/users/me/subscriptions`,
        config.get_current_realm_url(),
    );
    const response = await fetch(url, { headers: get_headers() });
    const data = await response.json();
    return data.subscriptions;
}

export async function upload_file(file: File) {
    const url = new URL("/api/v1/user_uploads", config.get_current_realm_url());
    const formData = new FormData();

    formData.append("FILE", file);

    const headers = get_headers();

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
    });
    const data = await response.json();
    return data.uri;
}

export async function fetch_image(image_url: string): Promise<string> {
    const url = new URL(`/api/v1${image_url}`, config.get_current_realm_url());

    const response = await fetch(url, {
        method: "GET",
        headers: get_headers(),
    });
    const data = await response.json();

    // we get a temporary url that we have access to
    return config.get_current_realm_url() + data.url;
}

type SendInfo = {
    stream_id: number;
    topic_name: string;
    content: string;
};

export function mark_message_ids_unread(unread_message_ids: number[]): void {
    const body = new URLSearchParams({
        op: "add",
        flag: "read",
        messages: JSON.stringify(unread_message_ids),
    });

    const email = config.get_email_for_current_realm();
    const api_key = config.get_api_key_for_current_realm();

    const credentials = btoa(`${email}:${api_key}`);
    const api_url = `${config.get_current_realm_url()}/api/v1/messages/flags`;

    fetch(api_url, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });
    // TODO: actually look at response
}

let local_id_seq = 0;

export function send_message(info: SendInfo): string {
    local_id_seq += 1;
    const local_id = local_id_seq.toString();

    const body = new URLSearchParams({
        type: "stream",
        local_id,
        queue_id: queue_id!,
        to: `${info.stream_id}`,
        topic: info.topic_name,
        content: info.content,
        read_by_sender: "true",
    });

    const email = config.get_email_for_current_realm();
    const api_key = config.get_api_key_for_current_realm();

    const credentials = btoa(`${email}:${api_key}`);
    const api_url = `${config.get_current_realm_url()}/api/v1/messages`;

    fetch(api_url, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });
    // TODO: actually look at response

    return local_id;
}
