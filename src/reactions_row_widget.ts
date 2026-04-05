import type { Reaction } from "./backend/db_types";

import { DB } from "./backend/database";
import * as zulip_client from "./backend/zulip_client";

import { ReactionItem } from "./row_types";
import { show_emoji_picker } from "./emoji_picker";

const THUMBS_UP_EMOJI_NAME = "thumbs_up";
const THUMBS_UP_EMOJI = "👍";

export class ReactionsRowWidget {
    div: HTMLDivElement;

    constructor(message_id: number) {
        const reactions: Reaction[] =
            DB.reactions_map.get_reactions_for_message_id(message_id);
        this.div = this.render_reactions_div(reactions, message_id);
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

    render_reactions_div(
        reactions: Reaction[],
        message_id: number,
    ): HTMLDivElement {
        const reactions_div = document.createElement("div");
        reactions_div.style.display = "flex";
        reactions_div.style.flexWrap = "wrap";
        reactions_div.style.gap = "0.5em";
        reactions_div.style.margin = "0.2em";
        for (const reaction of reactions) {
            const reaction_item = new ReactionItem(reaction);
            reactions_div.append(this.render_reaction_pill(reaction_item));
        }
        if (!this.current_user_has_thumbs_up(reactions)) {
            reactions_div.append(this.render_thumbs_up_button(message_id));
        }
        reactions_div.append(this.render_add_reaction_button(message_id));
        return reactions_div;
    }

    render_reaction_pill(reaction_item: ReactionItem): HTMLButtonElement {
        const reaction_pill = document.createElement("button");
        reaction_pill.addEventListener("click", (e) => {
            e.stopPropagation();
            if (reaction_item.current_user_reacted()) {
                reaction_pill.innerText = `${reaction_item.get_emoji()} ${reaction_item.reactor_count() - 1}`;
            } else {
                reaction_pill.innerText = `${reaction_item.get_emoji()} ${reaction_item.reactor_count() + 1}`;
            }
            zulip_client.toggle_reaction_on_message(
                reaction_item.get_message_id(),
                reaction_item.get_emoji_name(),
                reaction_item.current_user_reacted(),
            );
        });
        const count = reaction_item.reactor_count();
        const emoji = reaction_item.get_emoji();
        reaction_pill.innerText = `${emoji} ${count}`;
        reaction_pill.title = reaction_item.sender_names().join(", ");
        if (!reaction_item.current_user_reacted()) {
            reaction_pill.style.opacity = "0.8";
        } else {
            reaction_pill.style.opacity = "1";
        }
        return reaction_pill;
    }

    render_add_reaction_button(message_id: number): HTMLButtonElement {
        const button = document.createElement("button");
        button.innerText = "+";
        button.style.opacity = "0.4";
        button.title = "Add reaction";
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            show_emoji_picker((emoji_name: string) => {
                zulip_client.toggle_reaction_on_message(
                    message_id,
                    emoji_name,
                    false,
                );
            });
        });
        return button;
    }

    render_thumbs_up_button(message_id: number): HTMLButtonElement {
        const button = document.createElement("button");
        button.innerText = THUMBS_UP_EMOJI;
        button.style.opacity = "0.4";
        button.title = "React with thumbs up";
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            button.style.display = "none";
            zulip_client.toggle_reaction_on_message(
                message_id,
                THUMBS_UP_EMOJI_NAME,
                false,
            );
        });
        return button;
    }
}
