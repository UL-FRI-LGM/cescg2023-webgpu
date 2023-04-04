const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: preferredFormat,
});

const code = await fetch('shader.wgsl').then(response => response.text());
const module = device.createShaderModule({ code });
const pipeline = device.createRenderPipeline({
    vertex: {
        module,
        entryPoint: 'vertex',
        // We add two buffers to the vertex stage of the pipeline.
        buffers: [
            // The first buffer holds the data for the attribute at location 0
            // and the data starts at offset 0 from the start of the buffer.
            // The attribute is a 2D vector of floats, and each consecutive
            // value is 8 bytes ahead of the last one.
            {
                attributes: [
                    {
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x2',
                    },
                ],
                arrayStride: 8,
            },
            // The second buffer holds the data for the attribute at location 1
            // and the data starts at offset 0 from the start of the buffer.
            // The attribute is a 4D vector of 8-bit unsigned integers, which
            // are normalized to floats in the range [0.0, 1.0] in the shader,
            // and each consecutive value is 4 bytes ahead of the last one.
            {
                attributes: [
                    {
                        shaderLocation: 1,
                        offset: 0,
                        format: 'unorm8x4',
                    },
                ],
                arrayStride: 4,
            }
        ],
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

// We first create a buffer in the host memory.
const positions = new Float32Array([
     0.0,  0.5,
    -0.5, -0.5,
     0.5, -0.5,
]);

// Then we create a buffer in the device memory. The usage for a buffer
// must be specified ahead of time, since a buffer may only be used for one
// purpose in its lifetime.
// We map the buffer at creation so that it is visible from the host and the
// data can be copied into it.
const positionsBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

// We get the mapped range (the whole buffer) and copy the data into it.
new Float32Array(positionsBuffer.getMappedRange()).set(positions);

// The buffer must be unmapped before use.
// This is where the copy operation takes place.
positionsBuffer.unmap();

// We repeat the same procedure for the color buffer.
const colors = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
]);

const colorsBuffer = device.createBuffer({
    size: colors.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

new Uint8Array(colorsBuffer.getMappedRange()).set(colors);
colorsBuffer.unmap();

const canvasView = context.getCurrentTexture().createView();
const encoder = device.createCommandEncoder();
const renderPass = encoder.beginRenderPass({
    colorAttachments: [
        {
            view: canvasView,
            clearValue: [1, 1, 1, 1],
            loadOp: 'clear',
            storeOp: 'store',
        }
    ]
});
renderPass.setPipeline(pipeline);
// When setting up the pipeline, the vertex buffers are bound to the
// pipeline as specified during its creation. Note that these are not
// the attribute locations, but rather indices into the buffers array.
renderPass.setVertexBuffer(0, positionsBuffer);
renderPass.setVertexBuffer(1, colorsBuffer);
renderPass.draw(3);
renderPass.end();

device.queue.submit([encoder.finish()]);
