'use strict';

import { mat4, vec3 } from '../../../lib/gl-matrix-module.js';
import { Node } from '../core/node.js';
import { Transform } from '../core/transform.js';
import { Mesh, Vertex } from '../core/mesh.js';

/**
 * The representation of a 3D model
 * Keeps track of the mesh (with its vertices and indices), a Transform (to create a model matrix), and utility functions to manage GPU buffers for vertices and indices
 */
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

    get transform() {
        return this.#model.getComponentOfType(Transform);
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

    get indexBufferSize() {
        return this.numIndices * Mesh.indexStride();
    }

    get indexType() {
        return Mesh.indexType();
    }

    createVertexBuffer(device) {
        const vertexBuffer = device.createBuffer({
            size: this.vertexBufferSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.writeVerticesToMappedRange(new Float32Array(vertexBuffer.getMappedRange()));
        vertexBuffer.unmap();
        return vertexBuffer;
    }

    createIndexBuffer(device) {
        const indexBuffer = device.createBuffer({
            size: this.indexBufferSize,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.writeIndicesToMappedRange(new Uint32Array(indexBuffer.getMappedRange()));
        indexBuffer.unmap();
        return indexBuffer;
    }

    writeVerticesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeVerticesToMappedRange(mappedRange);
    }

    writeIndicesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeIndicesToMappedRange(mappedRange);
    }
}
