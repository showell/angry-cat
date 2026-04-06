import { DB } from "./database";
import type { Reaction } from "./db_types";

export class ReactionItem {
    _reaction: Reaction;
    constructor(reaction: Reaction) {
        this._reaction = reaction;
    }

    sender_names(): string[] {
        return [...this._reaction.user_ids].map(
            (id) => DB.user_map.get(id)!.full_name,
        );
    }

    get_emoji_name() {
        return this._reaction.emoji_name;
    }

    get_emoji_code() {
        return this._reaction.emoji_code;
    }

    get_message_id() {
        return this._reaction.message_id;
    }

    get_emoji() {
        return String.fromCodePoint(parseInt(this._reaction.emoji_code, 16));
    }

    reactor_count() {
        return this._reaction.user_ids.size;
    }

    current_user_reacted(): boolean {
        return this._reaction.user_ids.has(DB.current_user_id);
    }
}
