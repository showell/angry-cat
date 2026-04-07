// Shim browser globals that some modules reference at import time.
// This must run before any application imports.
import "./shims";

import "./address_test";
import "./topic_map_test";
import "./message_index_test";
import "./reactions_test";
import "./database_test";
import "./starred_test";
import "./plugins_test";
import "./backend_test";

console.log("ALL TESTS PASSED!");
