'use strict';

import { Sample } from '../../../common/framework/sample.js';
import { Vertex } from '../../../common/framework/core/mesh.js';
import { Loader } from '../../../common/framework/util/loader.js';
import { Model } from '../../../common/framework/util/model.js';
import { OrbitCamera } from '../../../common/framework/util/orbit-camera.js';

// Task 3.3: import vec3
import { vec3 } from '../../../lib/gl-matrix-module.js';

export class Workshop extends Sample {
    async init() {
        this.assetLoader = new Loader({basePath: '../../../common/assets'});

        // Task 2.1: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // Task 2.3: add a 3D model
        this.model = new Model(await this.assetLoader.loadModel('models/bunny.json'));

        // Task 2.5: add a culling mode
        this.cullBackFaces = true;

        await this.#initResources();
        await this.#initPipelines();
    }

    // Task 2.5: add a keyboard input to switch between culling modes
    key(type, keys) {
        if (type === 'up' && (keys.includes('c') || keys.includes('C'))) {
            this.cullBackFaces = !this.cullBackFaces;
            if (this.cullBackFaces) {
                this.pipeline = this.backFaceCullingPipeline;
                this.bindGroup = this.backFaceCullingBindGroup;
            } else {
                this.pipeline = this.frontFaceCullingPipeline;
                this.bindGroup = this.frontFaceCullingBindGroup;
            }
        }
    }

    render() {
        // Task 2.1: update the camera...
        this.camera.update();

        // Task 2.3: replace the default matrix with the model's transformation matrix
        const modelMatrix = this.model.modelMatrix;
        const uniformArray = new Float32Array([
            ...this.camera.view,
            ...this.camera.projection,
            ...modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();
        this.colorAttachment.view = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [this.colorAttachment],
            // Task 2.4 use the depth-stencil attachment
            depthStencilAttachment: this.depthStencilAttachment,
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);

        // Task 2.3: the 'Model' class uses 'uint32' as index type
        renderPass.setIndexBuffer(this.indexBuffer, this.model.indexType);

        // Task 2.3: draw all of the model's indices
        renderPass.drawIndexed(this.model.numIndices);

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    async #initResources() {
        // Task 2.3: replace the triangle's vertices and indices with the model's:
        //   The 'Model' class provides helper functions to create the vertex and index buffers directly.
        // Prepare vertex buffer
        this.vertexBuffer = this.model.createVertexBuffer(this.device);
        // Prepare index buffer
        this.indexBuffer = this.model.createIndexBuffer(this.device);

        // Set up brick texture
        const image = await this.assetLoader.loadImage('images/brick.png');
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
            // Task 2.2: adjust the uniform buffer's size to hold three 4x4 matrices instead of two matrices and a vec2
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Task 2.4 create a depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Task 3.3: create a storage buffer to hold a point light source and upload light source data
        const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
        this.pointlightsBuffer = this.device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
        pointLightsBufferRange.set(vec3.fromValues(0.0, 1.0, 1.0));     // position
        pointLightsBufferRange.set([2], 3);                             // intensity
        pointLightsBufferRange.set(vec3.fromValues(1.0, 1.0, 1.0), 4);  // color
        this.pointlightsBuffer.unmap();
    }

    async #initPipelines() {
        // Task 2.3: adapt shader to our new uniform buffer
        const code = await new Loader().loadText('shader.wgsl');
        const shaderModule = this.device.createShaderModule({code});

        // Task 2.5: add two pipelines: one that culls back faces and one that culls front faces
        const pipelineDescriptorBase = {
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex',
                buffers: [
                    // Task 2.3 (optional): use the vertex layout provided by the Vertex class
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
            // Task 2.4 enable depth testing
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        }

        this.backFaceCullingPipeline = this.device.createRenderPipeline({
            ...pipelineDescriptorBase,
            primitive: {
                cullMode: 'back',
            }
        });

        // Prepare bind group
        this.backFaceCullingBindGroup = this.device.createBindGroup({
            layout: this.backFaceCullingPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 3.3: add storage buffer binding to bind group
                {binding: 3, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        this.frontFaceCullingPipeline = this.device.createRenderPipeline({
            ...pipelineDescriptorBase,
            primitive: {
                cullMode: 'front',
            }
        });

        // Prepare bind group
        this.frontFaceCullingBindGroup = this.device.createBindGroup({
            layout: this.frontFaceCullingPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 3.3: add storage buffer binding to bind group
                {binding: 3, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        this.pipeline = this.backFaceCullingPipeline;
        this.bindGroup = this.backFaceCullingBindGroup;

        this.colorAttachment = {
            view: null, // Will be set in render()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        // Task 2.4 create a depth-stencil attachment
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
