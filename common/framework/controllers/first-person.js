'use strict';

import { quat, vec3 } from '../../../lib/gl-matrix-module.js';
import { Transform } from '../core/transform.js';

/**
 * The controller that interfaces mouse interactions with a Node (e.g. Camera)
 * It moves the camera on WASD and rotates it on mouse movement
 */
export class FirstPersonController {
    #node;
    #domElement;

    #keys;

    #pitch = 0;
    #yaw = 0;

    #velocity;
    #acceleration;
    #maxSpeed;
    #decay;
    #pointerSensitivity;

    #pointermoveHandler;
    #keydownHandler;
    #keyupHandler;
    #clickHandler;
    #pointerLockChangeHandler;

    /**
     * @param node {Node} The Node that will be controlled
     * @param domElement {HTMLElement} The dom element that will trigger mouse events
     * @param velocity {number}
     * @param acceleration {number}
     * @param maxSpeed {number}
     * @param decay {number} How fast the speed decreases when no key is being pressed
     * @param pointerSensitivity {number}
     */
    constructor(node, domElement, {
        velocity = vec3.fromValues(0, 0, 0),
        acceleration = 20,
        maxSpeed = 3,
        decay = 0.9,
        pointerSensitivity = 0.002
    } = {}) {
        this.#node = node;
        this.#domElement = domElement;

        this.#keys = {};

        this.#pitch = 0;
        this.#yaw = 0;

        this.#velocity = velocity;
        this.#acceleration = acceleration;
        this.#maxSpeed = maxSpeed;
        this.#decay = decay;
        this.#pointerSensitivity = pointerSensitivity;

        this.#initHandlers();
    }

    update(dt = 0.0) {
        // Calculate forward and right vectors.
        const cos = Math.cos(this.#yaw);
        const sin = Math.sin(this.#yaw);
        const forward = [-sin, 0, -cos];
        const right = [cos, 0, -sin];

        // Map user input to the acceleration vector.
        const acc = vec3.create();
        if (this.#keys['KeyW']) {
            vec3.add(acc, acc, forward);
        }
        if (this.#keys['KeyS']) {
            vec3.sub(acc, acc, forward);
        }
        if (this.#keys['KeyD']) {
            vec3.add(acc, acc, right);
        }
        if (this.#keys['KeyA']) {
            vec3.sub(acc, acc, right);
        }

        // Update velocity based on acceleration.
        vec3.scaleAndAdd(this.#velocity, this.#velocity, acc, dt * this.#acceleration);

        // If there is no user input, apply decay.
        if (!this.#keys['KeyW'] &&
            !this.#keys['KeyS'] &&
            !this.#keys['KeyD'] &&
            !this.#keys['KeyA']) {
            const decay = Math.exp(dt * Math.log(1 - this.#decay));
            vec3.scale(this.#velocity, this.#velocity, decay);
        }

        // Limit speed to prevent accelerating to infinity and beyond.
        const speed = vec3.length(this.#velocity);
        if (speed > this.#maxSpeed) {
            vec3.scale(this.#velocity, this.#velocity, this.#maxSpeed / speed);
        }

        const transform = this.#node.getComponentOfType(Transform);
        if (transform) {
            // Update translation based on velocity.
            vec3.scaleAndAdd(transform.translation,
                transform.translation, this.#velocity, dt);

            // Update rotation based on the Euler angles.
            const rotation = quat.create();
            quat.rotateY(rotation, rotation, this.#yaw);
            quat.rotateX(rotation, rotation, this.#pitch);
            transform.rotation = rotation;
        }
    }

    #initHandlers() {
        const element = this.#domElement;
        const doc = element.ownerDocument;

        this.#pointermoveHandler = e => this.#handlePointerMoveEvent(e);
        this.#keydownHandler = e => this.#handleKeyDownEvent(e);
        this.#keyupHandler = e => this.#handleKeyUpEvent(e);
        this.#clickHandler = _ => element.requestPointerLock();
        this.#pointerLockChangeHandler = _ => {
            if (doc.pointerLockElement === element) {
                doc.addEventListener('pointermove', this.#pointermoveHandler);
            } else {
                doc.removeEventListener('pointermove', this.#pointermoveHandler);
            }
        };

        doc.addEventListener('keydown', this.#keydownHandler);
        doc.addEventListener('keyup', this.#keyupHandler);

        element.addEventListener('click', this.#clickHandler);
        doc.addEventListener('pointerlockchange', this.#pointerLockChangeHandler);
    }

    #handlePointerMoveEvent(e) {
        const dx = e.movementX;
        const dy = e.movementY;

        this.#pitch -= dy * this.#pointerSensitivity;
        this.#yaw -= dx * this.#pointerSensitivity;

        const twopi = Math.PI * 2;
        const halfpi = Math.PI / 2;

        this.#pitch = Math.min(Math.max(this.#pitch, -halfpi), halfpi);
        this.#yaw = ((this.#yaw % twopi) + twopi) % twopi;
    }

    #handleKeyDownEvent(e) {
        this.#keys[e.code] = true;
    }

    #handleKeyUpEvent(e) {
        this.#keys[e.code] = false;
    }

    dispose() {
        const element = this.#domElement;
        const doc = element.ownerDocument;

        doc.removeEventListener('keydown', this.#keydownHandler);
        doc.removeEventListener('keyup', this.#keyupHandler);
        doc.removeEventListener('pointermove', this.#pointermoveHandler);
        element.removeEventListener('click', this.#clickHandler);
        doc.removeEventListener('pointerlockchange', this.#pointerLockChangeHandler);
    }
}
