// WebGPU Initialization.
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: preferredFormat,
});

// Fetch the shader code as a string from the server.
const code = await fetch('shader.wgsl').then(response => response.text());

// Compile the shaders and create a shader module. Here we can specify a
// source map or supply compilation hints to help the driver with optimization.
const module = device.createShaderModule({ code });

// Create a render pipeline with the specified vertex and fragment shaders.
// Here we will later specify the inputs and outputs for the shader stages.
// Currently, the vertex data is hardcoded in the shader.
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
    // In these examples, the layout is generated from the shaders, which is
    // usually a bad idea, except for one-shot pipelines where the layout
    // is used only in one place.
    layout: 'auto',
});

// Prepare the render pass.
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
// Set the pipeline and draw 3 vertices.
renderPass.setPipeline(pipeline);
renderPass.draw(3);
renderPass.end();

// Submit the render pass.
device.queue.submit([encoder.finish()]);
