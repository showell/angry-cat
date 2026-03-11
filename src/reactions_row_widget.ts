import { Reaction } from "./backend/db_types";
import { ReactionItem } from "./row_types";

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

    render_reaction_pill(reaction_row: ReactionItem): HTMLButtonElement {
        const reaction_pill = document.createElement("button");
        const count = reaction_row.reactor_count();
        const emoji = reaction_row.get_emoji();
        reaction_pill.innerText = `${emoji} ${count}`;
        reaction_pill.title = reaction_row.sender_names().join(", ");
        return reaction_pill;
    }
}
