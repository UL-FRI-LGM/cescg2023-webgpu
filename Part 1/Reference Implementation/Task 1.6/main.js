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
        {
            shaderLocation: 1,
            offset: 8,
            format: 'float32x4',
        }
    ],
    arrayStride: 24,
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

const vertices = new Float32Array([
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

// In real-world scenarios, most vertices are used multiple times in a single
// mesh. We can reuse them with indexed rendering. This means that the vertex
// data will not be read sequentially, but rather at the given indices, and
// the indices will be read sequentially.
// We are going to use 32-bit unsigned integers as indices.
const indices = new Uint32Array([
    0, 1, 2,
]);

const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    // Note the INDEX usage flag for the index buffer.
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
});

new Uint32Array(indexBuffer.getMappedRange()).set(indices);
indexBuffer.unmap();

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
renderPass.setVertexBuffer(0, vertexBuffer);
// The index buffer and the data type of indices.
renderPass.setIndexBuffer(indexBuffer, 'uint32');
renderPass.drawIndexed(3);
renderPass.end();

device.queue.submit([encoder.finish()]);
