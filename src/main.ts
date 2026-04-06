import * as app from "./app";
import * as database from "./backend/database";
import { DB } from "./backend/database";
import { EventHandler, type ZulipEvent } from "./backend/event";
import * as event_queue from "./backend/event_queue";
import * as zulip_client from "./backend/zulip_client";
import * as config from "./backend/config";
import * as login_manager from "./login_manager";
import * as game from "./lyn_rummy/game";
import { Page } from "./page";
import * as splash from "./splash";
import { StatusBar } from "./status_bar";
import * as mouse_drag from "./util/mouse_drag";

function is_lyn_rummy_user(): boolean {
    const parts = window.location.pathname
        .split("/")
        .filter((part) => part !== "");

    return parts.length > 0 && parts[parts.length - 1] === "LynRummy";
}

function install_keyboard_handler(): void {
    document.addEventListener("keydown", (e) => {
        if (document.querySelector("dialog[open]")) return;
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        const in_interactive =
            tag === "button" || tag === "input" || tag === "textarea";
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
}

async function run() {
    if (is_lyn_rummy_user()) {
        game.gui();
        return;
    }

    if (login_manager.needs_to_login()) {
        return;
    }

    document.title = config.get_current_realm_nickname()!;
    mouse_drag.initialize();

    // --- Splash phase: load data while the user watches progress ---

    const screen = splash.create();

    screen.add_line("Connecting to Zulip...");
    await event_queue.register_queue();
    screen.add_line("Connected!");

    await database.fetch_original_data();
    screen.add_line(`${DB.message_map.size} recent messages loaded.`);
    screen.add_line(`${DB.user_map.size} users found.`);

    const backfill = screen.run_backfill(DB);
    await backfill.threshold;
    screen.remove();

    // --- App phase: build the UI and start event processing ---

    const page = new Page();

    const event_manager = new EventHandler((event: ZulipEvent) => {
        zulip_client.handle_event(event);
        database.handle_event(event);
        page.handle_zulip_event(event);
    });

    event_queue.start_polling(event_manager);
    app.init(page);
    install_keyboard_handler();
    page.start();

    StatusBar.inform(
        "Welcome! Use arrow keys to browse channels, Enter to open topics, or press 'h' for help.",
    );

    // When backfill fully completes, refresh all navigators so channel
    // choosers reflect the complete data without waiting for the next event.
    backfill.complete.then(() => {
        page.refresh_navigators();
    });
}

run();
