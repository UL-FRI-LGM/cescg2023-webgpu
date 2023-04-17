# PART 2: 3D & Interactivity

In the second part, we'll leave the simple triangle behind us and step into 3D rendering.
We'll extend our knowledge from Part 1 to pass user input to shaders.
Finally, we'll learn about depth testing and culling.

For the remainder of the workshop, we'll use a small framework to structure our code.
We took the liberty to refactor our code from Part 1 to use this framework.

## Task 2.0: Get to know the Framework

We refactored the code from Part 1 to use our little framework.

TODO: participants will probably copy this from somewhere in the project structure

We use the `Sample` class as a base for all tasks to come.
It provides some lifecycle functions that are called by
It has the following important methods:
```js
class Sample {
    /**
     * Called at 
     */
    async init();
    render();
    mouse();
    key();
    stop();
}
```

The `Sample` class stores all relevant objects to communicate both with the GPU and the `HtmlCanvas`:

We use this `Sample` class as a base for our reference implementation of the tasks to come.
We created the class `Workshop` which is a subclass of `Sample`:

```js
// workshop.js
import { Sample } from '/common/framework/sample.js';

class Workshop extends Sample {
}
```

In our `main.js`, we create an instance of our `Workshop` class and call its lifecycle methods roughly like this:
```js
// main.js
const canvas = document.getElementById('webGpuCanvas');
const gpu = navigator.gpu;
const adapter = gpu && await gpu.requestAdapter();
const device = adapter && await adapter.requestDevice();
const context = device && canvas.getContext('webgpu');
const workshop = new Workshop(gpu, adapter, device, context, canvas);

await workshop.init();

function render() {
    workshop.render();
    requestAnimationFrame(render);
}
render();
```

Initially, we'll just render our textured triangle again.
It all starts in the asynchronous `init` function that is called from `main.js`:
```js
    async init() {
        await this.#initResources();
        await this.#initPipelines();
    }
```
All resources, like buffers and textures, are created in the private `#initResources` method of our class.
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
We create these objects in the private `#initPipelines` method of our class:
```js
    async #initPipelines() {
        this.pipeline = this.device.createRenderPipeline({...});
        this.bindGroup = this.device.createBindGroup({...});
        this.colorAttachment = {...};
    }
```

The actual rendering is done in the `render` method of our `Workshop` class.
Again, this method is called from `main.js` which also requests an animation frame for us, so we can focus on encoding and submitting GPU commands:
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

## Task 2.1: Add a Camera
Now that we're familiar with the lifecycle methods of our framework, we'll make the step into 3D!
The first thing we have to do, is adding a camera to both our JavaScript file and our shader.

We'll start with the shader:
* Add a `Camera` struct consisting of two `mat4x4<f32>`, the camera's `view` and `projection` matrices.
* Add an instance of the `Camera` struct to the `Uniforms` struct.
* In the vertex stage of the shader, use the camera's matrices to transform the vertex position to clip space, e.g., like so:
```wgsl
fn vertex(input: VertexInput) -> VertexOutput {
    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * vec4<f32>(input.position + uniforms.offset, 0, 1),
        input.texcoord,
    );
}
```

The shader now expects two matrices to be in the `Uniforms` struct, so we need to adjust the JavaScript file as well:
* In the `#initResources` methods, adjust the uniform buffer's size to hold two more matrices. Each `mat4x4<f32>` consists of 16 floats, so we have to add `2 * 16 * Float32Array.BYTES_PER_ELEMENT` to the buffer's size. 
* Import the `OrbitCamera` class from `/common/engine/util/orbit-camera.js` ...
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
In this task, we'll prepare our shader and JavaScript file to render 3D models instead.

Again, we'll start with the shader:
* Adjust the `VertexInput` struct to hold a three-dimensional position and a normal:
```wgsl
struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}
```
* Adjust the `VertexOutput` and `FragmentInput` structs to pass the normal to hold a normal as well:
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

Now that we've changed the shader, it no longer matches our setup in the JavaScript file, so we need to make some changes there as well:
* Import `mat4` from `/lib/gl-matrix-module.js`.
* In `#initResources`, add a third component to vertex positions 3D and add a 3D normal vector to each:
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

## Task 2.3: Load and Render a 3D Model
Now that we have prepared everything to render 3D models, the time has finally come to do so:
* Import the `bunny` model from `./common/models/bunny.json` as a JSON:
```js
import bunny from './common/models/bunny.json' assert { type: 'json' };
```
* Import the `Model` class from `./common/engine/util/model.js`. The `Model` class has some helper functions to get the numbers of vertices and indices, and to write them to mapped buffer ranges.
* Import the `Vertex` helper class from `./common/engine/core/mesh.js`.
* In `init`, create an instance of the `Model` class from the `bunny`:
```js
    async init() {
        this.model = new Model(bunny);
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
* In `render`, make sure to use the correct index type (the `Model` class uses `'uint32'`!) and number of indices for drawing the model:
```js
renderPass.setIndexBuffer(this.indexBuffer, this.model.indexType); // = 'uint32'
renderPass.drawIndexed(this.model.numIndices);
```
* Optionally, use the `vertexLayout` provided by the `Vertex` class when creating our render pipeline in `#initPipelines`:
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
* In `#initResources`, create a depth buffer. A depth buffer is just a texture with a format that allows depth testing:
```js
    this.depthTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
```
* In `#initPipelines`, add a `GPUDepthStencilState` to our render pipleine:
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
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
    };
```
* In `render`, add the depth-stencil attachment to the render pass:
```js
     const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [this.colorAttachment],
        depthStencilAttachment: this.depthStencilAttachment,
    });
```

## Task 2.5: Set a Culling Mode
TODO: I think it would make more sense to have this as a task and switch between pipelines on user interactions instead of rendering normals here

