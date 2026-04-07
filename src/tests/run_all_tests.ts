// Shims must load before any application imports.
import "./shims";

import "./address_test";
import "./topic_map_test";
import "./message_index_test";
import "./reactions_test";
import "./parse_test";
import "./database_test";
import "./starred_test";
import "./plugins_test";
import "./backend_test";
import "./navigator_test";

console.log("ALL TESTS PASSED!");
