import type { PluginHelper } from "../plugin_helper";
import { APP } from "../app";
import { TodoList } from "../todo_list";

export function plugin(plugin_helper: PluginHelper) {
    plugin_helper.update_label("Reading List");

    const todo_list = new TodoList();
    APP.set_reading_list(todo_list);

    return { div: todo_list.div };
}
