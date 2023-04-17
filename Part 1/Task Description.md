# PART 1: The basics

In Part 1, we are going to explore the basics of WebGPU. We will start with
initialization, then we will connect WebGPU to a canvas and draw a triangle,
next we will put the data for the triangle in GPU buffers, and finally, we will
upload an image to the GPU and use it as a texture for the triangle.

## Task 1.1: Set up the environment, initialize WebGPU, and clear the canvas

WebGPU is currently supported in Chrome Canary and in Firefox Nightly.
On Windows and MacOS it should work fine, Linux support on the other hand
is still a bit sketchy. If you are experiencing problems, you can use the
software renderer in Chrome Canary, called SwiftShader
(`--use-webgpu-adapter=swiftshader`).

We are not going to use any libraries or frameworks in Part 1, so that you can
clearly see how everything ties together under the hood. However, a server for
serving static files is required due to cross-origin resource sharing. A Python
server is supplied in this repository (`bin/server.py`), but you can choose
another one, if you prefer.

We need an HTML file and a JavaScript file.

* Create an HTML file named `index.html` with a 512x512 canvas and a reference
to the JavaScript module named `main.js`:

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module" src="main.js"></script>
</head>
<body>
    <canvas width="512" height="512">
</body>
</html>
```

* Create a JavaScript file named `main.js` and initialize the WebGPU adapter,
device, and canvas:

```js
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
});
```

If you point your browser to `localhost:3000` you should see a blank page. You
can open DevTools to inspect the page and see the canvas. The console in the
DevTools panel should be empty (or at least without warnings and errors).

* Inspect the features and limits of the adapter, and print out its basic info:

```js
console.log(await adapter.requestAdapterInfo());
console.log([...adapter.features]);
console.log(adapter.limits);
```

For anything to be drawn on the canvas (including clearing it), we will need
to record a *render pass* and submit it to the *command queue*. We can record
commands into a command buffer with a *command encoder*. The render pass for
clearing will be empty, but we will extend it later.

We need to tell the render pass to render into the current texture of the
canvas, which we attach as a single color attachment. The attachment should be
cleared on load and the results of the render pass should be stored.

* Create a render pass to clear the canvas with the color `[1, 0.6, 0.2, 1]`:

```js
const encoder = device.createCommandEncoder();
const renderPass = encoder.beginRenderPass({
    colorAttachments: [
        {
            view: context.getCurrentTexture().createView(),
            clearValue: [1, 0.6, 0.2, 1],
            loadOp: 'clear',
            storeOp: 'store',
        }
    ]
});
renderPass.end();
device.queue.submit([encoder.finish()]);
```

## Task 1.2: Draw a triangle with hardcoded data

For WebGPU to do anything interesting, we will need to write *shaders*. Shaders
are compiled into *modules* and attached to *pipelines*.

First, we are going to create a shader module, which we will store in a single
text file named `shader.wgsl`. We will follow a common pattern in which the
interface of the shaders is specified in structs.

The vertex shader will receive a vertex index, and output the position of the
vertex in clip space. The fragment shader should output a constant color.

* Create a shader file named `shader.wgsl` with the following interface:

```wgsl
struct VertexInput {
    @builtin(vertex_index) vertexIndex : u32,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
}

struct FragmentInput {
    @builtin(position) position: vec4f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}
```

Note that although the fragment shader input should be empty, we still
declare a single variable since structs in WGSL cannot be empty.

The data for our triangle will, for now, come from a constant global variable.
Such data is compiled right into the shader and cannot be changed later.

* Add the vertex positions as a constant global array:

```wgsl
const positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),
    vec2f(-0.5, -0.5),
    vec2f( 0.5, -0.5),
);
```

Now we can tie everything together by writing the entry points of our shaders
and returning the correct values.

* Create entry points for the vertex and fragment shaders:

```wgsl
@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(positions[input.vertexIndex], 0, 1),
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        vec4f(1.0, 0.6, 0.2, 1.0),
    );
}
```

With the shader code prepared, we can use JavaScript to fetch it from the server
and compile it into a shader module.

* Fetch the shader code and compile it into a shader module:

```js
const code = await fetch('shader.wgsl').then(response => response.text());
const module = device.createShaderModule({ code });
```

Now we can prepare the pipeline and use our shader module for both the vertex
and fragment shader. The full configuration for creating a render pipeline is
huge, but thankfully there are a lot of sensible defaults. Nevertheless, some
things must still be specified explicitly, for example, the fragment shader must
be told about the format of the render target.

The pipeline must also be given a pipeline layout. We strongly recommend
explicitly creating it, but for simplicity we will use an auto-generated
layout in our examples.

* Create a render pipeline with the vertex and fragment stages that use the
shader module:

```js
const pipeline = device.createRenderPipeline({
    vertex: {
        module,
        entryPoint: 'vertex',
    },
    fragment: {
        module,
        entryPoint: 'fragment',
        targets: [
            {
                format: preferredFormat
            }
        ],
    },
    layout: 'auto',
});
```

* Finally, update the render pass to use the newly created pipeline and draw
3 vertices:

```js
renderPass.setPipeline(pipeline);
renderPass.draw(3);
```

Note that you may have to adjust the background and triangle colors.

## Task 1.3: Use interpolation to color the triangle

As in other APIs, we are able to write some data to the vertex shader output
that will be interpolated inside a triangle by the GPU and passed to the
fragment shader input. We will use this capability to interpolate colors.
Note that interpolants are linked through locations numbers, not variable names.

* Create a constant global array for vertex colors:

```wgsl
const colors = array<vec4f, 3>(
    vec4f(1, 0, 0, 1),
    vec4f(0, 1, 0, 1),
    vec4f(0, 0, 1, 1),
);
```

* Update the vertex output and fragment input with the interpolant:

```wgsl
struct VertexOutput {
    ...
    @location(0) color : vec4f,
    ...
}

struct FragmentInput {
    ...
    @location(0) color : vec4f,
    ...
}
```

* Output the color from the vertex shader and use it in the fragment shader:

```wgsl
@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(positions[input.vertexIndex], 0, 1),
        colors[input.vertexIndex],
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        pow(input.color, vec4f(1 / 2.2)),
    );
}
```

Note that we used gamma correction to output the colors in sRGB color space.

## Task 1.4: Move vertex attributes from the shader to buffers

It would be silly to store more complicated 3D models in shaders. This is why
we are going to move our two vertex attributes (position and color) to
GPU *buffers*. Different buffers have different visibility: some are visible
from the host, some from the GPU, and some from both. We will first create
a JavaScript array (host-visible), then create a GPU buffer and map it to
host-visible memory, copy the contents from the JavaScript array to the GPU
buffer, and finally unmap the GPU buffer to make its contents available
for use by the GPU.

* Create a JavaScript array with vertex positions:

```js
const positions = new Float32Array([
     0.0,  0.5,
    -0.5, -0.5,
     0.5, -0.5,
]);
```

* Create a buffer for the positions and indicate that it will be used as a
vertex buffer:

```js
const positionsBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});
```

The buffer is mapped at creation, which means that we can immediately copy data
to it. Remember to unmap the buffer to make it usable within a pipeline.

* Copy the data to the buffer and unmap it:

```js
new Float32Array(positionsBuffer.getMappedRange()).set(positions);
positionsBuffer.unmap();
```

* Repeat the procedure for vertex colors:

```js
const colors = new Float32Array([
    1, 0, 0, 1,
    0, 1, 0, 1,
    0, 0, 1, 1,
]);

const colorsBuffer = device.createBuffer({
    size: colors.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});

new Float32Array(colorsBuffer.getMappedRange()).set(colors);
colorsBuffer.unmap();
```

Next, we will update the shader. The constant global arrays can be removed,
as the inputs will be passed as vertex buffers into the vertex shader.
Moreover, we don't need the vertex index anymore, however, we need two vertex
attributes and assign locations to them.

* Add vertex attributes for position and color:

```wgsl
struct VertexInput {
    @location(0) position : vec2f,
    @location(1) color : vec4f,
}
```

We will then update the pipeline description, where we will describe the layout
of the buffers and how it maps to the attribute location in the shader. For each
attribute, we must tell WebGPU about its location in the shader, its format
(type and number of components), the offset from the beginning of the buffer
where the data for that attribute starts, and the stride between the attributes
of consecutive vertices. Since we have two separate buffers, a layout must be
created for each one of them.

* Create descriptors for position and color buffers:

```js
const positionsBufferLayout = {
    attributes: [
        {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
        },
    ],
    arrayStride: 8,
};

const colorsBufferLayout = {
    attributes: [
        {
            shaderLocation: 1,
            offset: 0,
            format: 'float32x4',
        },
    ],
    arrayStride: 16,
};
```

* Pass the vertex buffer layouts to the pipeline creation function:

```js
const pipeline = device.createRenderPipeline({
    ...
    vertex: {
        module,
        entryPoint: 'vertex',
        buffers: [positionsBufferLayout, colorsBufferLayout],
    },
    ...
});
```

Lastly, we will connect the actual vertex buffers to the pipeline during
encoding of the render pass. This is because the buffers may be swapped between
different models as long as the layout of the data inside the buffers remains
the same.

* Set the vertex buffers during render pass encoding:

```js
renderPass.setVertexBuffer(0, positionsBuffer);
renderPass.setVertexBuffer(1, colorsBuffer);
```

## Task 1.5: Optimize memory access with interleaved attributes

For small models, a separate buffer for every attribute should work well. For
bigger models, though, the attributes of a single vertex are far apart in the
GPU memory, resulting in poor cache usage and, consequently, poor performance.

We can improve data locality by interleaving the attributes in a single vertex
buffer, so that the attributes of a single vertex are close together. The shader
has nothing to do with the buffer layout so it can remain unchanged. We must,
however, change the host code.

* Create a single vertex buffer with interleaved positions and colors:

```js
const vertices = new Float32Array([
    // positions    // colors
     0.0,  0.5,     1, 0, 0, 1,
    -0.5, -0.5,     0, 1, 0, 1,
     0.5, -0.5,     0, 0, 1, 1,
]);

const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});

new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
vertexBuffer.unmap();
```

We also need a new buffer layout, which now holds both attributes. Note that
the stride and offsets are now changed to reflect the new buffer layout.

* Create a vertex buffer layout for both position and color attributes:

```js
const vertexBufferLayout = {
    attributes: [
        {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
        },
        {
            shaderLocation: 1,
            offset: 8,
            format: 'float32x4',
        }
    ],
    arrayStride: 24,
};
```

* Pass the new vertex buffer layout to the pipeline creation function:

```js
const pipeline = device.createRenderPipeline({
    ...
    vertex: {
        module,
        entryPoint: 'vertex',
        buffers: [vertexBufferLayout],
    },
    ...
};
```

* Finally, we update the render pass to only bind the single vertex buffer:

```js
renderPass.setVertexBuffer(0, vertexBuffer);
```

## Task 1.6: Optimize memory usage with an index buffer

Most 3D models use the same vertices multiple times. On average, you can expect
every vertex to be used in about 4-6 triangles. We can exploit that fact by
using an index buffer instead of iterating over a long list of vertices with
potentially duplicate data.

Similarly to the buffer layout, indexing is not the shader's concern so it can
remain unchanged. Even better: indexing is not part of the pipeline description,
so the pipeline can remain unchanged as well. The only part of the code that
knows about the indexing is the render pass.

For the indexing to work, we will first create an index buffer. For our triangle
we will only need three indices. Admittedly, since we are only drawing a single
triangle, an index buffer is a vastly overengineered solution, but it will be
important for the remainder of the workshop and bigger models.

* Create an index buffer and indicate that it will be used as an index buffer:

```js
const indices = new Uint32Array([
    0, 1, 2,
]);

const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
});

new Uint32Array(indexBuffer.getMappedRange()).set(indices);
indexBuffer.unmap();
```

* Set the index buffer in the render pass and use an indexed draw call to make
use of it:

```js
renderPass.setIndexBuffer(indexBuffer, 'uint32');
renderPass.drawIndexed(3);
```

## Task 1.7: Translate the triangle with uniform variables

TODO Uniform variables are organized into groups.

```js
import { GUI } from '../../../lib/dat.gui.module.js';
```

```html
<script src="../../lib/dat.gui.min.js"></script>
```

```wgsl
struct Uniforms {
    offset : vec2f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
```

```wgsl
vec4f(input.position + uniforms.offset, 0, 1)
```

```wgsl
const uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
```

```js
const uniforms = {
    offsetX: 0,
    offsetY: 0,
};
```

```js
const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: { buffer: uniformBuffer },
        },
    ],
});
```

```js
renderPass.setBindGroup(0, uniformBindGroup);
```

```js
const gui = new GUI();
gui.add(uniforms, 'offsetX', -1, 1).onChange(render);
gui.add(uniforms, 'offsetY', -1, 1).onChange(render);
```

## Task 1.8: Apply a texture to the triangle

TODO
