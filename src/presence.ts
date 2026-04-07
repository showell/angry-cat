// Presence tracking — sends periodic "active" heartbeats to the
// server so other users can see who is online. The server infers
// offline status when heartbeats stop arriving.

import * as zulip_client from "./backend/zulip_client";

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

async function send_heartbeat(): Promise<void> {
    try {
        await zulip_client.send_presence("active");
    } catch (e) {
        console.warn("Presence heartbeat failed:", e);
    }
}

export function start(): void {
    send_heartbeat();
    setInterval(send_heartbeat, HEARTBEAT_INTERVAL_MS);
}
