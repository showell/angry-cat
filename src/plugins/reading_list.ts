import type { PluginHelper } from "../plugin_helper";
import { TodoList } from "../todo_list";

export function plugin(plugin_helper: PluginHelper) {
    plugin_helper.update_label("Reading List");

    const todo_list = new TodoList();

    return { div: todo_list.div };
}
