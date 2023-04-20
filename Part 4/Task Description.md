# PART 4: Color Attachments & Compute Shaders

In the final part of our workshop, we'll learn about writing to multiple attachments, using the output of one pipeline in another one and the new first-class citizen for GPU programming in the browser: compute shaders!
Instead of computing everything in one render pipeline, we'll turn our `Workshop` class into a deferred renderer that first stores all parameters necessary to compute the illumination at a pixel into textures.
To compute the actual lighting, we'll use a compute shader. Then we'll use a second render pipeline to present the result to the canvas.
Finally, we'll make things a little more interesting by adding a second compute pipeline to move our light sources around over time.

## Task 4.1: Render to a Texture
As a first step, we'll split our render pipeline into two separate pipelines: one that renders to a texture and another one that renders the resulting texture to the canvas.
To do this, we'll first add a new shader that renders a textured quadrangle covering the whole canvas.
In this shader, we'll store the vertices and texture coordinates directly in the shader, as we've learned in Part 1:
```wgsl
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) texcoord : vec2<f32>,
};

// the vertices and texture coordinates are stored directly in the shader and accessed via their index
const VERTICES: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0,  1.0)
);

const TEXCOORDS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 0.0)
);

@group(0) @binding(0) var uTexture : texture_2d<f32>;
@group(0) @binding(1) var uSampler : sampler;

@vertex
fn vertex(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
    return VertexOutput(
        vec4<f32>(VERTICES[vertex_index], 0.0, 1.0),
        TEXCOORDS[vertex_index],
    );
}

@fragment
fn fragment(@location(0) texcoord : vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSample(uTexture, uSampler, texcoord));
}
```

Our original render pipeline does not care whether the texture view of its color attachment is a view into the texture coming from our canvas, or if it's a texture we created.
We can simply leave the shader as it is.
We'll need to make some changes to our `Workshop` class, however:
* In `#initResources`, create a new texture that has the same dimensions as our canvas, and can be used as both a texture binding and a render attachment.
  We don't care too much about the format for now, so we'll use `this.gpu.getPreferredCanvasFormat()`.
* In `#initPipelines`, set the original render pipeline's color attachment's view to a `GPUTextureView` created from our render texture.
* Since we'll use multiple pipelines in this part of the workshop, optionally store all things we require for encoding our original render pipeline in a helper object for convenience.
  E.g., like so:
```js
    this.renderToTexturePipelineData = {
        pipeline: renderToTexturePipeline,
        bindGroup: renderToTextureBindGroup,
        attachments: {
            colorAttachments: [renderToTextureColorAttachment],
            depthStencilAttachment: renderToTextureDepthStencilAttachment,
        }
    };
```
* Also in `#initPipelines`, create a new shader module, render pipeline, color attachment, and bind group for our new shader.
  Since our new shader uses hard coded vertices and texture coordinates, we don't have to specify a vertex layout.
* Again, to keep things separated, optionally store this in a helper object as well:
```js
this.presentToScreenPipelineData = {
    pipeline: presentToScreenPipeline,
    bindGroup: presentToScreenBindgroup,
    attachments: {
        colorAttachments: [presentToScreenColorAttachment],
    }
}
```
* Finally, encode both render pipelines in our `render` function, one after the other:
```js
const renderToTexturePass = commandEncoder.beginRenderPass(
    this.renderToTexturePipelineData.attachments
);
renderToTexturePass.setPipeline(this.renderToTexturePipelineData.pipeline);
renderToTexturePass.setBindGroup(0, this.renderToTexturePipelineData.bindGroup);
renderToTexturePass.setVertexBuffer(0, this.vertexBuffer);
renderToTexturePass.setIndexBuffer(this.indexBuffer, this.model.indexType);
renderToTexturePass.drawIndexed(this.model.numIndices);
renderToTexturePass.end();

this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
const presentToScreenPass = commandEncoder.beginRenderPass(
    this.presentToScreenPipelineData.attachments,
);
presentToScreenPass.setPipeline(this.presentToScreenPipelineData.pipeline);
presentToScreenPass.setBindGroup(0, this.presentToScreenPipelineData.bindGroup);
// the 6 vertices we are drawing are stored within a constant array in the shader
presentToScreenPass.draw(6);
presentToScreenPass.end();
```

## Task 4.2: Create a G-Buffer
Render pipelines can not only render to a single texture, but also to multiple textures.
In this task, we're going to experiment with multiple color attachments by creating a geometry buffer (G-Buffer) that stores all data we use for computing the color of a pixel.
It will consist of three textures that hold the positions, normals, and albedo for each pixel on screen.

To do this, we'll define three more members in our `FragmentOutput` struct - each with a separate `location`:
```wgsl
struct FragmentOutput {
    @location(0) color: vec4f,
    @location(1) albedo: vec4f,
    @location(2) position: vec4f,
    @location(3) normal: vec4f,
}
```
This also requires us to change the fragment stage of our shader to write to these new locations:
```wgsl
return FragmentOutput(
    color,
    vec4f(albedo, 1.0),
    vec4f(input.position, 1.0),
    vec4f(input.normal, 1.0),
);
```

After adding this new shader, make the necessary changes to our `Workshop` class:
* In `#initResources`, create a G-Buffer with three textures that can be used as render attachments and texture bindings, and have the same dimensions as our canvas:
```js
this.gBuffer = {
    albedo: this.device.createTexture({...}),
    positions: this.device.createTexture({...}),
    normals: this.device.createTexture({...}),
};
```
* In `#initPipelines`, specify that our render pipeline now has four color attachments:
```js
this.device.createRenderPipeline({
    // ...
    fragment: {
        module: createGBufferShaderModule,
        entryPoint: 'fragment',
        targets: [
            {format: this.gpu.getPreferredCanvasFormat(),},
            {format: this.gpu.getPreferredCanvasFormat(),},
            {format: this.gpu.getPreferredCanvasFormat(),},
            {format: this.gpu.getPreferredCanvasFormat(),},
        ],
    },
    // ...
});
```
* Add the new color attachments of our pipeline and store them in our helper object:
```js
const createGBufferColorAttachments = [
    renderToTextureColorAttachment,
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

this.createGBufferPipelineData = {
    // ...
    attachments: {
        colorAttachments: createGBufferColorAttachments,
        depthStencilAttachment: renderToTextureDepthStencilAttachment,
    },
    // ...
};
```
* To see if our G-Buffer pipeline works correctly, create a bind group for each of the G-Buffer's textures for the final pipeline rendering to the canvas and store them in the pipeline's helper object:
```js
    const presentToScreenAlbedoBindgroup = this.device.createBindGroup({
        layout: presentToScreenPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: this.gBuffer.albedo.createView()},
            {binding: 1, resource: this.sampler},
        ]
    });
    const presentToScreenPositionsBindgroup = this.device.createBindGroup({...});
    const presentToScreenNormalsBindgroup = this.device.createBindGroup({...});
```
* Choose one of the bind groups as the default bind group (we'll stick to the texture used in the previous task in our reference implementation).
* Finally, add some user inputs to switch between the different attachments. E.g., using the `key` method of our `Workshop` class, to react to keyboard events:
```js
key(type, keys) {
    if (type === 'up') {
        // ...
        if (keys.includes('a') || keys.includes('A')) {
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
```

## Task 4.3: Compute Illumination in a Compute Shader
Our uniform buffer, G-Buffer, and storage buffer contain all information we need to compute the illumination for a pixel.
Instead of computing the illumination in the fragment shader directly, we can defer these computations to a later point in time.
This is called [deferred shading](https://en.wikipedia.org/wiki/Deferred_shading).
Evaluating illumination models often is computationally expensive.
This can become a problem in complex scenes with lots of overdraw, i.e., where illumination is unnecessarily computed for triangles that are in the end not visible on screen because another triangle is actually closer to the camera.
Deferred shading tackles this problem by decoupling lighting computations from the scene complexity.

Since, our little scene is not very complex, and we won't gain anything from switching from forward to deferred shading.
But it gives us an excuse to show of compute shaders and multiple render attachments.
It also gives you a setup you can come back to for experimenting with screen-space effects, like SSAO or screen-space reflections, after the workshop is done.

First, create a new shader for this task. Simply move all lighting-related struct definitions, constants and functions for computing the illumination to the new shader.
Then add its bindings. It needs our whole G-Buffer, our uniform and storage buffers.
Additionally, it needs a texture to store the final colors of our beautifully lit pixels - a [storage texture](https://www.w3.org/TR/WGSL/#texture-storage).
In WGSL, a 2D storage texture needs to be defined as `texture_storage_2d` and have an explicit format - we'll use `rgba8unorm` - and an access mode (`read`, `write`, and `read_write`).
Our complete bindings look like this:
```wgsl
// G-Buffer
@group(0) @binding(0) var gAlbedo : texture_2d<f32>;
@group(0) @binding(1) var gPositions : texture_2d<f32>;
@group(0) @binding(2) var gNormals : texture_2d<f32>;

// uniforms & light sources
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read> uLights : array<PointLight>;

// output texture
@group(0) @binding(5) var output : texture_storage_2d<rgba8unorm, write>;
```

Like vertex and fragment shader stages, a compute shader stage needs an entry point annotated with `@compute` attribute.
While vertex and fragment shaders are invoked via draw calls, compute shaders are invoked via dispatching workgroups.
Each workgroup in a dispatch starts [a number of threads](https://www.w3.org/TR/webgpu/#dom-supported-limits-maxcomputeinvocationsperworkgroup) that is defined in the shader.
Each thread has a local id that uniquely identifies it within the workgroup, as well as a global id that uniquely identifies it within all workgroups.
The strategy used to assign thread ids is defined in the shader, using the [required `@workgroup_size(x[,y[,z]])` entry point attribute](https://www.w3.org/TR/WGSL/#entry-point-attributes).
For example, you can imagine that the local invocation id for each thread in a workgroup is computed like this:
```wgsl
for (var x = 0; x < workGroupSize.x; ++x) {
    for (var y = 0; y < workGroupSize.y; ++y) {
        for (var z = 0; z < workGroupSize.z; ++z) {
            const local_invocation_id = vec3u(x, y, z);
        }
    }
}
```

In our compute shader, we'll spawn a thread for each pixel in the storage texture and use the thread's global id to determine which pixel it should process.
A thread's global id can be accessed in the shader via the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values).
To get x and y coordinates for each thread, we thus have to define a 2D workgroup size, e.g.:
```wgsl
@workgroup_size(16, 16) // each workgroup can have at most 256 threads
```

With a workgroup size of `16x16`, we have to dispatch `(textureWidth / 16) * (textureHeight / 16)` workgroups to process the whole texture.
It would be nice to not have to hard code this into both the shader and the JavaScript file.
Luckily, there is the WGSL / WebGPU concept of [override declarations](https://www.w3.org/TR/WGSL/#override-decls) to defined contant values in shaders that can be overridden by a pipeline at creation time:
```wgsl
override WORKGROUP_SIZE_X: u32 = 16;
```

Now that we know a bit about workgroups, workgroup sizes, and override constants, it is time to define the entry point to our compute shader:
```wgsl
override WORKGROUP_SIZE_X: u32 = 16;
override WORKGROUP_SIZE_Y: u32 = 16;

@compute
@workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let output_size = vec2u(textureDimensions(output));

    // terminate the thread if its global id is outside the output texture's bounds
    if output_size.x <= global_id.x || output_size.y <= global_id.y {
        return;
    }
    
    // here we'll compute the lighting for a pixel

    let albedo = textureLoad(gAlbedo, global_id.xy, 0).rgb;
    let position = textureLoad(gPositions, global_id.xy, 0).xyz;
    let normal = textureLoad(gNormals, global_id.xy, 0).xyz;

    if all(albedo == vec3f()) {
        textureStore(output, global_id.xy, vec4f(vec3f(), 1.0));
    } else {
        var color = AMBIENT_LIGHT;
        for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
            color += compute_lighting(position, normal, albedo, i);
        }
        textureStore(output, global_id.xy, vec4f(color, 1.0));
    }
}
```


In our JavaScript file, make the following changes:
* In order for our compute shader to store its results in our render texture, we need to adjust two things: it needs the `STORAGE_BINDING` usage bit set, and it needs to use a format that supports storage textures:
```js
    this.renderTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
```
* In `#initPipelines`, create a compute pipeline using our new shader:
```js
    const deferredShadingShaderCode = await Loader.loadShaderCode('deferred-shading.wgsl');
    const deferredShadingShaderModule = this.device.createShaderModule({code: deferredShadingShaderCode});
    const deferredShadingPipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: deferredShadingShaderModule,
            entryPoint: 'compute',
        },
    });
```
* Then create the corresponding bind group ...
* ... and store everything in a helper object (make sure the `workGroupSize` matches the `@workgroup_size` in the shader):
```js
    this.deferredShadingPipelineData = {
        pipeline: deferredShadingPipeline,
        bindGroup: deferredShadingBindGroup,
        workGroupSize: {
            x: 16,
            y: 16,
        }
    }
```
* Set the default bind group of the pipeline presenting to the canvas to a bind group using a view into our render texture.
* In `render`, encode the compute pipeline after the render pipeline creating the G-Buffer and before the pipeline rendering to the canvas:
```js
    const gBufferPass = commandEncoder.beginRenderPass(this.createGBufferPipelineData.attachments);
    // ...
    gBufferPass.end();

    const deferredShadingPass = commandEncoder.beginComputePass();
    deferredShadingPass.setPipeline(this.deferredShadingPipelineData.pipeline);
    deferredShadingPass.setBindGroup(0, this.deferredShadingPipelineData.bindGroup);
    deferredShadingPass.dispatchWorkgroups(
        Math.ceil(this.canvas.width / this.deferredShadingPipelineData.workGroupSize.x),
        Math.ceil(this.canvas.height / this.deferredShadingPipelineData.workGroupSize.y),
    );
    deferredShadingPass.end();
    
    this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
    // ...
    presentToScreenPass.end();
```
* Finally, add a new keyboard input, to switch between textures.

## Task 4.4: Animate Light Sources in a Compute Shader
In our final task, we'll add yet another compute shader to animate our light sources.

First, add a new compute shader that reads from and writes to our storage buffer:
```wgsl
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}

const DOWN: u32 = 0u;
const UP: u32 = 1u;

const MOVEMENT_SPEED = 0.005;

@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;

@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let num_lights = arrayLength(&uLights);

    // terminate the thread if its global id is outside the light buffer's bounds
    if num_lights < global_id.x {
        return;
    }

    if uLights[global_id.x].direction == DOWN {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y - MOVEMENT_SPEED;
        if uLights[global_id.x].position.y < -0.5 {
            uLights[global_id.x].direction = UP;
        }
    } else {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y + MOVEMENT_SPEED;
        if uLights[global_id.x].position.y > 0.5 {
            uLights[global_id.x].direction = DOWN;
        }
    }
}
```
Feel free to experiment with different movement patterns.

In our JavaScript file, we'll make the following changes:
* If you haven't done so already, store the number of light sources in the `Workgroup` instance.
* In `#initRenderPipelines`, create a new compute pipeline and a corresponding bind group and store them both in a helper object:
```js
    this.animateLightsPipelineData = {
        pipeline: animateLightsPipeline,
        bindGroup: animateLightsBindGroup,
        workGroupSize: {
            x: 64,
        }
    }
```
* Finally, in `render` encode our new compute pipeline:
```js
    const animateLightsPass = commandEncoder.beginComputePass();
    animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
    animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
    animateLightsPass.dispatchWorkgroups(
        Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
    );
    animateLightsPass.end();
```
