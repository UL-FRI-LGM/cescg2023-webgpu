const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: preferredFormat,
});

console.log(await adapter.requestAdapterInfo());
console.log([...adapter.features]);
console.log(adapter.limits);

const canvasView = context.getCurrentTexture().createView();
const encoder = device.createCommandEncoder();
const renderPass = encoder.beginRenderPass({
    colorAttachments: [
        {
            view: canvasView,
            clearValue: [1, 0.6, 0.2, 1],
            loadOp: 'clear',
            storeOp: 'store',
        }
    ]
});
renderPass.end();

device.queue.submit([encoder.finish()]);
