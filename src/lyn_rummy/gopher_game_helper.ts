// Game event transport via Angry Gopher's game bus.
//
// Replaces the Zulip-channel hack with proper game endpoints:
//   POST /gopher/games/{id}/events — send an event
//   GET  /gopher/games/{id}/events?after=N — poll for new events
//
// Implements the same WebXDC interface that GameHelper provides,
// so the game code doesn't know which transport it's using.

import { gopher_url, get_headers } from "../backend/api_helpers";
import type * as webxdc from "../backend/webxdc";
import type { EventRow } from "./game";

export class GopherGameHelper {
    game_id: number;
    user_id: number;

    constructor(info: { game_id: number; user_id: number }) {
        this.game_id = info.game_id;
        this.user_id = info.user_id;
    }

    xdc_interface(): webxdc.WebXdc {
        const self = this;

        return {
            selfAddr: String(self.user_id),

            sendUpdate(update: webxdc.Update): void {
                const event_row = update.payload as EventRow;
                self.post_event(event_row);
            },

            setUpdateListener(callback: webxdc.UpdateListener): void {
                self.start_polling(callback);
            },
        };
    }

    // Store the shuffled deck as the first event so both players
    // get the same deal. The payload is { deck: JsonCard[] }.
    async post_deck(json_cards: object[]): Promise<void> {
        const url = gopher_url(`games/${this.game_id}/events`);
        const resp = await fetch(url, {
            method: "POST",
            headers: { ...get_headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ deck: json_cards }),
        });
        if (resp.ok) {
            const data = await resp.json();
            this.last_seen_event_id = data.event_id;
        }
    }

    // Fetch the deck from the first event and track its ID.
    async get_deck(): Promise<object[] | undefined> {
        const url = gopher_url(`games/${this.game_id}/events?after=0`);
        const resp = await fetch(url, { headers: get_headers() });
        if (!resp.ok) return undefined;
        const data = await resp.json();
        const events: GopherEvent[] = data.events || [];
        if (events.length === 0) return undefined;
        this.last_seen_event_id = events[0].id;
        const first = events[0].payload as any;
        return first.deck;
    }

    private async post_event(event_row: EventRow): Promise<void> {
        const url = gopher_url(`games/${this.game_id}/events`);
        const resp = await fetch(url, {
            method: "POST",
            headers: { ...get_headers(), "Content-Type": "application/json" },
            body: JSON.stringify(event_row),
        });
        if (!resp.ok) {
            console.error("Failed to post game event:", resp.status);
        }
    }

    async get_events(): Promise<EventRow[]> {
        return this.get_events_after(0);
    }

    // Fetch events after a given event ID. Used to skip the deck
    // event when replaying game state. Updates last_seen_event_id
    // so polling starts from the right place.
    async get_events_after(after: number): Promise<EventRow[]> {
        const url = gopher_url(`games/${this.game_id}/events?after=${after}`);
        const resp = await fetch(url, { headers: get_headers() });
        if (!resp.ok) return [];

        const data = await resp.json();
        const events: GopherEvent[] = data.events || [];
        if (events.length > 0) {
            this.last_seen_event_id = events[events.length - 1].id;
        }
        return events
            .filter((e) => (e.payload as any).json_game_event)
            .map((e) => e.payload as EventRow);
    }

    // Track the highest event ID we've seen, so polling starts
    // after it. Set by get_deck() or get_events_after().
    last_seen_event_id = 0;

    private start_polling(callback: webxdc.UpdateListener): void {
        let last_event_id = this.last_seen_event_id;
        const game_id = this.game_id;
        const user_id = this.user_id;

        async function poll(): Promise<void> {
            try {
                const url = gopher_url(
                    `games/${game_id}/events?after=${last_event_id}`,
                );
                const resp = await fetch(url, { headers: get_headers() });
                if (!resp.ok) return;

                const data = await resp.json();
                const events: GopherEvent[] = data.events || [];

                for (const event of events) {
                    last_event_id = event.id;

                    // Skip non-game events (e.g. the deck event).
                    const payload = event.payload as any;
                    if (!payload.json_game_event) continue;

                    // Only process events from other players.
                    if (event.user_id !== user_id) {
                        callback({ payload: event.payload });
                    }
                }
            } catch (err) {
                console.error("Game event poll error:", err);
            }
        }

        // Poll every 2 seconds.
        setInterval(poll, 2000);
    }
}

type GopherEvent = {
    id: number;
    user_id: number;
    payload: object;
    created_at: number;
};

// Create a new game on the Gopher server. Returns the game ID.
export async function create_gopher_game(): Promise<number> {
    const url = gopher_url("games");
    const resp = await fetch(url, {
        method: "POST",
        headers: get_headers(),
    });
    const data = await resp.json();
    return data.game_id;
}

// List games the current user is in.
export type GopherGameInfo = {
    id: number;
    player1_id: number;
    player2_id: number | null;
    event_count: number;
};

export async function list_gopher_games(): Promise<GopherGameInfo[]> {
    const url = gopher_url("games");
    const resp = await fetch(url, { headers: get_headers() });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.games || [];
}

// Join an existing game on the Gopher server.
export async function join_gopher_game(game_id: number): Promise<boolean> {
    const url = gopher_url(`games/${game_id}/join`);
    const resp = await fetch(url, {
        method: "POST",
        headers: get_headers(),
    });
    const data = await resp.json();
    return data.result === "success";
}
