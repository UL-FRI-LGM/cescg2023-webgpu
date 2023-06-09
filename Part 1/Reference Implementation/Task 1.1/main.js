// navigator.gpu is the entry point to WebGPU.
// From it, we can request access to an adapter (a physical device).
const adapter = await navigator.gpu.requestAdapter();

// A device manages the connection to the adapter, resources, and queues.
// Queues execute commands. Currently there is only one queue (device.queue).
const device = await adapter.requestDevice();

// The canvas and a webgpu context are needed for rendering to a screen.
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');

// A device may prefer one format over another for performance reasons.
// Desktop devices usually prefer bgra8unorm,
// mobile devices usually prefer rgba8unorm.
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device,
    format: preferredFormat,
});

// We can request adapter info (e.g. vendor), features (extensions),
// and limits (e.g. max texture size).
console.log(await adapter.requestAdapterInfo());
console.log([...adapter.features]);
console.log(adapter.limits);

// To render anything, we must create a command encoder for encoding the render
// pass.
const encoder = device.createCommandEncoder();

// In this example, we are only specifying a single color attachment, which we
// set to be cleared with a specific color. The texture that is used as an
// attachment may be different every frame because of multiple buffering.
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

// Note: submitted command buffers cannot be used again.
device.queue.submit([encoder.finish()]);
