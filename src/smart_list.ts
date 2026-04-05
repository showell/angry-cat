type Opts = {
    size: number;
    get_div: (index: number) => HTMLElement;
    when_done: () => void;
};

class Dummy {
    div: HTMLElement;

    constructor() {
        const div = document.createElement("div");
        div.innerText = "loading...";
        this.div = div;
    }

    hydrate(new_div: HTMLElement): void {
        this.div.innerHTML = "";
        this.div.append(new_div);
    }

    scroll_to_top(): void {
        this.div.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    scroll_to_bottom(): void {
        this.div.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    }
}

export class SmartList {
    opts: Opts;
    div: HTMLElement;
    dummies: Dummy[];
    queue: HTMLElement[];
    done: boolean;

    constructor(opts: Opts) {
        const div = document.createElement("div");

        this.opts = opts;
        this.done = false;

        this.dummies = [];
        for (let i = 0; i < opts.size; ++i) {
            const dummy = new Dummy();
            div.append(dummy.div);
            this.dummies.push(dummy);
        }

        setTimeout(() => {
            this.populate();
        }, 0);

        this.queue = [];
        this.div = div;
    }

    replace(index: number) {
        const dummies = this.dummies;
        const get_div = this.opts.get_div;

        if (index < dummies.length) {
            dummies[index].hydrate(get_div(index));
        }
        // otherwise it will get drawn later, presumably
    }

    append(new_div: HTMLElement): void {
        if (this.done) {
            this.actually_append(new_div);
        } else {
            this.queue.push(new_div);
        }
    }

    actually_append(new_div: HTMLElement): void {
        const dummy = new Dummy();
        dummy.hydrate(new_div);
        this.div.append(dummy.div);
        this.dummies.push(dummy);
    }

    populate(): void {
        const { size, get_div, when_done } = this.opts;
        const dummies = this.dummies;

        for (let i = 0; i < size; ++i) {
            dummies[i].hydrate(get_div(i));
        }

        this.done = true;

        for (const new_div of this.queue) {
            this.actually_append(new_div);
        }
        this.queue = [];

        when_done();
    }

    scroll_to_bottom(): void {
        const dummies = this.dummies;

        if (!this.done) {
            console.log("should call this only in when_done callback");
            return;
        }
        if (dummies.length === 0) {
            return;
        }
        const last_index = dummies.length - 1;
        dummies[last_index].scroll_to_bottom();
    }

    scroll_index_to_top(index: number): void {
        if (!this.done) {
            console.log("should call this only in when_done callback");
            return;
        }

        // Work around lazy-loading images
        this.dummies[index].scroll_to_top();
        setTimeout(() => {
            this.dummies[index].scroll_to_top();
        }, 300);
    }
}
