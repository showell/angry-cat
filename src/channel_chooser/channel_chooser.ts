import type { ChannelRow } from "../channel_row";
import * as layout from "../layout";

import { ChannelList } from "./channel_list";
import type { ChannelChooserOpts } from "./types.ts";

export function make_channel_chooser(opts: ChannelChooserOpts) {
    const channel_list = new ChannelList({
        handle_channel_chosen: opts.handle_channel_chosen,
        handle_channel_cleared: opts.handle_channel_cleared,
        channel_id: opts.start_channel_id,
    });

    function pane_div(): HTMLDivElement {
        const channel_pane_div = document.createElement("div");
        const adjuster_div = channel_list.get_adjuster_div();

        layout.draw_table_pane(
            channel_pane_div,
            "Channels",
            adjuster_div,
            channel_list.div,
        );
        return channel_pane_div;
    }

    function refresh_completely() {
        channel_list.refresh_completely();
    }

    function get_channel_row(): ChannelRow {
        // Our caller knows to call us only when
        // a channel is chosen.
        return channel_list.get_channel_row()!;
    }

    function total_unread_count(): number {
        return channel_list.total_unread_count();
    }

    function get_first_channel_id(): number | undefined {
        return channel_list.get_first_channel_id();
    }

    function get_first_unread_channel_id(): number | undefined {
        return channel_list.get_first_unread_channel_id();
    }

    function select_channel(channel_id: number): void {
        channel_list.select_channel(channel_id);
    }

    function deselect(): void {
        channel_list.deselect();
    }

    const div = pane_div();

    return { div, refresh_completely, get_channel_row, total_unread_count, get_first_channel_id, get_first_unread_channel_id, select_channel, deselect };
}
