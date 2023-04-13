'use strict';

import { Sample } from '../common/engine/sample.js';
import { Loader } from '../common/engine/util/loader.js';

// Task 2.2: import the OrbitCamera class
import { OrbitCamera } from '../common/engine/util/orbit-camera.js';

// todo: maybe use the loader instead?
// Task 2.4: import the "bunny" model
import bunny from '../common/models/bunny.json' assert { type: 'json' };

// Task 2.4: import the Model class
import { Model } from '../common/engine/util/model.js';

// Task 2.4: import the Vertex class
import { Vertex } from '../common/engine/core/mesh.js';

const SAMPLE_NAME = 'Depth Buffer';

export class DepthBuffer extends Sample {
    async init() {
        // TASK 2.2: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // todo: maybe use the loader instead?
        // Task 2.4: add a 3D model
        this.model = new Model(bunny);

        // Task 2.5: add a state tracking variable to switch between render modes
        this.showNormals = false;

        await this.#initResources();
        await this.#initPipelines();
    }

    get name() {
        return SAMPLE_NAME;
    }

    key(type, keys) {
        // Task 2.5 switch between render modes on some key event (here, we use the 'm' key)
        if (type === 'up' && (keys.includes('m') || keys.includes('M'))) {
            this.showNormals = !this.showNormals;
        }
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

        // Task 2.5: add a render mode to our uniforms
        this.device.queue.writeBuffer(this.uniformBuffer,
            uniformArray.length * Float32Array.BYTES_PER_ELEMENT,
            new Uint32Array([this.showNormals])
        );

        const commandEncoder = this.device.createCommandEncoder();
        this.colorAttachment.view = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [this.colorAttachment],
            // Task 2.6: use the depth-stencil attachment
            depthStencilAttachment: this.depthStencilAttachment,
        });
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
            size: Vertex.vertexStride() * this.model.numVertices,
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
            // Task 2.4: adjust the uniform buffer's size to hold three 4x4 matrices and 4 extra bytes for our render mode
            //           this also requires some padding!
            size: 208,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Task 2.6: create a depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    async #initPipelines() {
        // Task 2.4: adapt shader to our new uniform buffer
        const code = await Loader.loadShaderCode('display-normals.wgsl');
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
            // Task 2.6: enable depth testing
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
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

        // Task 2.6: create a depth-stencil attachment
        this.depthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };
    }

    stop() {
        super.stop();
        this.camera.dispose();
    }
}
