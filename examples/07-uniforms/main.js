import { GUI } from '../../../lib/dat.gui.module.js';

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
                    {
                        shaderLocation: 1,
                        offset: 8,
                        format: 'float32x4',
                    }
                ],
                arrayStride: 24,
            },
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
    // The layout is still created automatically. It includes the bind groups.
    layout: 'auto',
});

const vertices = new Float32Array([
     0.0,  0.5,     1, 0, 0, 1,
    -0.5, -0.5,     0, 1, 0, 1,
     0.5, -0.5,     0, 0, 1, 1,
]);

const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
vertexBuffer.unmap();

const indices = new Uint16Array([
    0, 1, 2,
]);

const indexBuffer = device.createBuffer({
    size: Math.ceil(indices.byteLength / 4) * 4,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});

new Uint16Array(indexBuffer.getMappedRange()).set(indices);
indexBuffer.unmap();

// We create a uniform buffer with the UNIFORM usage flag.
// It is large enough to hold two 32-bit floats.
const uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});
uniformBuffer.unmap();

// To bind resources to the shader, we need to create a bind group for every
// group specified in the shader. Here we use a single bind group and bind
// the uniform buffer to the binding location 0, as specified in the shader.
const uniformBindGroup = device.createBindGroup({
    // The layout for the bind group can be queried from the pipeline, but
    // it is less error-prone and more efficient to create it explicitly.
    layout: pipeline.getBindGroupLayout(0),
    entries: [
        {
            binding: 0,
            resource: { buffer: uniformBuffer },
        },
    ],
});

const uniforms = {
    offsetX: 0,
    offsetY: 0,
};

function render() {
    // First, we update the uniform buffer with the updated data.
    const uniformArray = new Float32Array([uniforms.offsetX, uniforms.offsetY]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

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
    // Here we set the bind group for this draw command.
    renderPass.setBindGroup(0, uniformBindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setIndexBuffer(indexBuffer, 'uint16');
    renderPass.drawIndexed(3);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
}

render();

const gui = new GUI();
gui.add(uniforms, 'offsetX', -1, 1).onChange(render);
gui.add(uniforms, 'offsetY', -1, 1).onChange(render);
