'use strict';

import { vec3, mat4, quat } from '../../../lib/gl-matrix-module.js';

/**
 * A transform containing a position, rotation, and scale
 */
export class Transform {
    constructor({
                    rotation = quat.fromValues(0, 0, 0, 1),
                    translation = vec3.fromValues(0, 0, 0),
                    scale = vec3.fromValues(1, 1, 1),
                    matrix,
                } = {}) {
        this.rotation = rotation;
        this.translation = translation;
        this.scale = scale;
        if (matrix) {
            this.matrix = matrix;
        }
    }

    get matrix() {
        return mat4.fromRotationTranslationScale(mat4.create(),
            this.rotation, this.translation, this.scale);
    }

    set matrix(matrix) {
        mat4.getRotation(this.rotation, matrix);
        mat4.getTranslation(this.translation, matrix);
        mat4.getScaling(this.scale, matrix);
    }
}
