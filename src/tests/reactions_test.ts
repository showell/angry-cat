import assert from "node:assert/strict";
import { ReactionsMap } from "../backend/reactions";

// Empty reactions map
{
    const rm = new ReactionsMap();
    assert.equal(rm.get_reactions_for_message_id(1).length, 0);
}

// add_server_reactions groups by emoji
{
    const rm = new ReactionsMap();
    rm.add_server_reactions(
        [
            { emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 1, reaction_type: "unicode_emoji" },
            { emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 2, reaction_type: "unicode_emoji" },
            { emoji_name: "heart", emoji_code: "2764", user_id: 1, reaction_type: "unicode_emoji" },
        ],
        100,
    );

    const reactions = rm.get_reactions_for_message_id(100);
    assert.equal(reactions.length, 2);

    const thumbs = reactions.find((r) => r.emoji_name === "thumbs_up")!;
    assert.equal(thumbs.user_ids.size, 2);
    assert(thumbs.user_ids.has(1));
    assert(thumbs.user_ids.has(2));

    const heart = reactions.find((r) => r.emoji_name === "heart")!;
    assert.equal(heart.user_ids.size, 1);
}

// Filters to unicode_emoji only
{
    const rm = new ReactionsMap();
    rm.add_server_reactions(
        [
            { emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 1, reaction_type: "unicode_emoji" },
            { emoji_name: "zulip", emoji_code: "zulip", user_id: 1, reaction_type: "realm_emoji" },
        ],
        100,
    );

    const reactions = rm.get_reactions_for_message_id(100);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].emoji_name, "thumbs_up");
}

// process_add_event adds to existing reaction
{
    const rm = new ReactionsMap();
    rm.add_server_reactions(
        [{ emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 1, reaction_type: "unicode_emoji" }],
        100,
    );

    rm.process_add_event({
        flavor: 0 as any, // not checked by ReactionsMap
        message_id: 100,
        user_id: 2,
        emoji_code: "1f44d",
        emoji_name: "thumbs_up",
    });

    const reactions = rm.get_reactions_for_message_id(100);
    assert.equal(reactions[0].user_ids.size, 2);
}

// process_add_event creates new reaction
{
    const rm = new ReactionsMap();
    rm.process_add_event({
        flavor: 0 as any,
        message_id: 100,
        user_id: 1,
        emoji_code: "1f44d",
        emoji_name: "thumbs_up",
    });

    const reactions = rm.get_reactions_for_message_id(100);
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].emoji_name, "thumbs_up");
}

// process_remove_event removes user from reaction
{
    const rm = new ReactionsMap();
    rm.add_server_reactions(
        [
            { emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 1, reaction_type: "unicode_emoji" },
            { emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 2, reaction_type: "unicode_emoji" },
        ],
        100,
    );

    rm.process_remove_event({
        flavor: 0 as any,
        message_id: 100,
        user_id: 1,
        emoji_code: "1f44d",
        emoji_name: "thumbs_up",
    });

    const reactions = rm.get_reactions_for_message_id(100);
    assert.equal(reactions[0].user_ids.size, 1);
    assert(reactions[0].user_ids.has(2));
}

// process_remove_event removes reaction entirely when last user removed
{
    const rm = new ReactionsMap();
    rm.add_server_reactions(
        [{ emoji_name: "thumbs_up", emoji_code: "1f44d", user_id: 1, reaction_type: "unicode_emoji" }],
        100,
    );

    rm.process_remove_event({
        flavor: 0 as any,
        message_id: 100,
        user_id: 1,
        emoji_code: "1f44d",
        emoji_name: "thumbs_up",
    });

    assert.equal(rm.get_reactions_for_message_id(100).length, 0);
}

console.log("  reactions_test: OK");
