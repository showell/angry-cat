import { pop } from "./popup";

type EmojiInfo = {
    emoji: string;
    name: string;
};

// 25 positive/reaction emojis, 5 rows × 5 columns
const EMOJIS: EmojiInfo[] = [
    { emoji: "👍", name: "thumbs_up" },
    { emoji: "❤️", name: "heart" },
    { emoji: "😂", name: "joy" },
    { emoji: "🎉", name: "tada" },
    { emoji: "🙏", name: "pray" },

    { emoji: "👏", name: "clap" },
    { emoji: "😍", name: "heart_eyes" },
    { emoji: "🔥", name: "fire" },
    { emoji: "✅", name: "white_check_mark" },
    { emoji: "💯", name: "100" },

    { emoji: "🚀", name: "rocket" },
    { emoji: "😄", name: "smile" },
    { emoji: "🤣", name: "rofl" },
    { emoji: "😎", name: "sunglasses" },
    { emoji: "💪", name: "muscle" },

    { emoji: "🌟", name: "star2" },
    { emoji: "🙌", name: "raised_hands" },
    { emoji: "✨", name: "sparkles" },
    { emoji: "🎯", name: "dart" },
    { emoji: "💡", name: "bulb" },

    { emoji: "👋", name: "wave" },
    { emoji: "😊", name: "blush" },
    { emoji: "🤝", name: "handshake" },
    { emoji: "💎", name: "gem" },
    { emoji: "😁", name: "grin" },
];

export function show_emoji_picker(
    on_select: (emoji_name: string) => void,
): void {
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(5, 1fr)";
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
            popup.finish(() => on_select(emoji_info.name));
        });
        grid.append(button);
    }
}
