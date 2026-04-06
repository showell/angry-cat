import * as app from "./app";
import * as database from "./backend/database";
import { DB } from "./backend/database";
import { EventHandler, type ZulipEvent } from "./backend/event";
import * as event_queue from "./backend/event_queue";
import * as message_fetch from "./backend/message_fetch";
import * as zulip_client from "./backend/zulip_client";
import * as config from "./backend/config";
import * as login_manager from "./login_manager";
import * as game from "./lyn_rummy/game";
import { Page } from "./page";
import * as mouse_drag from "./util/mouse_drag";

function is_lyn_rummy_user(): boolean {
    const parts = window.location.pathname
        .split("/")
        .filter((part) => part !== "");

    return parts.length > 0 && parts[parts.length - 1] === "LynRummy";
}

function show_splash(): HTMLDivElement {
    const splash = document.createElement("div");
    splash.style.display = "flex";
    splash.style.flexDirection = "column";
    splash.style.alignItems = "center";
    splash.style.justifyContent = "center";
    splash.style.height = "100vh";
    splash.style.fontFamily = "sans-serif";

    const title = document.createElement("div");
    title.innerText = "Angry Cat Zulip Client";
    title.style.fontSize = "28px";
    title.style.fontWeight = "bold";
    title.style.color = "#000080";
    title.style.marginBottom = "20px";
    splash.append(title);

    const img = document.createElement("img");
    img.src = "images/angry_cat.png";
    img.style.width = "200px";
    img.style.height = "auto";
    img.style.marginBottom = "20px";
    splash.append(img);

    const loading = document.createElement("div");
    loading.innerText = "Loading your recent Zulip data...";
    loading.style.fontSize = "16px";
    loading.style.color = "#265a70";
    splash.append(loading);

    document.body.style.margin = "0";
    document.body.append(splash);

    return splash;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run() {
    if (is_lyn_rummy_user()) {
        game.gui();
        return;
    }

    if (login_manager.needs_to_login()) {
        return;
    }

    document.title = config.get_current_realm_nickname()!;

    mouse_drag.initialize();

    const splash = show_splash();

    // Start data loading and minimum splash timer in parallel.
    const data_ready = (async () => {
        await event_queue.register_queue();
        await database.fetch_original_data();
    })();

    await Promise.all([data_ready, sleep(3000)]);

    // Remove splash and build the real UI.
    splash.remove();

    const page = new Page();

    function handle_zulip_event(event: ZulipEvent) {
        zulip_client.handle_event(event);
        database.handle_event(event);
        page.handle_zulip_event(event);
    }

    const event_manager = new EventHandler(handle_zulip_event);

    event_queue.start_polling(event_manager);

    app.init(page);

    document.addEventListener("keydown", (e) => {
        if (document.querySelector("dialog[open]")) return;
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        const in_interactive = tag === "button" || tag === "input" || tag === "textarea";
        if (in_interactive && e.key !== "Escape") return;
        const in_scroll_area =
            document.activeElement?.classList.contains("keyboard-scroll") ??
            false;
        if (in_scroll_area && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            return;
        }
        const handled = app.APP.dispatch_keyboard_shortcut(e.key);
        if (handled) e.preventDefault();
    });

    page.start();

    message_fetch.backfill(DB);
}

run();
