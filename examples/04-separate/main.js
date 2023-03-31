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
        buffers: [
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

const positions = new Float32Array([
     0.0,  0.5,
    -0.5, -0.5,
     0.5, -0.5,
]);

const positionsBuffer = device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

new Float32Array(positionsBuffer.getMappedRange()).set(positions);
positionsBuffer.unmap();

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
renderPass.setVertexBuffer(0, positionsBuffer);
renderPass.setVertexBuffer(1, colorsBuffer);
renderPass.draw(3);
renderPass.end();

device.queue.submit([encoder.finish()]);
