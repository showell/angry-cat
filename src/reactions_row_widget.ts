import { Reaction } from "./backend/db_types";
import { ReactionItem } from "./row_types";
import * as zulip_client from "./backend/zulip_client";

export class ReactionsRowWidget {
    div: HTMLDivElement;
    constructor(reactions: Reaction[]) {
        this.div = this.render_reactions_div(reactions);
    }

    render_reactions_div(reactions: Reaction[]): HTMLDivElement {
        const reactions_div = document.createElement("div");
        reactions_div.style.display = "flex";
        reactions_div.style.flexWrap = "wrap";
        reactions_div.style.gap = "0.5em";
        reactions_div.style.margin = "0.2em";
        for (const reaction of reactions) {
            const reaction_item = new ReactionItem(reaction);
            reactions_div.append(this.render_reaction_pill(reaction_item));
        }
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
}
