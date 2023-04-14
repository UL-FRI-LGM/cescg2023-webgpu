'use strict';

import { mat4, vec3 } from '../../../lib/gl-matrix-module.js';
import { Node } from '../core/node.js';
import { Transform } from '../core/transform.js';
import { Mesh, Vertex } from '../core/mesh.js';

export class Model {
    #model;

    constructor(mesh, scaleToUnitCubeAndCenter = true) {
        const model = new Node();
        model.addComponent(new Mesh(mesh));

        const matrix = mat4.create(1.0);
        if (scaleToUnitCubeAndCenter) {
            const scaleFactor = 1.0 / Math.max(...model.getComponentOfType(Mesh).bounds.diagonal);
            mat4.scale(matrix, matrix, vec3.fromValues(scaleFactor, scaleFactor, scaleFactor));

            const translation = vec3.subtract(vec3.create(), vec3.create(), model.getComponentOfType(Mesh).bounds.center);
            mat4.translate(matrix, matrix, translation);
        }
        model.addComponent(new Transform({matrix}));

        this.#model = model;
    }

    get modelMatrix() {
        return this.#model.getComponentOfType(Transform).matrix;
    }

    get numVertices() {
        return this.#model.getComponentOfType(Mesh).numVertices;
    }

    get numIndices() {
        return this.#model.getComponentOfType(Mesh).numIndices;
    }

    get vertexBufferSize() {
        return this.numVertices * Vertex.vertexStride();
    }

    get indicesBufferSize() {
        return this.numIndices * Mesh.indexStride();
    }

    get indexType() {
        return Mesh.indexType();
    }

    writeVerticesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeVerticesToMappedRange(mappedRange);
    }

    writeIndicesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeIndicesToMappedRange(mappedRange);
    }
}