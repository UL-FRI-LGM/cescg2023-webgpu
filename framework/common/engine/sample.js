'use strict';

export class Sample {
    #animating;
    #animationFrameRequest = null;

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
    }

    // Override the following methods in subclasses --------------------------------------------------------------------

    /** Override me! */
    async load() {
    }

    /** Override me! */
    init() {
    }

    /** Override me! */
    render(deltaTime = 0.0) {
    }

    /** Override me! Return an object mapping shader names to their respective codes: { [name: string]: string } */
    shaders() {
    }

    /** Override me! */
    resize(width, height) {
    }

    /** Override me! Implement shader reloading */
    reloadShader(shaderName, shaderCode) {
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
            // Unused for now TODO
            const now = performance.now();
            const deltaTime = now - lastFrame;
            //this._fps.textContent = (1000 / deltaTime).toFixed(3);
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
    }

    static register(samples) {
        samples[this.prototype.constructor.name] = this;
    }
}
