import * as app from "./app";
import * as database from "./backend/database";
import { DB } from "./backend/database";
import { EventHandler, type ZulipEvent } from "./backend/event";
import * as message_fetch from "./backend/message_fetch";
import * as event_queue from "./backend/event_queue";
import * as zulip_client from "./backend/zulip_client";
import * as config from "./config";
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

export async function run() {
    if (is_lyn_rummy_user()) {
        game.gui();
        return;
    }

    if (login_manager.needs_to_login()) {
        // The login_manager will end up doing a page redirect that will
        // call this `run` again.
        return;
    }

    // We overwrite this as soon as we fetch data
    // and call page.start(), which in turn calls
    // into Navigator to get the unread counts
    // for our initial download of Zulip data.  But
    // this is nice to have while data is still loading.
    document.title = config.get_current_realm_nickname()!;

    mouse_drag.initialize();

    // do before fetching to get "spinner"
    const page = new Page();

    function handle_zulip_event(event: ZulipEvent) {
        // Reconcile outbound messages with their inbound events.
        zulip_client.handle_event(event);

        // We want the model to update before any plugins touch
        // the event.
        database.handle_event(event);

        // The Page object dispatches events to all the plugins.
        page.handle_zulip_event(event);
    }

    const event_manager = new EventHandler(handle_zulip_event);

    // we wait for register to finish, but then polling goes
    // on "forever" asynchronously
    await event_queue.register_queue();

    await database.fetch_original_data();

    event_queue.start_polling(event_manager);

    app.init(page);

    page.start();

    message_fetch.backfill(DB);
}

run();
