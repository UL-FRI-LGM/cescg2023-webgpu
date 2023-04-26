'use strict';

import { mat4, vec3 } from '../../../lib/gl-matrix-module.js';
import { Model } from './model.js';

export class LightSourceModel extends Model {
    constructor(mesh, scaleFactor = 0.05) {
        super(mesh, true);

        const scaleMatrix = mat4.create(1.0);
        mat4.scale(scaleMatrix, scaleMatrix, vec3.fromValues(scaleFactor, scaleFactor, scaleFactor));
        this.transform.matrix = mat4.multiply(scaleMatrix, scaleMatrix, this.transform.matrix);
    }
}