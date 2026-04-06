import { DB } from "./backend/database";
import type { Reaction } from "./backend/db_types";
import { EventFlavor } from "./backend/event";
import * as zulip_client from "./backend/zulip_client";
import { show_emoji_picker } from "./emoji_picker";
import { ReactionItem } from "./reaction_item";

const THUMBS_UP_EMOJI_NAME = "thumbs_up";
const THUMBS_UP_EMOJI_CODE = "1f44d";
const THUMBS_UP_EMOJI = "👍";

const REACTION_FONT_SIZE = "18px";

function style_reaction_button(button: HTMLButtonElement): void {
    button.style.fontSize = REACTION_FONT_SIZE;
    button.style.padding = "2px 6px";
    button.style.borderRadius = "4px";
}

function render_reaction_pill(reaction_item: ReactionItem): HTMLButtonElement {
    const button = document.createElement("button");
    const count = reaction_item.reactor_count();
    const emoji = reaction_item.get_emoji();
    button.innerText = `${emoji} ${count}`;
    button.title = reaction_item.sender_names().join(", ");
    button.style.opacity = reaction_item.current_user_reacted() ? "1" : "0.8";
    style_reaction_button(button);
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (reaction_item.current_user_reacted()) {
            button.innerText = `${emoji} ${count - 1}`;
        } else {
            button.innerText = `${emoji} ${count + 1}`;
        }
        zulip_client.toggle_reaction_on_message(
            reaction_item.get_message_id(),
            reaction_item.get_emoji_name(),
            reaction_item.get_emoji_code(),
            reaction_item.current_user_reacted(),
        );
    });
    return button;
}

function render_thumbs_up_button(
    message_id: number,
    on_add: () => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerText = THUMBS_UP_EMOJI;
    button.style.opacity = "0.8";
    button.title = "React with thumbs up";
    style_reaction_button(button);
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        DB.reactions_map.process_add_event({
            flavor: EventFlavor.REACTION_ADD_EVENT,
            message_id,
            user_id: DB.current_user_id,
            emoji_name: THUMBS_UP_EMOJI_NAME,
            emoji_code: THUMBS_UP_EMOJI_CODE,
        });
        zulip_client.toggle_reaction_on_message(
            message_id,
            THUMBS_UP_EMOJI_NAME,
            THUMBS_UP_EMOJI_CODE,
            false,
        );
        on_add();
    });
    return button;
}

function render_add_reaction_button(
    message_id: number,
    on_add: () => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerText = "+";
    button.style.opacity = "0.8";
    button.title = "Add reaction";
    style_reaction_button(button);
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        show_emoji_picker(({ name, code }) => {
            DB.reactions_map.process_add_event({
                flavor: EventFlavor.REACTION_ADD_EVENT,
                message_id,
                user_id: DB.current_user_id,
                emoji_name: name,
                emoji_code: code,
            });
            zulip_client.toggle_reaction_on_message(message_id, name, code, false);
            on_add();
        });
    });
    return button;
}

export class ReactionsRowWidget {
    div: HTMLDivElement;
    message_id: number;

    constructor(message_id: number) {
        this.message_id = message_id;
        this.div = document.createElement("div");
        this.div.style.display = "flex";
        this.div.style.flexWrap = "wrap";
        this.div.style.gap = "0.5em";
        this.div.style.margin = "0.2em";
        this.render();
    }

    render(): void {
        const reactions: Reaction[] =
            DB.reactions_map.get_reactions_for_message_id(this.message_id);

        this.div.innerHTML = "";

        for (const reaction of reactions) {
            const reaction_item = new ReactionItem(reaction);
            this.div.append(render_reaction_pill(reaction_item));
        }

        if (!this.current_user_has_thumbs_up(reactions)) {
            this.div.append(
                render_thumbs_up_button(this.message_id, () => this.render()),
            );
        }

        this.div.append(
            render_add_reaction_button(this.message_id, () => this.render()),
        );
    }

    current_user_has_thumbs_up(reactions: Reaction[]): boolean {
        const thumbs_up = reactions.find(
            (r) => r.emoji_name === THUMBS_UP_EMOJI_NAME,
        );
        return (
            thumbs_up !== undefined &&
            thumbs_up.user_ids.has(DB.current_user_id)
        );
    }
}
