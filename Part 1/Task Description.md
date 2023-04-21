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
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: preferredFormat,
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
    var output : VertexOutput;
    output.position = vec4f(positions[input.vertexIndex], 0, 1);
    return output;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    var output : FragmentOutput;
    output.color = vec4f(1, 0, 0, 1);
    return output;
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
        targets: [{ format: preferredFormat }],
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
    var output : VertexOutput;
    output.position = vec4f(positions[input.vertexIndex], 0, 1);
    output.color = colors[input.vertexIndex];
    return output;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    var output : FragmentOutput;
    output.color = pow(input.color, vec4f(1 / 2.2));
    return output
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

We now want to translate the triangle with a given vector. To achieve that,
we need to make the following changes:

1. Import the dat.gui library and add two sliders for the translation.
1. Move the render code to a function and call it on every translation change.
1. Create a uniform variable in the shader and assign it to a group and give it
a binding number.
1. Create a uniform buffer of sufficient size.
1. Create a bind group and connect the uniform buffer to it.
1. When rendering, update the uniform buffer and set the bind group.

We want to set the translation vector through the GUI using the dat.gui library,
so we will add a reference to the library script in the HTML and import it in
`main.js`.

* Add the dat.gui script to the HTML:

```html
<script src="../../lib/dat.gui.min.js"></script>
```

* Import the dat.gui library:

```js
import { GUI } from '../../../lib/dat.gui.module.js';
```

* Add two sliders to control the x and y components of the translation vector:

```js
const translation = {
    x: 0,
    y: 0,
};

const gui = new GUI();
gui.add(translation, 'x', -1, 1).onChange(render);
gui.add(translation, 'y', -1, 1).onChange(render);
```

We must re-render the scene on all changes of the translation. This is why we
will put all rendering code in a function called `render`:

```js
function render() {
    const encoder = device.createCommandEncoder();
    ...
    device.queue.submit([encoder.finish()]);
}

render();
```

Note that we are calling the render function immediately, so that the scene is
rendered when the page loads, and we also attached the render function as a
callback when the user interacts with the slider.

Next, we will update the shader. The translation vector is going to be the same
for all vertices, so we are going to use a *uniform variable*. We only need one
*group* and one *binding* in the shader.

* Create a struct `Uniforms`:

```wgsl
struct Uniforms {
    translation : vec2f,
}
```

* Add a uniform variable of type `Uniforms` to the shader:

```wgsl
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
```

Note that we are using group 0 and binding 0 for the uniforms. These numbers
will be visible from the host code.

* Update the vertex shader by adding the translation to the output position:

```wgsl
vec4f(input.position + uniforms.translation, 0, 1)
```

Next, we need to create a uniform buffer from the host code. The buffer will
hold two floats, so its size will be 8. Its usage will be `UNIFORM`, and because
we will write to the buffer later, we do not need to map it and unmap it.
However, we must flag it as a copy destination (`COPY_DST`).

* Create the uniform buffer:

```js
const uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
```

We update the contents of the buffer in the `render` function, before encoding
the render pass.

* Update the contents of the uniform buffer:

```js
const uniformArray = new Float32Array([translation.x, translation.y]);
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
```

To bind the newly created uniform buffer to the shader, we need a bind group.
The bind group needs a layout, which we can pull from the pipeline. As with the
pipeline layout, the bind group layout would ideally be created in advance.

* Create the bind group for the uniforms:

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

Note the bind group 0 and binding number 0. These match with the shader code.

Lastly, we connect the bind group to the shader in the render pass.

* Set the bind group in the render pass:

```js
renderPass.setBindGroup(0, uniformBindGroup);
```

## Task 1.8: Apply a texture to the triangle

Now we want to texture the triangle with an image that we fetch from the server.
To achieve this, we are going to make the following changes:

1. Replace the color attribute with texture coordinates.
1. Add a texture and a sampler uniform, and sample the texture in the fragment
shader.
1. Create a texture and a sampler object and bind them to the shader.
1. Fetch the image from the server, decode it, and copy it to the texture.

To replace the colors with texture coordinates, we will change the vertex
buffer and the shader:

* Replace the color attribute with texture coordinates in the buffer:

```js
const vertices = new Float32Array([
     0.0,  0.5,     0.5, 1.0,
    -0.5, -0.5,     0.0, 0.0,
     0.5, -0.5,     1.0, 0.0,
]);
```

* Change the vertex buffer layout accordingly:

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
            format: 'float32x2',
        }
    ],
    arrayStride: 16,
};
```

* Replace the color attribute with texture coordinates in the shader:

```wgsl
struct VertexInput {
    @location(0) position : vec2f,
    @location(1) texcoord : vec2f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) texcoord : vec2f,
}

struct FragmentInput {
    @location(0) texcoord : vec2f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}
```

Next, we will add a texture and a sampler as uniforms to the shader. They cannot
be put in the `Uniforms` struct, because they are not backed by a buffer, so we
need to create separate bindings for them. We will use binding numbers 1 and 2
for them and reuse group 0. We will be using a 2D texture and sample colors with
floating point components, so the correct texture type is `texture_2d<f32>`.

* Add a texture and a sampler as uniforms:

```wgsl
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
```

* Sample the texture at the interpolated texture coordinates:

```wgsl
@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    output.position = vec4f(input.position + uniforms.translation, 0, 1);
    output.texcoord = input.texcoord,
    return output;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    var output : FragmentOutput;
    output.color = textureSample(uTexture, uSampler, input.texcoord);
    return output;
}
```

Now we turn our attention to the host code, where we first fetch the image from
the server and decode it. Note that this is an async process. We will use the
image `brick.png` and put it into the same directory as the `index.html` file.

* Fetch the image from the server and decode it to `ImageBitmap`:

```js
const blob = await fetch('brick.png').then(response => response.blob());
const image = await createImageBitmap(blob);
```

Next, we create the texture. We must specify its size, format, and usage. The
format can be `rgba8unorm`, which means that we have 4 components that are 8-bit
unsigned integers, which are normalized to floats on the unit interval when
sampled.

Since we will copy an external image into the texture, the usage flags must
include the `COPY_DST` flag. Additionally, since the browser may need to perform
color space conversions, we must add the `RENDER_ATTACHMENT` flag as per the
WebGPU specification. We are also going to use the texture in a shader as a
texture binding, so we add the `TEXTURE_BINDING` flag.

* Create a texture:

```js
const texture = device.createTexture({
    size: [image.width, image.height],
    usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    format: 'rgba8unorm',
});
```

Now that we have both the image and the texture prepared, we can issue a command
to copy the image to the texture.

* Copy the image to the texture:

```js
device.queue.copyExternalImageToTexture(
    { source: image },
    { texture },
    [image.width, image.height]
);
```

We also need a sampler, which we are going to configure to use nearest neighbor
interpolation, and leave the default clamping behavior for texture coordinates.

* Create a sampler:

```js
const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
});
```

Lastly, we connect the texture and sampler to the shader by adding them to the
bind group. Note that the binding numbers match the ones in the shader.

* Add the texture and sampler to the bind group:

```js
const uniformBindGroup = device.createBindGroup({
    ...
    entries: [
        ...
        {
            binding: 1,
            resource: texture.createView(),
        },
        {
            binding: 2,
            resource: sampler,
        },
    ],
});
```
