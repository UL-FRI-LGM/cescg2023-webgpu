'use strict';

import { Sample } from '../common/engine/sample.js';
import { Loader } from '../common/engine/util/loader.js';

// Task 2.2: import the OrbitCamera class
import { OrbitCamera } from '../common/engine/util/orbit-camera.js';

// Task 2.4: import the Model class
import { Model } from '../common/engine/util/model.js';

// Task 2.4: import the Vertex class
import { Vertex } from '../common/engine/core/mesh.js';

const SAMPLE_NAME = 'Model Explorer';

export class ModelExplorer extends Sample {
    async init() {
        // TASK 2.2: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // Task 2.4: add a 3D model
        this.model = new Model(await Loader.loadModel("bunny.obj"));

        await this.#initResources();
        await this.#initPipelines();
    }

    get name() {
        return SAMPLE_NAME;
    }

    render() {
        // TASK 2.2: update the camera...
        this.camera.update();

        // TASK 2.4: replace the default matrix with the model's transformation matrix
        const modelMatrix = this.model.modelMatrix;
        const uniformArray = new Float32Array([
            ...this.camera.view,
            ...this.camera.projection,
            ...modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();
        this.colorAttachment.view = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({colorAttachments: [this.colorAttachment]});
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');

        // Task 2.4: draw all of the model's indices
        renderPass.drawIndexed(this.model.numIndices);

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    async #initResources() {
        // Prepare vertex buffer
        // Task 2.4: replace the triangle's vertices with our model's vertices
        //  - the Vertex class provides helper functions for figuring out the vertex layout
        //  - the Model class provides helper functions for writing its vertices to a mapped buffer range
        this.vertexBuffer = this.device.createBuffer({
            size: Vertex.vertexStride() * Float32Array.BYTES_PER_ELEMENT * this.model.numVertices,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.model.writeVerticesToMappedRange(new Float32Array(this.vertexBuffer.getMappedRange()));
        this.vertexBuffer.unmap();

        // Prepare index buffer
        // Task 2.4: replace the triangle's indices with our model's vertices
        //  - the Vertex class provides helper functions for figuring out the vertex layout
        //  - the Model class provides helper functions for writing its indices to a mapped buffer range
        this.indexBuffer = this.device.createBuffer({
            size: Uint16Array.BYTES_PER_ELEMENT * this.model.numIndices,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.model.writeIndicesToMappedRange(new Uint16Array(this.indexBuffer.getMappedRange()));
        this.indexBuffer.unmap();

        // Set up brick texture
        const image = await Loader.loadImage('brick.png');
        this.texture = this.device.createTexture({
            size: [image.width, image.height],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            format: 'rgba8unorm',
        });
        this.device.queue.copyExternalImageToTexture(
            {source: image},
            {texture: this.texture},
            [image.width, image.height]
        );

        // Create sampler
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Prepare uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            // Task 2.3: adjust the uniform buffer's size to hold three 4x4 matrices instead of two matrices and a vec2
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    async #initPipelines() {
        // Task 2.3: adapt shader to our new vertex layout
        const code = await Loader.loadShaderCode('adjust-vertex-layout.wgsl');
        const shaderModule = this.device.createShaderModule({code});
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex',
                buffers: [
                    // Task 2.4 (optional): use the vertex layout provided by the Vertex class
                    Vertex.vertexLayout(),
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment',
                targets: [
                    {
                        format: this.gpu.getPreferredCanvasFormat()
                    }
                ],
            },
        });

        // Prepare bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler}
            ]
        });

        this.colorAttachment = {
            view: null, // Will be set in render()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };
    }

    stop() {
        super.stop();
        this.camera.dispose();
    }
}
