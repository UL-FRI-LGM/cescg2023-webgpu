'use strict';

import { Sample } from '../../../common/framework/sample.js';
import { Vertex } from '../../../common/framework/core/mesh.js';
import { Loader } from '../../../common/framework/util/loader.js';
import { Model } from '../../../common/framework/util/model.js';
import { OrbitCamera } from '../../../common/framework/util/orbit-camera.js';

export class Workshop extends Sample {
    async init() {
        this.assetLoader = new Loader({basePath: '../../../common/assets'});

        this.camera = new OrbitCamera(this.canvas);
        this.model = new Model(await this.assetLoader.loadModel('models/bunny.json'));
        this.cullBackFaces = true;

        await this.#initResources();
        await this.#initPipelines();
    }

    // Task 2.5: add a keyboard input to switch between culling modes
    key(type, key) {
        if (type === 'up' && key.toLowerCase() === 'c') {
            this.cullBackFaces = !this.cullBackFaces;
            if (this.cullBackFaces) {
                this.pipeline = this.backFaceCullingPipeline;
            } else {
                this.pipeline = this.frontFaceCullingPipeline;
            }
        }
    }

    render() {
        this.camera.update();

        const uniformArray = new Float32Array([
            ...this.camera.view,
            ...this.camera.projection,
            ...this.model.modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();

        this.colorAttachment.view = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [this.colorAttachment],
            depthStencilAttachment: this.depthStencilAttachment,
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, this.model.indexType);
        renderPass.drawIndexed(this.model.numIndices);
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    async #initResources() {
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
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Create a depth buffer
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
        pointLightsBufferRange.set([0, 1, 1]);     // position
        pointLightsBufferRange.set([2], 3);        // intensity
        pointLightsBufferRange.set([1, 1, 1], 4);  // color
        this.pointlightsBuffer.unmap();
    }

    async #initPipelines() {
        const code = await new Loader().loadText('shader.wgsl');
        const shaderModule = this.device.createShaderModule({code});

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                // uniform buffer
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {},
                },
                // texture
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                // sampler
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                // Task 3.3: add the storage buffer to our explicitly defined bind group layout
                // storage buffer
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: 'read-only-storage', // allowed values are 'uniform' (default), 'storage', and 'read-only-storage'
                    }
                }
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                bindGroupLayout, // @group 0
            ]
        });

        const pipelineDescriptorBase = {
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex',
                buffers: [Vertex.vertexLayout()],
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

        this.frontFaceCullingPipeline = this.device.createRenderPipeline({
            ...pipelineDescriptorBase,
            primitive: {
                cullMode: 'front',
            }
        });

        this.pipeline = this.backFaceCullingPipeline;

        // Prepare bind group
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 3.3: add storage buffer binding to bind group
                {binding: 3, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        this.colorAttachment = {
            view: null, // Will be set in render()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        this.depthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };
    }
}
