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
            // Task 4.1: use our new helper objects
            if (this.cullBackFaces) {
                this.renderToTexturePipelineData.pipeline = this.renderToTexturePipelineData.backFaceCullingPipeline;
                this.renderToTexturePipelineData.bindGroup = this.renderToTexturePipelineData.backFaceCullingBindGroup;
            } else {
                this.renderToTexturePipelineData.pipeline = this.renderToTexturePipelineData.frontFaceCullingPipeline;
                this.renderToTexturePipelineData.bindGroup = this.renderToTexturePipelineData.frontFaceCullingBindGroup;
            }
        }
    }

    render() {
        // Task 2.1: update the camera...
        this.camera.update();

        // Task 2.3: replace the default matrix with the model's transformation matrix
        const modelMatrix = this.model.modelMatrix;
        const uniformArray = new Float32Array([
            // Task 3.6: add the camera's position (including one float for padding) to our uniform buffer
            ...this.camera.position, 0.0,
            ...this.camera.view,
            ...this.camera.projection,
            ...modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();

        // Task 4.1: no longer set the color attachment's view from the current frame's view
        const renderToTexturePass = commandEncoder.beginRenderPass(
            this.renderToTexturePipelineData.attachments
        );
        renderToTexturePass.setPipeline(this.renderToTexturePipelineData.pipeline);
        renderToTexturePass.setBindGroup(0, this.renderToTexturePipelineData.bindGroup);
        renderToTexturePass.setVertexBuffer(0, this.vertexBuffer);
        renderToTexturePass.setIndexBuffer(this.indexBuffer, 'uint16');
        // Task 2.4 draw all of the model's indices
        renderToTexturePass.drawIndexed(this.model.numIndices);
        renderToTexturePass.end();

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
        // Task 2.3: replace the triangle's vertices with our model's vertices
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
        // Task 2.3: replace the triangle's indices with our model's vertices
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
            // Task 3.6: adjust the uniform buffer's size to hold 16 more bytes (12 for our camera's position and 4 for padding)
            size: 208,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Task 2.4 create a depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Task 3.4: create multiple light sources
        const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
        const numLightSources = 20;
        this.pointlightsBuffer = this.device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements * numLightSources,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
        for (let i = 0; i < numLightSources; ++i) {
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
            format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    async #initPipelines() {
        // Task 4.1: split our previous pipeline into two pipelines: one that renders to a texture and another that
        //  takes the rendered texture as an input and outputs it to the canvas
        //  To avoid confusion, we pack each pipeline into helper objects

        // Task 2.3: adapt shader to our new uniform buffer
        const code = await new Loader().loadText('render-to-texture.wgsl');
        const shaderModule = this.device.createShaderModule({code});

        // Task 2.5: add two pipelines: one that culls back faces and one that culls front faces
        const renderToTexturePipelineDescriptorBase = {
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

        const backFaceCullingPipeline = this.device.createRenderPipeline({
            ...renderToTexturePipelineDescriptorBase,
            primitive: {
                cullMode: 'back',
            }
        });

        // Prepare bind group
        const backFaceCullingBindGroup = this.device.createBindGroup({
            layout: backFaceCullingPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 3.3: add storage buffer binding to bind group
                {binding: 3, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        const frontFaceCullingPipeline = this.device.createRenderPipeline({
            ...renderToTexturePipelineDescriptorBase,
            primitive: {
                cullMode: 'front',
            }
        });

        // Prepare bind group
        const frontFaceCullingBindGroup = this.device.createBindGroup({
            layout: frontFaceCullingPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
                // Task 3.3: add storage buffer binding to bind group
                {binding: 3, resource: {buffer: this.pointlightsBuffer}},
            ]
        });

        // Task 4.1: set the view for our render to texture pass to our render texture
        const renderToTextureColorAttachment = {
            view: this.renderTexture.createView(),
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        // Task 2.6: create a depth-stencil attachment
        const renderToTextureDepthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };

        this.renderToTexturePipelineData = {
            pipeline: backFaceCullingPipeline,
            bindGroup: backFaceCullingBindGroup,
            attachments: {
                colorAttachments: [renderToTextureColorAttachment],
                depthStencilAttachment: renderToTextureDepthStencilAttachment,
            },
            backFaceCullingPipeline,
            backFaceCullingBindGroup,
            frontFaceCullingPipeline,
            frontFaceCullingBindGroup,
        };

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

        this.presentToScreenPipelineData = {
            pipeline: presentToScreenPipeline,
            bindGroup: presentToScreenBindgroup,
            attachments: {
                colorAttachments: [presentToScreenColorAttachment],
            }
        }
    }

    stop() {
        super.stop();
        this.camera.dispose();
    }
}