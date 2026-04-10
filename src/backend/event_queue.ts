import { api_url, get_headers, with_retry } from "./api_helpers";
import { DB } from "./database";
import type { EventHandler } from "./event";

let queue_id: string | undefined;
let last_event_id: number | undefined;

export function get_queue_id(): string | undefined {
    return queue_id;
}

export function addr(): string {
    return `${DB.current_user_id}-${queue_id}`;
}

export function assert_event_id(value: unknown): number {
    if (!Number.isInteger(value)) {
        throw new Error(
            `Expected integer event id, got: ${JSON.stringify(value)}`,
        );
    }
    return value as number;
}

// Given a batch of events, return the last_event_id to use for the
// next poll. Heartbeat events are excluded because some servers
// fabricate their IDs in a way that collides with real event IDs.
// If all events are heartbeats, the fallback (current last_event_id)
// is returned unchanged.
export function last_real_event_id(
    events: { type: string; id: number }[],
    fallback: number,
): number {
    const real = events.filter((e) => e.type !== "heartbeat");
    if (real.length > 0) {
        return assert_event_id(real[real.length - 1].id);
    }
    return fallback;
}

export async function register_queue(): Promise<void> {
    const url = api_url("register");
    url.searchParams.set("apply_markdown", "true");
    url.searchParams.set("include_subscribers", "false");
    url.searchParams.set("slim_presence", "true");
    url.searchParams.set("all_public_streams", "false");
    url.searchParams.set("client", "Angry Cat (showell)");

    const response = await with_retry(() =>
        fetch(url, {
            method: "POST",
            headers: get_headers(),
        }),
    );
    const data = await response.json();
    queue_id = data.queue_id;
    last_event_id = assert_event_id(data.last_event_id);
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function start_polling(
    event_handler: EventHandler,
): Promise<void> {
    const url = api_url("events");

    while (queue_id !== undefined) {
        url.searchParams.set("queue_id", queue_id);
        url.searchParams.set("last_event_id", last_event_id!.toString());

        let data;
        try {
            const response = await fetch(url, { headers: get_headers() });
            data = await response.json();
        } catch (e) {
            console.warn("Polling network error, retrying in 5s...", e);
            await sleep(5000);
            continue;
        }

        if (data.result !== "success") {
            console.warn("Queue error, re-registering...", data.msg);
            await register_queue();
            // TODO: After re-registering, the in-memory model may be stale
            // due to missed events during the gap. We should trigger a full
            // data refresh here (e.g. re-fetch messages, re-sync unread state)
            // before resuming normal polling.
            continue;
        }

        if (data.events?.length) {
            last_event_id = last_real_event_id(
                data.events,
                last_event_id!,
            );
            event_handler.process_events(data.events);
        }
    }
}
