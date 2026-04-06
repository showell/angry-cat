// Starred-message UI helpers used by message_row_widget and message_popup.
// Keeps all star-related rendering in one place.

import { is_starred } from "./backend/database";
import * as zulip_client from "./backend/zulip_client";
import { Button } from "./button";
import * as colors from "./colors";

// Apply the starred background color to a message div. Returns true
// if the message is starred (so callers know whether unread bg applies).
export function apply_star_style(
    div: HTMLElement,
    message_id: number,
): boolean {
    if (is_starred(message_id)) {
        div.style.backgroundColor = colors.special_green;
        return true;
    }
    return false;
}

// Renders an Unstar button for the reactions row. Returns undefined
// if the message is not starred.
export function render_unstar_button(
    message_id: number,
): Button | undefined {
    if (!is_starred(message_id)) return undefined;
    return new Button("Unstar", 70, () => {
        zulip_client.set_message_starred(message_id, false);
    });
}

// Renders a Star Message button for the message popup. Returns
// undefined if the message is already starred.
export function render_star_button(
    message_id: number,
    on_done: () => void,
): Button | undefined {
    if (is_starred(message_id)) return undefined;
    return new Button("Star Message", 120, () => {
        zulip_client.set_message_starred(message_id, true);
        on_done();
    });
}
