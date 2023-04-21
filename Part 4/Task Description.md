# PART 4: Color Attachments & Compute Shaders

In the final part of our workshop, we'll get to know the shiny new first-class citizen for GPU programming in the browser: compute shaders!
We'll use a compute pipeline to animate the light sources in our scene. Then, as a bonus, we'll take a look at offscreen rendering, rendering into
multiple attachments, and finally also deferred shading.

## Task 4.1: Animate Light Sources in a Compute Shader
In Part 3, we've created a storage buffer to pass our light sources to the GPU. This will come in handy now, as we're
going to use a compute shader to change positions of our light sources.

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

In our compute shader, we'll spawn a thread for each light source in the storage buffer and use the thread's global id to determine which light source it should process.
A thread's global id can be accessed in the shader via the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values).
Since our storage buffer contains a 1D array, we'll only specify a 1D workgroup size, and use the x component of the `global_invocation_id`:
```wgsl
@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let thread_id = global_id.x;
}
```

With a workgroup size of `64`, we have to dispatch `numLightSources / 64` workgroups on the JavaScript side to spawn one thread per light source.
It would be nice to not have to hard code this into both the shader and the JavaScript file.
Luckily, there is the WGSL / WebGPU concept of [override declarations](https://www.w3.org/TR/WGSL/#override-decls) to define contant values in shaders that can be overridden by a pipeline at creation time:
```wgsl
override WORKGROUP_SIZE: u32 = 64;
```

When we create a pipeline using this shader, we can use the `override` constants name to override it in the shader stage's descriptor object, eg.:
```js
{
    module: shaderModule,
    entryPoint: 'compute',
    constants: {
      WORKGROUP_SIZE: 128,
    },
}
```

Now that we know a bit about workgroups, workgroup sizes, and override constants, it is time to define the entry point to our compute shader:

First, add a new compute shader that reads from and writes to our storage buffer.
Simply copy the `PointLight` struct definition and add a new `direction` member (`u32`).
Because of the [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size) we still have a 32-bit chunk of memory in each of our point lights left, so we won't need to change the buffer's size after adding this new member.
```wgsl
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}
```

Our compute shader only uses a single buffer binding: the storage buffer containing our light sources:
```wgsl
@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;
```

We'll then add a compute shader entry point using an override constant to specify the workgroup size:
```wgsl
override WORKGROUP_SIZE: u32 = 64;

@compute
@workgroup_size(WORKGROUP_SIZE)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {    
    // we'll move the light sources around in here
}
```

Each workgroup will have `WORKGROUP_SIZE` threads. However, it might be that the number of light sources is not divisible
by the `WORKGROUP_SIZE`. In that case, some threads will have a `global_invocation_id` that is out of bounds for our
light source buffer. To avoid out-of-bounds array accesses, we'll add a safe-guard to our compute shader:
```wgsl
@compute
@workgroup_size(WORKGROUP_SIZE)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let num_lights = arrayLength(&uLights);

    // terminate the thread if its global id is outside the light buffer's bounds
    if num_lights <= global_id.x {
        return;
    }
    
    // we'll move the light sources around in here
}
```

Now we'll move the light sources up and down between minimum and maximum y coordinates of 0 and 1:
```wgsl
const DOWN: u32 = 0u;
const UP: u32 = 1u;

const MOVEMENT_SPEED = 0.005;

// ...

@compute
@workgroup_size(WORKGROUP_SIZE)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    // ...
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

In our `Workshop` class, we'll make the following changes:
* If you haven't done so already, store the number of light sources in the `Workgroup` instance.
* In `#initRenderPipelines`, create a new compute pipeline:
```js
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
```
* Then add a bind group for our new pipeline:
```js
const animateLightsBindGroup = this.device.createBindGroup({
    layout: animateLightsPipeline.getBindGroupLayout(0),
    entries: [
        {binding: 0, resource: {buffer: this.pointlightsBuffer}},
    ]
});
```
* Since we'll use multiple pipelines in this part of the workshop, store pipeline-related data in a helper object for convenience:
```js
this.animateLightsPipelineData = {
    pipeline: animateLightsPipeline,
    bindGroup: animateLightsBindGroup,
    workGroupSize:  animateLightsWorkGroupSize,
}
```
* Finally, in `render` encode our new compute pipeline before submitting the command encoder to the queue:
```js
const animateLightsPass = commandEncoder.beginComputePass();
animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
animateLightsPass.dispatchWorkgroups(
    Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
);
animateLightsPass.end();
```

And that's it! You've made your first steps in the world of WebGPU compute shaders.

## Task 4.2 (bonus): Render to a Texture
Next we're going to experiment with multiple render targets. As a first step, we'll split our render pipeline into two
separate pipelines: one that renders to a texture and another one that renders the resulting texture to the canvas.
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
* In `#initPipelines`, set the original render pipelines' color attachment's view to a `GPUTextureView` created from our render texture.
* Store all things we require for encoding our original render pipeline in a helper object for convenience:
```js
this.renderToTexturePipelineData = {
    pipeline: backFaceCullingPipeline,
    bindGroup: renderToTextureBindGroup,
    attachments: {
        colorAttachments: [renderToTextureColorAttachment],
        depthStencilAttachment: renderToTextureDepthStencilAttachment,
    },
    backFaceCullingPipeline,
    frontFaceCullingPipeline,
};
```
* Also in `#initPipelines`, create a new shader module, render pipeline, color attachment, and bind group for our new shader.
  Since our new shader uses hard coded vertices and texture coordinates, we don't have to specify a vertex layout:
```js
const presentToScreenPipeline = this.device.createRenderPipeline({
    layout: 'auto',
    vertex: {
        module: presentToScreenShaderModule,
        entryPoint: 'vertex',
    },
    fragment: {
        module: presentToScreenShaderModule,
        entryPoint: 'fragment',
        targets: [{ format: this.gpu.getPreferredCanvasFormat() }],
    },
});
```
* Again, to keep things separated, store this in a helper object as well:
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

## Task 4.3 (bonus): Create a G-Buffer
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
* In `#initResources`, create a G-Buffer with three textures that can be used as render attachments and texture bindings, and have the same dimensions as our canvas.
  However, for our positions and normals, we'll need a float format to store negative values and have a little more precision: `rgba16float`
```js
this.gBuffer = {
    albedo: this.device.createTexture({...}),
    positions: this.device.createTexture({
      // ...
      format: 'rgba16float',
    }),
    normals: this.device.createTexture({
      format: 'rgba16float'
    }),
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
            {format: 'rgba16float',},
            {format: 'rgba16float',},
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

## Task 4.4 (bonus): Compute Illumination in a Compute Shader
Our uniform buffer, G-Buffer, and storage buffer contain all information we need to compute the illumination for a pixel.
Instead of computing the illumination in the fragment shader directly, we can defer these computations to a later point in time.
This is called [deferred shading](https://en.wikipedia.org/wiki/Deferred_shading).
Evaluating illumination models often is computationally expensive.
This can become a problem in complex scenes with lots of overdraw, i.e., where illumination is unnecessarily computed for triangles that are in the end not visible on screen because another triangle is actually closer to the camera.
Deferred shading tackles this problem by decoupling lighting computations from the scene complexity.

Since, our little scene is not very complex, and we won't gain anything from switching from forward to deferred shading.
But it gives us an excuse to show off compute shaders with 2D workgroup sizes and multiple render attachments.
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

We'll spawn one thread per pixel in our storage texture. Each thread will process exactly one pixel.
To get x and y´ coordinates for each thread, we thus have to define a 2D workgroup size, e.g.:
```wgsl
@workgroup_size(16, 16) // each workgroup can have at most 256 threads
```

With a workgroup size of `16x16`, we have to dispatch `(textureWidth / 16) * (textureHeight / 16)` workgroups to process the whole texture.
We'll use override constants again to control the workgroup size in from the JavaScript side.
Our compute entry point looks like this:
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
}
```

All we need to do now is to actually compute the lighting and store the results in our storage texture using the [built-in `textureStore` function](https://www.w3.org/TR/WGSL/#texturestore).
Since our render texture will not be cleared automatically anymore, we'll need to do that ourselves.
Add the following lines to the entry point of our compute shader:
```wgsl
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
```

Now that we've set up our compute shader, remove the first render target and the light source buffer from our original shader:
```wgsl
struct FragmentOutput {
    @location(0) albedo: vec4f,
    @location(1) position: vec4f,
    @location(2) normal: vec4f,
}

// ...

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

// ...

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    // Task 4.3: only output G-Buffer
    return FragmentOutput(
        textureSample(uTexture, uSampler, input.texcoord),
        vec4f(input.position, 1.0),
        vec4f(input.normal, 1.0),
    );
}
```

We're almost done! We just need to make some changes to our `Workshop` class:
* In order for our compute shader to store its results in our render texture, we need to adjust two things: it needs the `STORAGE_BINDING` usage bit set, and it needs to use a format that supports storage textures:
```js
this.renderTexture = this.device.createTexture({
    size: [this.canvas.width, this.canvas.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
});
```
* In `#initPipelines`, adjust the bind group layout for our first render pass: our uniform buffer no longer needs to be visible from the fragment stage, and the storage buffer is not used at all anymore.
* Then remove the storage buffer from the corresponding bind group.
* Also remove the render texture from the render pipeline's render targets and color attachments.
* In `#initPipelines`, create a compute pipeline using our new shader with the appropriate override constants:
```js
const deferredShadingShaderCode = await Loader.loadShaderCode('deferred-shading.wgsl');
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
          WORKGROUP_SIZE_X: deferredShadingWorkGroupSize.x,
          WORKGROUP_SIZE_Y: deferredShadingWorkGroupSize.y
        },
    },
});
```
* Then create the corresponding bind group ...
```js
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
```
* ... and store everything in a helper object:
```js
this.deferredShadingPipelineData = {
    pipeline: deferredShadingPipeline,
    bindGroup: deferredShadingBindGroup,
    workGroupSize: deferredShadingWorkGroupSize,
}
```
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

Congratulations! You've mastered WebGPU compute shaders!

