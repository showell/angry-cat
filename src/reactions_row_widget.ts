import type { Reaction } from "./backend/db_types";
import { EventFlavor } from "./backend/event";

import { DB } from "./backend/database";
import * as zulip_client from "./backend/zulip_client";

import { ReactionItem } from "./row_types";
import { show_emoji_picker } from "./emoji_picker";

const THUMBS_UP_EMOJI_NAME = "thumbs_up";
const THUMBS_UP_EMOJI_CODE = "1f44d";
const THUMBS_UP_EMOJI = "👍";

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
            this.div.append(this.render_reaction_pill(reaction_item));
        }

        if (!this.current_user_has_thumbs_up(reactions)) {
            this.div.append(this.render_thumbs_up_button());
        }

        this.div.append(this.render_add_reaction_button());
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
                reaction_item.get_emoji_code(),
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

    render_thumbs_up_button(): HTMLButtonElement {
        const button = document.createElement("button");
        button.innerText = THUMBS_UP_EMOJI;
        button.style.opacity = "0.4";
        button.title = "React with thumbs up";
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            DB.reactions_map.process_add_event({
                flavor: EventFlavor.REACTION_ADD_EVENT,
                message_id: this.message_id,
                user_id: DB.current_user_id,
                emoji_name: THUMBS_UP_EMOJI_NAME,
                emoji_code: THUMBS_UP_EMOJI_CODE,
            });
            zulip_client.toggle_reaction_on_message(
                this.message_id,
                THUMBS_UP_EMOJI_NAME,
                THUMBS_UP_EMOJI_CODE,
                false,
            );
            this.render();
        });
        return button;
    }

    render_add_reaction_button(): HTMLButtonElement {
        const button = document.createElement("button");
        button.innerText = "+";
        button.style.opacity = "0.4";
        button.title = "Add reaction";
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            show_emoji_picker(({ name, code }) => {
                DB.reactions_map.process_add_event({
                    flavor: EventFlavor.REACTION_ADD_EVENT,
                    message_id: this.message_id,
                    user_id: DB.current_user_id,
                    emoji_name: name,
                    emoji_code: code,
                });
                zulip_client.toggle_reaction_on_message(
                    this.message_id,
                    name,
                    code,
                    false,
                );
                this.render();
            });
        });
        return button;
    }
}
