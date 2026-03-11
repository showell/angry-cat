function init_parser_class(): DOMParser {
    if (typeof window === 'undefined') {
        // We are in a Node.js environment, use JSDOM
        const jsdom = require('jsdom');
        const { JSDOM } = jsdom;
        return new (new JSDOM().window.DOMParser)();
    } else {
        return new DOMParser();
    }
}

let Parser = init_parser_class();

export function get_dom_parser(): DOMParser {
    return Parser;
}
