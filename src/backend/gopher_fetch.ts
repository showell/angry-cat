// Gopher-specific message fetching.
//
// Instead of Zulip's batched message endpoint, we use:
//   1. GET /api/v1/search — lightweight ID tuples
//   2. POST /api/v1/hydrate — full content (markdown + HTML)
//
// This is faster because search only touches indexes, and
// hydration does targeted PK lookups.

import { api_get, api_form_request, api_url, get_headers } from "./api_helpers";
import type { Database } from "./database";
import type { Message } from "./db_types";
import * as parse from "./parse";

type SearchResult = {
    id: number;
    content_id: number;
    channel_id: number;
    topic_id: number;
    sender_id: number;
    timestamp: number;
};

type HydratedMessage = {
    id: number;
    content_id: number;
    markdown: string;
    html: string;
    sender_id: number;
    channel_id: number;
    topic_id: number;
    timestamp: number;
};

const INITIAL_BATCH_SIZE = 5000;
const BACKFILL_BATCH_SIZE = 10000;
const MAX_SIZE = 200_000;

type State = {
    done: boolean;
    oldest_id: number;
};

let STATE: State;

export async function fetch_initial_messages(db: Database): Promise<void> {
    const results = await search_messages({}, INITIAL_BATCH_SIZE);

    if (results.length === 0) {
        STATE = { done: true, oldest_id: 0 };
        return;
    }

    STATE = {
        done: results.length < INITIAL_BATCH_SIZE,
        oldest_id: results[results.length - 1].id,
    };

    await hydrate_and_store(db, results);
}

export async function backfill(
    db: Database,
    on_progress?: (count: number) => void,
): Promise<void> {
    while (!STATE.done) {
        const remaining = MAX_SIZE - db.message_map.size;
        if (remaining <= 0) break;

        const batch_size = Math.min(remaining, BACKFILL_BATCH_SIZE);
        const results = await search_messages(
            { before: STATE.oldest_id },
            batch_size,
        );

        if (results.length === 0) {
            STATE.done = true;
            break;
        }

        STATE = {
            done: results.length < batch_size,
            oldest_id: results[results.length - 1].id,
        };

        await hydrate_and_store(db, results);
        on_progress?.(db.message_map.size);

        // Brief pause between batches.
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

// --- Internals ---

async function search_messages(
    filters: { before?: number },
    limit: number,
): Promise<SearchResult[]> {
    const params: Record<string, string> = { limit: String(limit) };
    if (filters.before !== undefined) {
        params.before = String(filters.before);
    }
    const data = await api_get("search", params);
    return (data.messages as SearchResult[]) ?? [];
}

async function hydrate_messages(
    ids: number[],
): Promise<HydratedMessage[]> {
    if (ids.length === 0) return [];

    const url = api_url("hydrate");
    const response = await fetch(url, {
        method: "POST",
        headers: {
            ...get_headers(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            message_ids: JSON.stringify(ids),
        }),
    });
    const data = await response.json();
    return (data.messages as HydratedMessage[]) ?? [];
}

async function hydrate_and_store(
    db: Database,
    results: SearchResult[],
): Promise<void> {
    // Index the lightweight results first (topics, sender mapping).
    for (const r of results) {
        // We know channel_id and topic_id but not the topic name yet.
        // The topic_map will be populated when we process hydrated messages.
    }

    // Hydrate content in batches of 5000.
    const HYDRATE_BATCH = 5000;
    for (let i = 0; i < results.length; i += HYDRATE_BATCH) {
        const batch = results.slice(i, i + HYDRATE_BATCH);
        const ids = batch.map((r) => r.id);
        const hydrated = await hydrate_messages(ids);

        // Build a lookup for the search results (for topic_id etc).
        const searchLookup = new Map<number, SearchResult>();
        for (const r of batch) {
            searchLookup.set(r.id, r);
        }

        for (const h of hydrated) {
            const sr = searchLookup.get(h.id);
            if (!sr) continue;

            // We need the topic name for the topic_map. The search
            // result gives us topic_id but not the name. We'll use
            // the topic_id directly since Gopher's topic_map can
            // work with IDs.
            const topic = db.topic_map.ensure_topic_by_id(
                sr.channel_id,
                sr.topic_id,
            );

            const message: Message = {
                content: h.html,
                id: h.id,
                local_message_id: undefined,
                sender_id: h.sender_id,
                stream_id: sr.channel_id,
                timestamp: h.timestamp,
                topic_id: topic.topic_id,
                type: "stream",
            };

            parse.parse_content(message, db);
            db.message_index.add_message(message);
            db.message_map.set(message.id, message);
        }
    }
}
