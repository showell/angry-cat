import type { JsonGameEvent } from "./game";
import type * as webxdc from "../backend/webxdc";

import { NetworkHelper } from "../backend/network";

export class GameHelper {
    game_id: number;
    network_helper: NetworkHelper;

    constructor(info: { game_id: number; network_helper: NetworkHelper }) {
        this.game_id = info.game_id;
        this.network_helper = info.network_helper;
    }

    xdc_interface() {
        const self = this;

        return {
            sendUpdate(update: webxdc.Update): void {
                const json_game_event = update.payload as JsonGameEvent;
                self.broadcast(json_game_event);
            },
        };
    }

    broadcast(json_game_event: JsonGameEvent) {
        const game_id = this.game_id;
        const network_helper = this.network_helper;

        network_helper.serialize({
            category: "game_events",
            key: game_id.toString(),
            content_label: "lynrummy-event",
            value: json_game_event,
            message_callback: (_message) => {},
        });
    }

    get_events(): JsonGameEvent[] {
        const game_id = this.game_id;
        const network_helper = this.network_helper;

        const category = "game_events";
        const content_label = "lynrummy-event";
        const key = game_id.toString();

        const rows = network_helper.get_rows_for_category({
            category,
            key,
            content_label,
        });

        return rows.map((row) => JSON.parse(row.value_string));
    }
}
