// Presence tracking — sends periodic heartbeats to the server so
// other users can see who is online.
//
// Reports "active" when the user has interacted recently (key press,
// mouse move, click), and "idle" after a period of inactivity.
// Sends an update every 60 seconds while the tab is visible.

import * as zulip_client from "./backend/zulip_client";

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

let last_activity = Date.now();

function record_activity(): void {
    last_activity = Date.now();
}

function current_status(): "active" | "idle" {
    return Date.now() - last_activity < IDLE_THRESHOLD_MS ? "active" : "idle";
}

function send_heartbeat(): void {
    if (document.hidden) return;
    zulip_client.send_presence(current_status());
}

export function start(): void {
    // Track user activity.
    document.addEventListener("keydown", record_activity);
    document.addEventListener("mousemove", record_activity);
    document.addEventListener("click", record_activity);

    // Send an initial presence and then heartbeat every minute.
    send_heartbeat();
    setInterval(send_heartbeat, HEARTBEAT_INTERVAL_MS);
}
