# RTVis WebGPU Playground

Serverless playground to implement WebGPU samples

Ideally, clone it and just open index.html with Google Chrome Canary (or Google Chrome if you include your [origin trial token](https://developer.chrome.com/origintrials/#/register_trial/118219490218475521))

You can also check it out online right now: [welko.github.io/webgpu-playground](https://welko.github.io/webgpu-playground/)



## Tutorial: Creating your own sample

1) Create a new file under the /samples directory (it can be anywhere though)
2) Add this file as a <script> in index.html (look for \<!-- Samples go here! -->)
3) Now back to your new file, choose a unique name for your sample like "SomeCoolName" and register the sample by writing: SAMPLES.SomeCoolName = class extends Sample { ... }
4) Check the base class Sample at the end of the file main.js to see what functions you can use and override. Overriding the constructor is not recommended. The comments there should help
5) Check the existing samples under the /samples directory for nice ways to do things
6) If you wish to create a GUI for your sample in [ImGui](https://github.com/ocornut/imgui) fashion, you can! Have a look at gui/gui.js for the elements that are implemented. Create a window with `const window = new GUI.Window(...)` and add it to the workspace with `this.gui.add(window)`. this.gui is a GUI.Workspace
7) Enjoy



## WebGPU calls

The WebGPU calls outside of a sample are kept to a minimum, otherwise it would be easy to lose track of what's going on.
The few calls to WebGPU outside of samples are in main.js and they consist of the following:


### Initialization

navigator.gpu, requestAdapter, requestDevice, and getting the WebGPU context from the canvas. As of 10.08.2022 it looks like this:
```javascript
const gpu = navigator.gpu;
const adapter = gpu && await gpu.requestAdapter();
const device = adapter && await adapter.requestDevice();
const context = device && canvas.node.getContext("webgpu");
```


### Context configuration

This happens in the Sample class in the resize() function. This may be overriden inside a sample in case other configuration options should be used. In general, this should be enough though :)

As of 10.08.2022 it looks like this:
```javascript
this.context.configure({
  alphaMode: "opaque",
  device: this.device,
  format: this.context.getPreferredFormat(this.adapter), // TODO remove this WebGPU-DEPRECATED way of getting the preferred format
  //format: this.gpu.getPreferredCanvasFormat(), // TODO use this instead of the line above
  size: [width, height], // TODO remove this WebGPU-DEPRECATED parameter! The width and height of HTMLCanvasElement are now used
});
```
