// Protocol validation — the first stage of the pipeline.
//
// Checks that payloads are well-formed before geometry or
// semantics look at them. Uses the game's own JsonCardStack
// and JsonBoardEvent types as the target shapes.

export type ProtocolError = {
    message: string;
    path: string;
};

// --- Card validation ---

function validate_card(card: any, path: string): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (card === null || card === undefined || typeof card !== "object") {
        errors.push({ message: "expected card object", path });
        return errors;
    }

    if (typeof card.value !== "number" || card.value < 1 || card.value > 13 || !Number.isInteger(card.value)) {
        errors.push({ message: `invalid card value: ${card.value}`, path: `${path}.value` });
    }

    if (typeof card.suit !== "number" || card.suit < 0 || card.suit > 3 || !Number.isInteger(card.suit)) {
        errors.push({ message: `invalid suit: ${card.suit}`, path: `${path}.suit` });
    }

    if (card.origin_deck !== 0 && card.origin_deck !== 1) {
        errors.push({ message: `invalid origin_deck: ${card.origin_deck}`, path: `${path}.origin_deck` });
    }

    return errors;
}

// --- Board card validation ---

function validate_board_card(bc: any, path: string): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (bc === null || bc === undefined || typeof bc !== "object") {
        errors.push({ message: "expected board_card object", path });
        return errors;
    }

    errors.push(...validate_card(bc.card, `${path}.card`));

    if (typeof bc.state !== "number") {
        errors.push({ message: `invalid board_card state: ${bc.state}`, path: `${path}.state` });
    }

    return errors;
}

// --- Loc validation ---

function validate_loc(loc: any, path: string): ProtocolError[] {
    const errors: ProtocolError[] = [];
    if (loc === null || loc === undefined || typeof loc !== "object") {
        errors.push({ message: "expected loc object", path });
        return errors;
    }
    if (typeof loc.top !== "number") {
        errors.push({ message: `invalid loc.top: ${loc.top}`, path: `${path}.top` });
    }
    if (typeof loc.left !== "number") {
        errors.push({ message: `invalid loc.left: ${loc.left}`, path: `${path}.left` });
    }
    return errors;
}

// --- Stack validation (JsonCardStack shape) ---

function validate_stack(stack: any, path: string): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (stack === null || stack === undefined || typeof stack !== "object") {
        errors.push({ message: "expected stack object", path });
        return errors;
    }

    if (!Array.isArray(stack.board_cards)) {
        errors.push({ message: "expected board_cards array", path: `${path}.board_cards` });
    } else {
        if (stack.board_cards.length === 0) {
            errors.push({ message: "stack has no cards", path: `${path}.board_cards` });
        }
        for (let i = 0; i < stack.board_cards.length; i++) {
            errors.push(...validate_board_card(stack.board_cards[i], `${path}.board_cards[${i}]`));
        }
    }

    errors.push(...validate_loc(stack.loc, `${path}.loc`));

    return errors;
}

// --- Board validation (array of JsonCardStack) ---

export function validate_board(board: any, path: string = "board"): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (!Array.isArray(board)) {
        errors.push({ message: "expected board array", path });
        return errors;
    }

    for (let i = 0; i < board.length; i++) {
        errors.push(...validate_stack(board[i], `${path}[${i}]`));
    }

    return errors;
}

// --- Move validation (JsonBoardEvent shape) ---

export function validate_move(move: any, path: string = "move"): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (move === null || move === undefined || typeof move !== "object") {
        errors.push({ message: "expected move object", path });
        return errors;
    }

    if (!Array.isArray(move.stacks_to_remove)) {
        errors.push({ message: "expected stacks_to_remove array", path: `${path}.stacks_to_remove` });
    } else {
        for (let i = 0; i < move.stacks_to_remove.length; i++) {
            errors.push(...validate_stack(move.stacks_to_remove[i], `${path}.stacks_to_remove[${i}]`));
        }
    }

    if (!Array.isArray(move.stacks_to_add)) {
        errors.push({ message: "expected stacks_to_add array", path: `${path}.stacks_to_add` });
    } else {
        for (let i = 0; i < move.stacks_to_add.length; i++) {
            errors.push(...validate_stack(move.stacks_to_add[i], `${path}.stacks_to_add[${i}]`));
        }
    }

    return errors;
}

// --- Full payload: initial board + moves ---

export function validate_payload(payload: any): ProtocolError[] {
    const errors: ProtocolError[] = [];

    if (payload === null || payload === undefined || typeof payload !== "object") {
        errors.push({ message: "expected payload object", path: "" });
        return errors;
    }

    errors.push(...validate_board(payload.board));

    if (!Array.isArray(payload.moves)) {
        errors.push({ message: "expected moves array", path: "moves" });
    } else {
        for (let i = 0; i < payload.moves.length; i++) {
            errors.push(...validate_move(payload.moves[i], `moves[${i}]`));
        }
    }

    return errors;
}
