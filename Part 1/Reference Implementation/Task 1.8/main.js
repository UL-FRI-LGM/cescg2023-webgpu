import { GUI } from '../../../lib/dat.gui.module.js';

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: preferredFormat,
});

const vertexBufferLayout = {
    attributes: [
        {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
        },
        // We replace the color attribute with texture coordinates.
        {
            shaderLocation: 1,
            offset: 8,
            format: 'float32x2',
        }
    ],
    // We also update the stride.
    arrayStride: 16,
};

const code = await fetch('shader.wgsl').then(response => response.text());
const module = device.createShaderModule({ code });
const pipeline = device.createRenderPipeline({
    vertex: {
        module,
        entryPoint: 'vertex',
        buffers: [ vertexBufferLayout ],
    },
    fragment: {
        module,
        entryPoint: 'fragment',
        targets: [{ format: preferredFormat }],
    },
    layout: 'auto',
});

// The texture coordinates range from 0.0 to 1.0,
// independently of the texture size.
const vertices = new Float32Array([
     0.0,  0.5,     0.5, 1.0,
    -0.5, -0.5,     0.0, 0.0,
     0.5, -0.5,     1.0, 0.0,
]);

const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
});

new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
vertexBuffer.unmap();

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

const uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// We first fetch the image from the server and decode it asynchronously
// to avoid any hickups during texture upload.
const response = await fetch('brick.png');
const blob = await response.blob();
const image = await createImageBitmap(blob);

// Then we create a texture object. We have to specify its dimensions, format,
// and usage flags. For external images, the RENDER_ATTACHMENT usage has to be
// specified, because WebGPU may have to perform color space conversions.
const texture = device.createTexture({
    size: [image.width, image.height],
    usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    format: 'rgba8unorm',
});

// We copy the image to the texture memory on the device. We have to specify
// the source, destination, and size of the copy.
device.queue.copyExternalImageToTexture(
    { source: image },
    { texture: texture },
    [image.width, image.height]
);

// To use the texture in the shader, we need a sampler object. The sampler
// defines how the pixels in the texture are sampled and optionally interpolated.
const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
});

// We add both the texture and the sampler to the bind group,
// as they cannot be written to a buffer.
const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: { buffer: uniformBuffer },
        },
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

const translation = {
    x: 0,
    y: 0,
};

function render() {
    const uniformArray = new Float32Array([translation.x, translation.y]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

    const encoder = device.createCommandEncoder();
    const renderPass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                clearValue: [1, 1, 1, 1],
                loadOp: 'clear',
                storeOp: 'store',
            }
        ]
    });
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, uniformBindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setIndexBuffer(indexBuffer, 'uint32');
    renderPass.drawIndexed(3);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
}

render();

const gui = new GUI();
gui.add(translation, 'x', -1, 1).onChange(render);
gui.add(translation, 'y', -1, 1).onChange(render);
