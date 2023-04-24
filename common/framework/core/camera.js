'use strict';

import { mat4 } from '../../../lib/gl-matrix-module.js';

export class Camera {
    #orthographic;
    #aspect;
    #fovY;
    #halfY;
    #near;
    #far;

    /**
     * Constructs a perspective or orthographic camera
     * @param orthographic {boolean} Whether this camera is orthographic. If false, this camera will be perspective
     * @param aspect {number} The aspect ratio (width / height)
     * @param fovY {number} (only used if 'orthographic'=false) The field-of-view
     * @param halfY (only used if 'orthographic'=false) The top-bound of the frustum. The bottom-bound will be '-halfY', and the left- and right-bounds will be calculated using 'aspect'
     * @param near The near-bound of the frustum
     * @param far The far-bound of the frustum
     */
    constructor({
                    orthographic = false,
                    aspect = 1,
                    fovY = 1,
                    halfY = 1,
                    near = orthographic ? 0 : 1,
                    far = orthographic ? 1 : Infinity,
                } = {}) {
        this.#orthographic = orthographic;
        this.#aspect = aspect;
        this.#fovY = fovY;
        this.#halfY = halfY;
        this.#near = near;
        this.#far = far;
    }

    get projectionMatrix() {
        return this.#orthographic ? this.orthographicMatrix : this.perspectiveMatrix;
    }

    get orthographicMatrix() {
        const halfX = this.#halfY * this.#aspect;
        return mat4.orthoZO(mat4.create(), -halfX, halfX, -this.#halfY, this.#halfY, this.#near, this.#far);
    }

    get perspectiveMatrix() {
        return mat4.perspectiveZO(mat4.create(), this.#fovY, this.#aspect, this.#near, this.#far);
    }

    resize(width, height) {
        this.#aspect = width / height;
        this.#halfY = height / 2;
    }
}
