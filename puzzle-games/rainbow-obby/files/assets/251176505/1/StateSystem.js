class StateSystem {
    constructor() {
        this.state_map = {};
        this.state_pre = null;
        this.state = null;
        this.state_timer = 0;
        this.state_timer_pre = -1;
        this.started = false;
        this.autoStart = true;
    }

    add(id, events = {}) {
        this.state_map[id] = {
            begin: events.onStart || null,
            step: events.onUpdate || null,
            end: events.onEnd || null
        };

        if (this.state === null && this.autoStart) {
            this.state = id;

            let begin = this.state_map[id].begin;
            if (begin) begin(0);

            this.state_pre = id;
            this.started = true;
        }
    }

    set(id) {
        if (this.state_map[id] !== undefined && this.state !== id) {
            this.state_timer = 0;
            this.state_timer_pre = -1;

            let prev = this.state;
            this.state = id;

            if (prev !== null) {
                let end = this.state_map[prev]?.end;
                if (end) end(0);
            }

            let begin = this.state_map[id]?.begin;
            if (begin) begin(0);
        }
    }

    get() { return this.state; }
    timer() { return this.state_timer; }
    hit(second) {
        return this.state_timer >= second && this.state_timer_pre < second;
    }

    update(dt) {
        if (this.state !== null) {
            let step = this.state_map[this.state]?.step;
            if (step) step(dt);
        }

        this.state_timer_pre = this.state_timer;
        this.state_timer += dt;
    }
}
