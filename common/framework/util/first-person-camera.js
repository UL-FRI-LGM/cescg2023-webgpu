'use strict';

import { mat4, vec3 } from '../../../lib/gl-matrix-module.js';
import { Node } from '../core/node.js';
import { Transform } from '../core/transform.js';
import { Camera } from '../core/camera.js';
import { FirstPersonController } from '../controllers/first-person.js';

export class FirstPersonCamera {
    #camera;

    /**
     * Constructs an OrbitCamera, that will orbit around the origin (0,0,0) with mouse drag
     * @param canvas {HTMLCanvasElement} The canvas that will trigger mouse events
     */
    constructor(canvas) {
        const camera = new Node();
        camera.addComponent(new Transform({translation: vec3.fromValues(0, 0, 2)}));
        camera.addComponent(new Camera());
        camera.getComponentOfType(Camera).resize(canvas.width, canvas.height);
        camera.addComponent(new FirstPersonController(camera, canvas));
        this.#camera = camera;
    }

    update(dt = 0.016) {
        this.#camera.getComponentOfType(FirstPersonController).update(dt);
    }

    get position() {
        return mat4.getTranslation(vec3.create(), this.#camera.getComponentOfType(Transform).matrix);
    }

    get view() {
        return mat4.invert(mat4.create(), this.#camera.getComponentOfType(Transform).matrix);
    }

    get projection() {
        return this.#camera.getComponentOfType(Camera).projectionMatrix;
    }

    dispose() {
        this.#camera.getComponentOfType(FirstPersonController).dispose();
    }
}
