import { pop } from "./popup";

type EmojiInfo = {
    emoji: string;
    name: string;
    code: string;
};

// 100 emojis, 10 rows × 10 columns, grouped by theme
const EMOJIS: EmojiInfo[] = [
    // Row 1: Top reactions + Zulip culture (octopus!)
    { emoji: "👍", name: "thumbs_up", code: "1f44d" },
    { emoji: "❤️", name: "heart", code: "2764" },
    { emoji: "😂", name: "joy", code: "1f602" },
    { emoji: "🎉", name: "tada", code: "1f389" },
    { emoji: "🙏", name: "pray", code: "1f64f" },
    { emoji: "👏", name: "clap", code: "1f44f" },
    { emoji: "🔥", name: "fire", code: "1f525" },
    { emoji: "✨", name: "sparkles", code: "2728" },
    { emoji: "🐙", name: "octopus", code: "1f419" },
    { emoji: "💯", name: "100", code: "1f4af" },

    // Row 2: Happy/positive faces
    { emoji: "😊", name: "blush", code: "1f60a" },
    { emoji: "😄", name: "smile", code: "1f604" },
    { emoji: "😁", name: "grin", code: "1f601" },
    { emoji: "🤣", name: "rofl", code: "1f923" },
    { emoji: "😍", name: "heart_eyes", code: "1f60d" },
    { emoji: "🥰", name: "smiling_face_with_3_hearts", code: "1f970" },
    { emoji: "😎", name: "sunglasses", code: "1f60e" },
    { emoji: "🤩", name: "star_struck", code: "1f929" },
    { emoji: "😃", name: "smiley", code: "1f603" },
    { emoji: "😀", name: "grinning", code: "1f600" },

    // Row 3: Celebration and awards
    { emoji: "🏆", name: "trophy", code: "1f3c6" },
    { emoji: "🥇", name: "first_place_medal", code: "1f947" },
    { emoji: "🥈", name: "second_place_medal", code: "1f948" },
    { emoji: "🥉", name: "third_place_medal", code: "1f949" },
    { emoji: "🌟", name: "star2", code: "1f31f" },
    { emoji: "⭐", name: "star", code: "2b50" },
    { emoji: "💫", name: "dizzy", code: "1f4ab" },
    { emoji: "🎯", name: "dart", code: "1f3af" },
    { emoji: "🎊", name: "confetti_ball", code: "1f38a" },
    { emoji: "👑", name: "crown", code: "1f451" },

    // Row 4: Hearts
    { emoji: "🧡", name: "orange_heart", code: "1f9e1" },
    { emoji: "💛", name: "yellow_heart", code: "1f49b" },
    { emoji: "💚", name: "green_heart", code: "1f49a" },
    { emoji: "💙", name: "blue_heart", code: "1f499" },
    { emoji: "💜", name: "purple_heart", code: "1f49c" },
    { emoji: "💕", name: "two_hearts", code: "1f495" },
    { emoji: "💗", name: "heartpulse", code: "1f497" },
    { emoji: "💖", name: "sparkling_heart", code: "1f496" },
    { emoji: "💓", name: "heartbeat", code: "1f493" },
    { emoji: "💝", name: "gift_heart", code: "1f49d" },

    // Row 5: Nature and animals
    { emoji: "🌈", name: "rainbow", code: "1f308" },
    { emoji: "🌸", name: "cherry_blossom", code: "1f338" },
    { emoji: "🌺", name: "hibiscus", code: "1f33a" },
    { emoji: "🌻", name: "sunflower", code: "1f33b" },
    { emoji: "🦋", name: "butterfly", code: "1f98b" },
    { emoji: "🐝", name: "bee", code: "1f41d" },
    { emoji: "🍀", name: "four_leaf_clover", code: "1f340" },
    { emoji: "🌿", name: "herb", code: "1f33f" },
    { emoji: "🌊", name: "ocean", code: "1f30a" },
    { emoji: "⚡", name: "zap", code: "26a1" },

    // Row 6: Food, drink, and party
    { emoji: "🎂", name: "birthday", code: "1f382" },
    { emoji: "🍰", name: "cake", code: "1f370" },
    { emoji: "🧁", name: "cupcake", code: "1f9c1" },
    { emoji: "🍾", name: "champagne", code: "1f37e" },
    { emoji: "🥂", name: "clinking_glasses", code: "1f942" },
    { emoji: "🎁", name: "gift", code: "1f381" },
    { emoji: "🎈", name: "balloon", code: "1f388" },
    { emoji: "🎀", name: "ribbon", code: "1f380" },
    { emoji: "🍕", name: "pizza", code: "1f355" },
    { emoji: "🎆", name: "fireworks", code: "1f386" },

    // Row 7: Gestures and hands
    { emoji: "🤝", name: "handshake", code: "1f91d" },
    { emoji: "✌️", name: "v", code: "270c" },
    { emoji: "🤞", name: "crossed_fingers", code: "1f91e" },
    { emoji: "🤙", name: "call_me_hand", code: "1f919" },
    { emoji: "👋", name: "wave", code: "1f44b" },
    { emoji: "🤲", name: "palms_up_together", code: "1f932" },
    { emoji: "🫶", name: "heart_hands", code: "1faf6" },
    { emoji: "🫡", name: "saluting_face", code: "1fae1" },
    { emoji: "💪", name: "muscle", code: "1f4aa" },
    { emoji: "🙌", name: "raised_hands", code: "1f64c" },

    // Row 8: Work, tech, and ideas
    { emoji: "💡", name: "bulb", code: "1f4a1" },
    { emoji: "🔑", name: "key", code: "1f511" },
    { emoji: "💻", name: "computer", code: "1f4bb" },
    { emoji: "📱", name: "iphone", code: "1f4f1" },
    { emoji: "✅", name: "white_check_mark", code: "2705" },
    { emoji: "💬", name: "speech_balloon", code: "1f4ac" },
    { emoji: "📣", name: "mega", code: "1f4e3" },
    { emoji: "🛠️", name: "hammer_and_wrench", code: "1f6e0" },
    { emoji: "🚀", name: "rocket", code: "1f680" },
    { emoji: "💎", name: "gem", code: "1f48e" },

    // Row 9: More expressions
    { emoji: "😇", name: "innocent", code: "1f607" },
    { emoji: "🤗", name: "hugs", code: "1f917" },
    { emoji: "🥳", name: "partying_face", code: "1f973" },
    { emoji: "😌", name: "relieved", code: "1f60c" },
    { emoji: "🙂", name: "slightly_smiling_face", code: "1f642" },
    { emoji: "🤯", name: "exploding_head", code: "1f92f" },
    { emoji: "😮", name: "open_mouth", code: "1f62e" },
    { emoji: "🥹", name: "face_holding_back_tears", code: "1f979" },
    { emoji: "😲", name: "astonished", code: "1f632" },
    { emoji: "😱", name: "scream", code: "1f631" },

    // Row 10: Sports (basketball first!)
    { emoji: "🏀", name: "basketball", code: "1f3c0" },
    { emoji: "⚽", name: "soccer", code: "26bd" },
    { emoji: "🏈", name: "football", code: "1f3c8" },
    { emoji: "⚾", name: "baseball", code: "26be" },
    { emoji: "🎾", name: "tennis", code: "1f3be" },
    { emoji: "🏐", name: "volleyball", code: "1f3d0" },
    { emoji: "🏉", name: "rugby_football", code: "1f3c9" },
    { emoji: "🎱", name: "8ball", code: "1f3b1" },
    { emoji: "🏋️", name: "weight_lifter", code: "1f3cb" },
    { emoji: "🚴", name: "bicyclist", code: "1f6b4" },
];

export type EmojiSelection = {
    name: string;
    code: string;
};

export function show_emoji_picker(
    on_select: (selection: EmojiSelection) => void,
): void {
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(10, 1fr)";
    grid.style.gap = "4px";
    grid.style.padding = "4px";

    const popup = pop({
        div: grid,
        confirm_button_text: "Cancel",
        callback() {},
    });

    for (const emoji_info of EMOJIS) {
        const button = document.createElement("button");
        button.innerText = emoji_info.emoji;
        button.style.fontSize = "24px";
        button.style.padding = "6px";
        button.style.cursor = "pointer";
        button.style.border = "none";
        button.style.background = "none";
        button.style.borderRadius = "4px";
        button.title = emoji_info.name;
        button.addEventListener("click", () => {
            popup.finish(() =>
                on_select({ name: emoji_info.name, code: emoji_info.code }),
            );
        });
        grid.append(button);
    }
}
