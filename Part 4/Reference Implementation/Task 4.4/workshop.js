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

    // Task 4.2: add a keyboard inputs to switch between render targets
    key(type, keys) {
        if (type === 'up') {
            if (keys.includes('c') || keys.includes('C')) {
                // Task 4.1: use our new helper objects
                this.cullBackFaces = !this.cullBackFaces;
                if (this.cullBackFaces) {
                    this.createGBufferPipelineData.pipeline = this.createGBufferPipelineData.backFaceCullingPipeline;
                } else {
                    this.createGBufferPipelineData.pipeline = this.createGBufferPipelineData.frontFaceCullingPipeline;
                }
            } else if (keys.includes('a') || keys.includes('A')) {
                this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.albedoBindGroup;
            } else if (keys.includes('p') || keys.includes('P')) {
                this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.positionsBindGroup;
            } else if (keys.includes('n') || keys.includes('N')) {
                this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.normalsBindGroup;
            } else if (keys.includes('r') || keys.includes('R')) {
                this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.renderTextureBindGroup;
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

        // Task 4.1: no longer set the color attachment's view from the current frame's view
        const renderToTexturePass = commandEncoder.beginRenderPass(
            this.createGBufferPipelineData.attachments
        );
        renderToTexturePass.setPipeline(this.createGBufferPipelineData.pipeline);
        renderToTexturePass.setBindGroup(0, this.createGBufferPipelineData.bindGroup);
        renderToTexturePass.setVertexBuffer(0, this.vertexBuffer);
        renderToTexturePass.setIndexBuffer(this.indexBuffer, this.model.indexType);
        renderToTexturePass.drawIndexed(this.model.numIndices);
        renderToTexturePass.end();

        // Task 4.4: encode the animate lights pass
        const animateLightsPass = commandEncoder.beginComputePass();
        animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
        animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
        animateLightsPass.dispatchWorkgroups(
            Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
        );
        animateLightsPass.end();

        // Task 4.3: encode the deferred shading pass
        const deferredShadingPass = commandEncoder.beginComputePass();
        deferredShadingPass.setPipeline(this.deferredShadingPipelineData.pipeline);
        deferredShadingPass.setBindGroup(0, this.deferredShadingPipelineData.bindGroup);
        deferredShadingPass.dispatchWorkgroups(
            Math.ceil(this.canvas.width / this.deferredShadingPipelineData.workGroupSize.x),
            Math.ceil(this.canvas.height / this.deferredShadingPipelineData.workGroupSize.y),
        );
        deferredShadingPass.end();

        // Task 4.1: encode the pipeline rendering to the screen
        this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
        const presentToScreenPass = commandEncoder.beginRenderPass(
            this.presentToScreenPipelineData.attachments,
        );
        presentToScreenPass.setPipeline(this.presentToScreenPipelineData.pipeline);
        presentToScreenPass.setBindGroup(0, this.presentToScreenPipelineData.bindGroup);
        // the 6 vertices we are drawing are stored within a constant array in the shader
        presentToScreenPass.draw(6);
        presentToScreenPass.end();

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
        // Task 4.4: store number of light sources in the Sample
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

        // Task 4.1: create an output texture for the rendered image
        this.renderTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
            // Task 4.3: use a texture format that supports the storage binding usage (e.g., rgba8unorm)
            format: 'rgba8unorm',
            // Task 4.3: replace RENDER_ATTACHMENT with STORAGE_BINDING
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        // Task 4.2: set up a G-Buffer consisting of three textures:
        //  - albedo
        //  - positions
        //  - normals
        this.gBuffer = {
            albedo: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            positions: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            normals: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
        };
    }

    async #initPipelines() {
        // Task 4.1: split our previous pipeline into two pipelines: one that renders to a texture and another that
        //  takes the rendered texture as an input and outputs it to the canvas
        //  To avoid confusion, we pack each pipeline into helper objects

        const code = await new Loader().loadText('create-g-buffer.wgsl');
        const shaderModule = this.device.createShaderModule({code});

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                // uniform buffer
                {
                    binding: 0,
                    // Task 4.3: make the uniform buffer only visible in the vertex stage
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
                // Task 4.3: remove the light source buffer from the bind group layout
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                bindGroupLayout, // @group 0
            ]
        });

        const createGBufferPipelineDescriptorBase = {
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
                    // Task 4.3: only render to G-Buffer attachments
                    {format: this.gpu.getPreferredCanvasFormat(),},
                    {format: this.gpu.getPreferredCanvasFormat(),},
                    {format: this.gpu.getPreferredCanvasFormat(),},
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        }

        const backFaceCullingPipeline = this.device.createRenderPipeline({
            ...createGBufferPipelineDescriptorBase,
            primitive: {
                cullMode: 'back',
            }
        });

        const frontFaceCullingPipeline = this.device.createRenderPipeline({
            ...createGBufferPipelineDescriptorBase,
            primitive: {
                cullMode: 'front',
            }
        });

        // Prepare bind group
        const createGBufferBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 4.3: remove light source buffer from bindings
            ]
        });

        // Task 4.2: create color attachments for the render pass creating the G-Buffer
        // Task 4.3: only render to G-Buffer attachments
        const createGBufferColorAttachments = [
            {
                view: this.gBuffer.albedo.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
            {
                view: this.gBuffer.positions.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
            {
                view: this.gBuffer.normals.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
        ];

        const createGBufferDepthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };

        this.createGBufferPipelineData = {
            pipeline: backFaceCullingPipeline,
            bindGroup: createGBufferBindGroup,
            attachments: {
                colorAttachments: createGBufferColorAttachments,
                depthStencilAttachment: createGBufferDepthStencilAttachment,
            },
            backFaceCullingPipeline,
            frontFaceCullingPipeline,
        };

        // Task 4.3: create a compute pipeline to compute the illumination in our scene in a deferred way
        const deferredShadingShaderCode = await new Loader().loadText('deferred-shading.wgsl');
        const deferredShadingShaderModule = this.device.createShaderModule({code: deferredShadingShaderCode});
        const deferredShadingWorkGroupSize = {
            x: 16,
            y: 16,
        }
        const deferredShadingPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: deferredShadingShaderModule,
                entryPoint: 'compute',
                constants: {
                    0: deferredShadingWorkGroupSize.x,
                    1: deferredShadingWorkGroupSize.y
                },
            },
        });

        // Task 4.3: create the bind group for our deferred shading pass
        const deferredShadingBindGroup = this.device.createBindGroup({
            layout: deferredShadingPipeline.getBindGroupLayout(0),
            entries: [
                // G-Buffer
                {binding: 0, resource: this.gBuffer.albedo.createView()},
                {binding: 1, resource: this.gBuffer.positions.createView()},
                {binding: 2, resource: this.gBuffer.normals.createView()},
                // uniforms & light sources
                {binding: 3, resource: {buffer: this.uniformBuffer}},
                {binding: 4, resource: {buffer: this.pointlightsBuffer}},
                // rendered image
                {binding: 5, resource: this.renderTexture.createView()},
            ]
        });

        // Task 4.3: store deferred shading pipeline data in helper object
        this.deferredShadingPipelineData = {
            pipeline: deferredShadingPipeline,
            bindGroup: deferredShadingBindGroup,
            workGroupSize: deferredShadingWorkGroupSize,
        }

        // Task 4.4: create a compute pipeline to animate the light sources
        const animateLightsShaderCode = await new Loader().loadText('animate-lights.wgsl');
        const animateLightsShaderModule = this.device.createShaderModule({code: animateLightsShaderCode});
        const animateLightsWorkGroupSize = { x: 64 };
        const animateLightsPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: animateLightsShaderModule,
                entryPoint: 'compute',
                constants: {
                    0: animateLightsWorkGroupSize.x,
                },
            }
        });

        // Task 4.4: create the bind group for the animate lights pass
        const animateLightsBindGroup = this.device.createBindGroup({
            layout: animateLightsPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        // Task 4.4: store animation pipeline data in helper object
        this.animateLightsPipelineData = {
            pipeline: animateLightsPipeline,
            bindGroup: animateLightsBindGroup,
            workGroupSize: animateLightsWorkGroupSize,
        }

        // Task 4.1: create a pipeline to present our rendered image to the screen
        const presentToScreenShaderCode = await new Loader().loadText('present-to-screen.wgsl');
        const presentToScreenShaderModule = this.device.createShaderModule({code: presentToScreenShaderCode});
        const presentToScreenPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: presentToScreenShaderModule,
                entryPoint: 'vertex',
                // the vertices and texture coordinates are stored directly in the shader and accessed via their index
                // so, we don't have to pass any vertex buffers here
            },
            fragment: {
                module: presentToScreenShaderModule,
                entryPoint: 'fragment',
                targets: [
                    {
                        format: this.gpu.getPreferredCanvasFormat()
                    }
                ],
            },
        });

        // Task 4.1: create a color attachment for the final pass presenting our rendered image to the canvas
        const presentToScreenColorAttachment = {
            view: null, // Will be set in render()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        // Task 4.1: create a bind group for the final pass.
        //   this uses the texture we rendered to in the first pass and a sampler
        const presentToScreenBindgroup = this.device.createBindGroup({
            layout: presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: this.renderTexture.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });

        // Task 4.2: create a bind group for each of the G-Buffer textures
        const albedoBindGroup = this.device.createBindGroup({
            layout: presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: this.gBuffer.albedo.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });
        const positionsBindGroup = this.device.createBindGroup({
            layout: presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: this.gBuffer.positions.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });
        const normalsBindGroup = this.device.createBindGroup({
            layout: presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: this.gBuffer.normals.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });

        this.presentToScreenPipelineData = {
            pipeline: presentToScreenPipeline,
            bindGroup: presentToScreenBindgroup,
            attachments: {
                colorAttachments: [presentToScreenColorAttachment],
            },
            // Task 4.2: store all bind groups in pipeline data
            renderTextureBindGroup: presentToScreenBindgroup,
            albedoBindGroup,
            positionsBindGroup,
            normalsBindGroup,
        }
    }
}
