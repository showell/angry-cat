import * as event_queue from "../../backend/event_queue";
import type { NetworkHelper, RowType } from "../../backend/network";
import type * as webxdc from "../../backend/webxdc";
import type { EventRow, JsonGameEvent } from "./game";

export class GameHelper {
    game_id: number;
    network_helper: NetworkHelper;

    constructor(info: { game_id: number; network_helper: NetworkHelper }) {
        this.game_id = info.game_id;
        console.log("GAME", this.game_id);
        this.network_helper = info.network_helper;
    }

    xdc_interface() {
        const self = this;
        const game_id = this.game_id;
        const network_helper = this.network_helper;

        return {
            selfAddr: event_queue.addr(),
            sendUpdate(update: webxdc.Update): void {
                const json_game_event = update.payload as JsonGameEvent;
                self.broadcast(json_game_event);
            },
            setUpdateListener(game_callback: webxdc.UpdateListener): void {
                function callback(row: RowType): void {
                    const event_row: EventRow = JSON.parse(row.json_string);
                    game_callback({ payload: event_row });
                }
                network_helper.set_event_listener_for_category({
                    category: "game_events",
                    key: game_id.toString(),
                    content_label: "lynrummy-event",
                    callback,
                });
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

    get_events(): EventRow[] {
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

        return rows.map((row) => {
            return JSON.parse(row.json_string);
        });
    }
}
