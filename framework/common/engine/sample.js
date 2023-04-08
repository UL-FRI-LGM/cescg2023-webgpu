'use strict';

export class Sample {
    #animating;
    #animationFrameRequest = null;
    #eventHandlers;

    /**
     * Overriding this is not recommended
     * @param gui The main workspace (a GUI.Workspace), useful to add customizable parameters through windows in nanogui fashion
     * @param adapter WebGPU adapter
     * @param device WebGPU device
     * @param context WebGPU context of HTMLCanvasElement
     */
    constructor(gui, gpu, adapter, device, context, canvas) {
        this.gui = gui;
        this.gpu = gpu;
        this.adapter = adapter;
        this.device = device;
        this.context = context;
        this.canvas = canvas;
        this.#animating = false;

        // todo: add pointerevent handlers
        this.#eventHandlers = {
            'keydown': e => this.key('down', e.key),
            'keyup': e => this.key('up', e.key),
        };
        for (const [eventName, handler] of Object.entries(this.#eventHandlers)) {
            // todo: this should be this.canvas but for some reason it does not receive any events
            document.body.addEventListener(eventName, handler);
        }
    }

    // Override the following methods in subclasses --------------------------------------------------------------------

    /** Override me! */
    async init() {
    }

    /** Override me! */
    render(deltaTime = 0.0) {
    }

    /** Override me! */
    resize(width, height) {
    }

    /**
     * Override me! Handle mouse interactions
     * @param type "down" | "up" | "move" | "click"
     * @param button "left" | "middle" | "right"
     * @param keys string[] - A list with the values of all the keys pressed, matching KeyboardEvent.key (see https://www.toptal.com/developers/keycode/for/a)
     * @param x number - Mouse cursor X position on the WebGPU canvas
     * @param y number - Mouse cursor Y position on the WebGPU canvas
     */
    mouse(type, button, keys, x, y) {
    }

    /**
     * Override me! Handle keyboard interactions
     * @param type "down" | "up"
     * @param keys string[] - A list with the values of all the keys pressed, matching KeyboardEvent.key (see https://www.toptal.com/developers/keycode/for/a)
     */
    key(type, keys) {
    }

    // Call the following methods in subclasses or elsewhere ------------------------------------------------------------
    get name() {
        return this.constructor.name;
    }

    get animating() {
        return this.#animating;
    }

    animate() {
        if (this.#animating) return;
        this.#animating = true;

        const update = _ => {
            const now = performance.now();
            const deltaTime = now - lastFrame;
            lastFrame = now;

            this.render(deltaTime);

            if (this.#animating) {
                this.#animationFrameRequest = requestAnimationFrame(update);
            }
        };

        let lastFrame = performance.now();
        update();
    }

    stop() {
        this.#animating = false;
        if (this.#animationFrameRequest !== null) {
            cancelAnimationFrame(this.#animationFrameRequest);
            this.#animationFrameRequest = null;
        }
        for (const [eventName, handler] of Object.entries(this.#eventHandlers)) {
            this.canvas.removeEventListener(eventName, handler);
        }
    }

    static register(samples) {
        samples[this.prototype.constructor.name] = this;
    }

    static isAnimatedSample() {
        return true;
    }
}
