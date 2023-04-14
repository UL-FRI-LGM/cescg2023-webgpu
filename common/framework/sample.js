'use strict';

import { GUI } from '../../lib/dat.gui.module.js';

export class Sample {
    #animating;
    #animationFrameRequest = null;
    #eventHandlers;

    /**
     * Overriding this is not recommended
     * @param gui The main workspace (a GUI.Workspace), useful to add customizable parameters through windows in nanogui fashion
     * @param gpu
     * @param adapter WebGPU adapter
     * @param device WebGPU device
     * @param context WebGPU context of HTMLCanvasElement
     * @param canvas
     */
    constructor(gpu, adapter, device, context, canvas, gui=null) {
        this.gpu = gpu;
        this.adapter = adapter;
        this.device = device;
        this.context = context;
        this.canvas = canvas;
        this.gui = gui;
        this.#animating = false;

        // todo: add pointerevent handlers or remove Sample.mouse function
        this.#eventHandlers = {
            'keydown': e => this.key('down', e.key),
            'keyup': e => this.key('up', e.key),
        };
        for (const [eventName, handler] of Object.entries(this.#eventHandlers)) {
            this.canvas.addEventListener(eventName, handler);
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

    // todo: either implement this or remove it
    /**
     * Override me! Handle mouse interactions
     * @param type "down" | "up" | "move" | "click"
     * @param button "left" | "middle" | "right"
     * @param x number - Mouse cursor X position on the WebGPU canvas
     * @param y number - Mouse cursor Y position on the WebGPU canvas
     */
    mouse(type, button, x, y) {
    }

    /**
     * Override me! Handle keyboard interactions
     * @param type "down" | "up"
     * @param keys string[] - A list with the values of all the keys pressed, matching KeyboardEvent.key (see https://www.toptal.com/developers/keycode/for/a)
     */
    key(type, keys) {
    }

    static isAnimatedSample() {
        return true;
    }

    // Call the following methods in subclasses or elsewhere ------------------------------------------------------------
    get name() {
        return this.constructor.name;
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

    static async run(canvas, guiDiv = null) {
        // Initialize WebGPU
        const gpu = navigator.gpu;
        const adapter = gpu && await gpu.requestAdapter();
        const device = adapter && await adapter.requestDevice();
        if (!device) {
            throw new Error(
                'WebGPU not supported. Try using the latest version of Google Chrome or Google Chrome Canary'
            );
        }
        const context = device && canvas.getContext('webgpu');
        context.configure({
            device: device,
            format: gpu.getPreferredCanvasFormat(),
        });

        // Initialize GUI, if a gui div was given
        let gui = null;
        if (guiDiv) {
            gui = new GUI({ autoplace: false });
            guiDiv.appendChild(gui.domElement);
        }

        // Initialize Sample
        const instance = new this.prototype.constructor(gpu, adapter, device, context, canvas, gui);
        await instance.init();

        if (gui) {
            guiDiv.setAttribute(
                'style',
                `width:${gui.domElement.style.width};height:${gui.domElement.childNodes[0].style.height}`
            );
        }

        window.addEventListener('beforeunload', _ => {
            instance.stop();
            return null;
        });

        if (this.isAnimatedSample()) instance.animate();
        else instance.render();
    }
}
