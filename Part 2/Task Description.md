# PART 2: 3D & Interactivity

In the second part, we'll leave the simple triangle behind us and step into 3D rendering.
We'll extend our knowledge from Part 1 to load and render a 3D model, and to pass user input to shaders.
Finally, we'll learn about depth testing and culling modes.

For the remainder of the workshop, we'll use a small framework to structure our code.
We took the liberty to refactor our code from Part 1 to make the transition as smooth as possible.

## Task 2.0: Get to know the Framework

Our little framework provides a `Sample` class, which takes care of setting up WebGPU and requesting animation frames.
It has the following two lifecycle functions that are called by its static `run` method:
* `async init() {}`: this is called at initialization time and the place where we'll load our shaders, and set up textures, buffers and pipelines.
* `render(deltaTime = 0.0) {}`: this is called once per frame. Here, we'll update uniform buffers, and encode render and compute passes.
  
To react to keyboard inputs, the `Sample` class provides the `key(type, key)` convenience function.

The `Sample` class also stores the following objects to provide easy access to the GPU and canvas:
* `adapter`: the [GPUAdapter](https://www.w3.org/TR/webgpu/#gpuadapter)
* `device`: the [GPUDevice](https://www.w3.org/TR/webgpu/#gpudevice)
* `canvas`: the [HTMLCanvasElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement)
* `context`: the [GPUCanvasContext](https://www.w3.org/TR/webgpu/#canvas-context)
* `gpu`: the [GPU](https://www.w3.org/TR/webgpu/#gpu-interface)
* `gui`: a [dat.GUI object](https://github.com/dataarts/dat.gui/blob/master/API.md) to add and control GUI elements

To make the transition a little easier, we've refactored the code from Part 1 into the structure of our framework.
You can find the in the `workshop.js` file in the project's root folder.
Here, we define a `Workshop` class that extends the `Sample` class:

```js
// workshop.js
import { Sample } from './common/framework/sample.js';

class Workshop extends Sample {
    async init() {...}
    render() {...}
    async #initResources() {...}
    async #initPipelines() {...}
}
```

It all starts in the asynchronous `init` function:
```js
async init() {
    // ... GUI elements, etc. 
    await this.#initResources();
    await this.#initPipelines();
}
```
We've moved the creation of all resources, like buffers and textures, to the private `#initResources` method of our `Workshop` class.
The code is the same as in Part 1, but instead of storing buffers and textures globally, we store them in the `Workshop` instance:
```js
async #initResources() {
    this.vertexBuffer = this.device.createBuffer({...});
    this.indexBuffer = this.device.createBuffer({...});
    this.sampler = this.device.createSampler({...});
    this.texture = this.device.createTexture({...});
    this.uniformBuffer = this.device.createBuffer({...});
}
```

Similarly, we store all information that's relevant for our render pipeline, like the pipeline, its bind group and color attachment, in the `Workshop` instance.
We create these objects in the private `#initPipelines` method of our `Workshop` class:
```js
async #initPipelines() {
    this.pipeline = this.device.createRenderPipeline({...});
    this.bindGroup = this.device.createBindGroup({...});
    this.colorAttachment = {...};
}
```

The actual rendering is done in the `render` method of our `Workshop` class:
```js
render() {
    const commandEncoder = this.device.createCommandEncoder({...});
    this.colorAttachment.view = this.context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({...});
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
    renderPass.drawIndexed(3);
    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
}
```

We kick off our render loop by running the `Workshop` class from our HTML file:
```js
<script type="module">
    import { Workshop } from './workshop.js';

    const viewport = document.getElementById('viewport');
    const canvas = document.getElementById('webGpuCanvas');
    canvas.width = viewport.clientWidth;
    canvas.height = viewport.clientHeight;
    const guiDiv = document.getElementById('gui');

    Workshop.run(canvas, guiDiv).catch(error => {
        console.error(error);
        alert(`Unrecoverable error. Please check the console for details.`);
    });
</script>
```

## Task 2.1: Add a Camera
Now that we're familiar with the lifecycle methods of our framework, we'll make the step into 3D!
The first thing we have to do, is adding a camera to both our JavaScript file and our shader.

In computer graphics, a camera is usually used to perform two important transformations:
* The transformation of objects from a common world space to its own space - often called view space - via its view matrix.
  You can imagine that as a change of perspective.
* The transformation of objects in this view space to clip space via its projection matrix.

In this task we'll have our first encounter with WGSL's [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size).
Because of how alignment of structure members works in WGSL, determining the actual size of a struct, or the offset of a
struct member can be a bit unintuitive. As a rule of thumb, you should not run into any troubles when using only `vec4`s,
`mat4x3`s, or `mat4x4`s. In this workshop, we won't go into detail on these rules and rather give you the offsets you
need to complete the tasks directly, but if you're interested or run into alignment issues you can use [this webpage to visualize your struct's memory layout (copy your structs to the editor on the left and press the 'process' button)](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001004401000000000000003d88886237289d13c4320e1a9be64fe4a78fb96670092e7293afb01bb39d4ef043f85b8441ccb0c4f3bec387b0210178c493391e81f8e0280b1ea96dad00327381a4ea82cb963b352506ee858336af7fb0a2b5383499ac0ab4678de4a030f0309b1f2607cfdb712f5e1947bdb0d62e8806a9b310a5cad8d268b67d720b0cad38eb4343ffd8dacbfd9ff63459a0c380e0bff67af4e9a55921a83f2222a0d98fea36dd8726c396bfc3a2e0e53ffeeb39ff)

We'll start with the shader:
* Add a `Camera` struct consisting of two `mat4x4<f32>`, the camera's `view` and `projection` matrices:
```wgsl
struct Camera {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}
```
* Add a member of type `Camera` to the `Uniforms` struct.
  **Note that with two 4x4 matrices and a single 2D vector, we enter the realm of [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size) because of which our `vec2` has an implicit size of a `vec4`:**
```wgsl
struct Uniforms {
    camera: Camera,
    translation: vec2f, // + 8 bytes as implicit padding
}
```
* In the vertex stage of the shader, use the camera's matrices to transform the vertex position to clip space, e.g., like so:
```wgsl
fn vertex(input: VertexInput) -> VertexOutput {
    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * vec4<f32>(input.position + uniforms.offset, 0, 1),
        input.texcoord,
    );
}
```

The shader now expects two matrices to be in the `Uniforms` struct, so we need to adjust the `Workshop` class as well:
* In the `#initResources` methods, adjust the uniform buffer's size to hold two more matrices **and implicitly also an extra `vec2` worth of padding because of [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size)**. Each `mat4x4<f32>` consists of 16 floats and a `vec2<f32>` has 8 bytes, so our buffer should have a size of `8 + 8 + 2 * 16 * Float32Array.BYTES_PER_ELEMENT` bytes.
* Import the `OrbitCamera` class from `./common/engine/util/orbit-camera.js` ...
* ... and create a camera instance in the `init` method of our `Workshop` class:
```js
async init() {
    // An OrbitCamera takes an HTML element as input, which it uses to register user input
    this.camera = new OrbitCamera(this.canvas);
    ...
}
```
* Within our render function, call the camera's `update` method. The `OrbitCamera` class processes user inputs through events triggered on the canvas. The `update` method commits these inputs to the camera's `view` matrix.
* Finally, we need to upload the camera's matrices to the shader by writing them to our uniform buffer, e.g., like so:
```js
const uniformArray = new Float32Array([
    ...this.camera.view,
    ...this.camera.projection,
    ...this.offset,
    0, 0 // padding
]);
this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);
```

Now we have a user controlled camera that lets us view our textured triangle in 3D!
To control the camera, we can:
* Click and drag the mouse over the canvas to rotate around the triangle.
* Scroll the mouse wheel to zoom in and out.

## Task 2.2: Adjust the Vertex Layout
With a camera we can view our triangle in 3D, but a triangle isn't all that interesting.
In this task, we'll prepare our shader and `Workshop` class to render 3D models instead.

We'll start with the shader:
* Adjust the `VertexInput` struct to hold a three-dimensional position and a normal:
```wgsl
struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}
```
* Add the normal to our `VertexOutput` and `FragmentInput` structs:
```wgsl
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,         // <- normals are at location 0
    @location(1) texcoord: vec2f,       // <- texcoords are at location 1
}

struct FragmentInput {
    @location(0) normal: vec3f,     // <- normals are at location 0
    @location(1) texcoord: vec2f,   // <- texcoords are at location 1
}
```
* Instead of an offset, we'll now pass a transformation matrix to the shader:
```wgsl
struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
}
```
* In the vertex stage, pass the vertexes normal vector to the fragment stage:
```wgsl
fn vertex(input: VertexInput) -> VertexOutput {
    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * uniforms.model * vec4<f32>(input.position, 1),
        normalize((uniforms.model * vec4f(input.normal, 0)).xyz),
        input.texcoord,
    );
}
```

Now that we've changed the shader, it no longer matches our setup in the `Workshop` class, so we need to make some changes there as well:
* Remove the GUI and offset related code within init - we don't need it anymore.
* Import `mat4` from `./lib/gl-matrix-module.js`.
* In `#initResources`, add a third component to vertex positions 3D and add a 3D normal vector to each vertex:
```js
const vertices = new Float32Array([
    // top vertex
    0.0, 0.5, 0.0,      // position
    0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
    0.5, 1.0,           // texture coordinates
    // left vertex
    -0.5, -0.5, 0.0,    // position
    0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
    0.0, 0.0,           // texture coordinates
    // right vertex
    0.5, -0.5, 0.0,     // position
    0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
    1.0, 0.0,           // texture coordinates
]);
```
* Also in `#initResources`, change the size of the uniform buffer to hold three `mat4x4<f32>`: `3 * 16 * Float32Array.BYTES_PER_ELEMENT`
* In `#initPipelines`, adjust the vertex layout of our render pipeline:
```js
// ...
vertex: {
    // ...
    buffers: [
        {
            attributes: [
                {   // position
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x3',
                },
                {   // normal
                    shaderLocation: 1,
                    offset: 12,
                    format: 'float32x3',
                },
                {   // texcoords
                    shaderLocation: 2,
                    offset: 24,
                    format: 'float32x2',
                }
            ],
            arrayStride: 32, // = 12 + 12 + 8
        },
    ],
},
// ...
```
* Finally, instead of a 2D offset, pass a transformation matrix to our uniform buffer in `render`:
```js
    const modelMatrix = mat4.create(1.0); // this creates the identity matrix in gl-matrix
    const uniformArray = new Float32Array([
        ...this.camera.view,
        ...this.camera.projection,
        ...modelMatrix
    ]);
```

We don't see any optical changes in this task, but we've set the stage for 3D objects!

## Task 2.3: Load and Render a 3D Model
Now that we have prepared everything to render 3D models, the time has finally come to do so:
* Import the `Model` class from `./common/engine/util/model.js`. The `Model` class has some helper functions to create vertex and index buffers and get meta data such as the number of vertex indices.
* Import the `Vertex` helper class from `./common/engine/core/mesh.js`.
* In `init`, create an instance of the `Model` class from a 3D model we'll load using the ominous `assetLoader` lurking around our `init` function:
```js
async init() {
    this.model = new Model(await this.assetLoader.loadModel('models/bunny.json'));
    // ...
}
```
* In `#initResources`, replace the triangle's vertex and index buffers with the model's:
```js
    this.vertexBuffer = this.model.createVertexBuffer(this.device);
    this.indexBuffer = this.model.createIndexBuffer(this.device);
```
* In `render`, write the model's transformation matrix to the uniform buffer:
```js
    const modelMatrix = this.model.modelMatrix;
    const uniformArray = new Float32Array([
        ...this.camera.view,
        ...this.camera.projection,
        ...modelMatrix
    ]);
```
* In `render`, make sure to use the correct index type (**the `Model` class uses `'uint32'`!**) and number of indices for drawing the model:
```js
renderPass.setIndexBuffer(this.indexBuffer, this.model.indexType); // = 'uint32'
renderPass.drawIndexed(this.model.numIndices);
```
* Optionally, use the `vertexLayout` provided by the `Vertex` class (import from `./common/engine/core/mesh.js`) when creating our render pipeline in `#initPipelines`:
```js
// ...
vertex: {
    // ...
    buffers: [Vertex.vertexLayout()],
},
// ...
```

## Task 2.4: Add a Depth Buffer
While we now see a 3D model, something still isn't right here: it looks as if we can see inside the 3D object.
The reason for this is that we haven't enabled depth testing.
This leads to triangles being ordered incorrectly, when we draw multiple triangles at the same location.
Luckily, the fix for this problem is relatively easy: we just need to create a depth buffer and enable depth testing for our render pipeline:
* In `#initResources`, create a depth buffer. A depth buffer is just a texture with a [format that allows depth testing](https://www.w3.org/TR/webgpu/#depth-formats) and the [RENDER_ATTACHMENT texture usage](https://www.w3.org/TR/webgpu/#dom-gputextureusage-render_attachment):
```js
    this.depthTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
```
* In `#initPipelines`, add a [GPUDepthStencilState](https://www.w3.org/TR/webgpu/#dictdef-gpudepthstencilstate) to our render pipeline descriptor:
```js
this.pipeline = this.device.createRenderPipeline({     
    // ...
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',   // we want triangles that are closer to the camera to override triangles that are further away
        format: 'depth24plus',
    }
});
```
* Also in `#initPipelines`, prepare the depth-stencil attachment for subsequent `render` calls:
```js
this.depthStencilAttachment = {
    view: this.depthTexture.createView(),   // we'll use our depthTexture as depth-stencil attachment
    depthClearValue: 1.0,                   // at the start of the render pass, the depth buffer is initilized to 1.0 in each pixel
    depthLoadOp: 'clear',                   // at the start of the render pass, the depth buffer is cleared using `depthClearValue`
    depthStoreOp: 'discard',                // at the end of the render pass, the depth buffer can be discarded, meaning that we do not care what happens to the values stored in the depth buffer after the pass
};
```
* In `render`, add the depth-stencil attachment to the render pass via the `depthStencilAttachment` member of the [GPURenderPassDescriptor](https://www.w3.org/TR/webgpu/#dictdef-gpurenderpassdescriptor).

## Task 2.5: Set a Culling Mode
With depth testing enabled, the bunny now gets rendered correctly.
However, when we zoom in too far, we can see the inside of our bunny.
Depending on your application, this might not be what you want.
In this task we'll look into culling modes and how they can fix this issue.

We'll create two separate pipelines which both use the same shader, and use keyboard inputs to switch between the two.
The culling mode for a render pipeline is set at creation time using the `primitive` member of the [GPURenderPipelineDescriptor](https://www.w3.org/TR/webgpu/#dictdef-gpurenderpipelinedescriptor) object:
```js
device.createRenderPipeline({
    // ...
    primitive: {
        cullMode: 'back', // possible values: 'none' (default), 'back', 'front'
        // ...
    }
});
```
The `primitive` member has the type [GPUPrimitiveState](https://www.w3.org/TR/webgpu/#dictdef-gpuprimitivestate) which has a bunch of other options to define the primitives, i.e., the triangles, lines, or points, the render pipeline will draw.
For example, it defines the way a front facing triangle is defined by the pipeline
In this workshop we'll stick to the defaults for everything except the culling mode, but feel free to experiment with other options.

Up until now, we've let WebGPU determine the pipeline and bind group layouts automatically.
This has the drawback that bind groups created from this automatically determined layout can only be used with this specific pipeline.
With two pipelines that are so similar that they only differ in their culling mode, it makes sense to define these layouts explicitly so that we can use one bind group for both pipelines.
Bind group layout creating is simple. We just have to look at the bindings defined in our shader and in what shader stages the individual bindings are used in and describe them in a bind group layout descriptor object:
```js
const bindGroupLayout = this.device.createBindGroupLayout({
    entries: [
        // @group(0) @binding(0) var<uniform> uniforms : Uniforms;
        {
            binding: 0,
            // we only use this binding in the vertex stage
            visibility: GPUShaderStage.VERTEX,
            buffer: {},
        },
        // @group(0) @binding(1) var uTexture : texture_2d<f32>;
        {
            binding: 1,
            // we only use this binding in the fragment stage
            visibility: GPUShaderStage.FRAGMENT,
            texture: {},
        },
        // @group(0) @binding(2) var uSampler : sampler;
        {
            binding: 2,
            // we only use this binding in the fragment stage
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {},
        }
    ]
});
```

To create a pipeline layout, we simply pass an array containing all bind group layouts required for the pipeline in the pipeline layout descriptor object when creating the layout:
```js
const pipelineLayout = this.device.createPipelineLayout({
    bindGroupLayouts: [
        bindGroupLayout, // @group 0
    ]
});
```

For this task...
* In `#initPipelines`, create a bind group layout matching the bindings in our shader.
* In `#initPipelines`, create a bind group using the bind group layout created in the first step:
```js
this.bindGroup = this.device.createBindGroup({
    layout: bindGroupLayout, // <- use the explicitly created bind group layout instead of pipeline.getBindGroupLayout(0)
    // ...
});
```
* In `#initPipelines`, create a pipeline layout using the bind group layout created in the first step.
* In `#initPipelines`, create a pipeline that culls back faces and store it in the `Workshop` instance:
```js
this.backFaceCullingPipeline = this.device.createRenderPipeline({
    layout: pipelineLayout, // <- no longer 'auto' but the pipeline layout explicitly defined by us
    primitive: {
        cullMode: 'back',
    },
    // ...
});
```
* In `#initPipelines`, create a pipeline that culls front faces and store it in the `Workshop` instance.
* In `#initPipelines`, store one pipeline as the default pipeline in the `Workshop` instance.
* Switch between pipelines on keyboard inputs, e.g., using the `key` method of our `Workshop` class:
```js
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
```

