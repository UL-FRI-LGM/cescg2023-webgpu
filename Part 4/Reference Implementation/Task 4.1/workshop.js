'use strict';

import { vec3 } from '../../../lib/gl-matrix-module.js';
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

    key(type, keys) {
        if (type === 'up' && (keys.includes('c') || keys.includes('C'))) {
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
            ...this.camera.position, 0.0,
            ...this.camera.view,
            ...this.camera.projection,
            ...this.model.modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();

        // Task 4.1: encode the animate lights pass
        const animateLightsPass = commandEncoder.beginComputePass();
        animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
        animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
        animateLightsPass.dispatchWorkgroups(
            Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
        );
        animateLightsPass.end();

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
            size: 208,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Create a depth buffer
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Create light source buffer
        const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
        // Task 4.1: store number of light sources in the Sample
        this.numLightSources = 20;
        this.pointlightsBuffer = this.device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements * this.numLightSources,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
        for (let i = 0; i < this.numLightSources; ++i) {
            const position = vec3.fromValues(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
            );
            const intensity = Math.random() * 2;
            const color = vec3.fromValues(
                Math.random(),
                Math.random(),
                Math.random(),
            );
            const offset = i * pointLightStrideInElements;
            pointLightsBufferRange.set(position, offset);
            pointLightsBufferRange.set([intensity], offset + 3);
            pointLightsBufferRange.set(color, offset + 4);
        }
        this.pointlightsBuffer.unmap();
    }

    async #initAnimateLightsPipeline() {
        // Task 4.1: create a compute pipeline to animate the light sources
        const animateLightsShaderCode = await new Loader().loadText('animate-lights.wgsl');
        const animateLightsShaderModule = this.device.createShaderModule({code: animateLightsShaderCode});
        const animateLightsWorkGroupSize = { x: 64 };
        const animateLightsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: animateLightsShaderModule,
                entryPoint: 'compute',
                constants: {
                    WORKGROUP_SIZE: animateLightsWorkGroupSize.x,
                },
            }
        });

        // Task 4.1: create the bind group for the animate lights pass
        const animateLightsBindGroup = this.device.createBindGroup({
            layout: animateLightsPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        // Task 4.1: store animation pipeline data in helper object
        this.animateLightsPipelineData = {
            pipeline: animateLightsPipeline,
            bindGroup: animateLightsBindGroup,
            workGroupSize: animateLightsWorkGroupSize,
        }
    }

    async #initPipelines() {
        const code = await new Loader().loadText('shader.wgsl');
        const shaderModule = this.device.createShaderModule({code});

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                // uniform buffer
                {
                    binding: 0,
                    // Task 3.6: make the uniform buffer visible in the fragment stage
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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

        await this.#initAnimateLightsPipeline();
    }
}
