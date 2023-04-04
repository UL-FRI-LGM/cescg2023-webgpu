import { Sample } from './common/sample.js';
import { Triangle } from "./samples/triangle.js";
import { TexturedTriangle } from "./samples/textured-triangle.js";
import {Camera} from "./samples/camera.js";

// Object mapping the sample name to the sample class
const SAMPLES = {};
Triangle.register(SAMPLES);
TexturedTriangle.register(SAMPLES);
Camera.register(SAMPLES);

// Entry point here!
window.addEventListener("load", () => {
    const gui = new GUI.Workspace(document.getElementById("gui"));
    gui.node.style.display = 'none';

    main(gui)
        //.then(() => console.log("Successfully initialized!"))
        .catch((reason) => {
            gui.alert(reason, "Error");
        });
});

async function main(gui) {
    // Declare variables that will be used throughout this function
    let activeSample = null;

    // Set up the canvas
    const viewport = document.getElementById("viewport");
    const canvas = new GUI.Element(document.getElementById("webGpuCanvas"));

    // Initialize WebGPU
    const gpu = navigator.gpu;
    const adapter = gpu && await gpu.requestAdapter();
    const device = adapter && await adapter.requestDevice();
    const context = device && canvas.node.getContext("webgpu");
    if (!device) throw "WebGPU not supported.\nTry using the latest version of Google Chrome\nor Google Chrome Canary";
    const preferredFormat = gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: preferredFormat,
    });

    // Define WebGPU configuration and set up reconfiguration on resize
    // This is called at the end of this function
    const configure = () => {
        const width = viewport.clientWidth;
        const height = viewport.clientHeight;
        canvas.node.width = width;
        canvas.node.height = height;
        activeSample.resize(width, height);
        activeSample.render();
    };
    window.addEventListener("resize", () => configure());

    // Set up the shader editor
    const editor = new Editor(document.getElementById("editor"), device, (shaderName, shaderCode) => {
        activeSample.reloadShader(shaderName, shaderCode);
        activeSample.render();
    });

    // Just to be sure, check if all samples extend the Sample class
    const samples = Object.keys(SAMPLES).filter(name => {
        const valid = SAMPLES[name].prototype instanceof Sample;
        if (!valid) console.error("Could not accept sample '" + name + "' because it does not extend 'Sample'");
        return valid;
    });
    if (samples.length === 0) {
        throw "Could not find any samples\nThere may be more details about this in the console";
    } else if (samples.length !== Object.keys(SAMPLES).length) {
        gui.alert("Some samples could not be accepted\nCheck the console for more details");
    }

    // Add samples to UI
    {
        const activateSample = async (sampleName) => {
            gui.clear();
            const nextActiveSample = new SAMPLES[sampleName](gui, gpu, adapter, device, context, canvas.node);
            await nextActiveSample.load();
            for (const [shaderName, shaderCode] of Object.entries(nextActiveSample.shaders())) {
                nextActiveSample.reloadShader(shaderName, shaderCode);
            }
            nextActiveSample.init();
            editor.shaders = nextActiveSample.shaders();
            if (activeSample) activeSample.stop();
            activeSample = nextActiveSample;
            configure();
        };
        const samplesSelect = document.getElementById("samples");
        for (const sampleName of samples) {
            const option = document.createElement("option");
            option.value = sampleName;
            option.textContent = sampleName;
            samplesSelect.appendChild(option);
        }
        samplesSelect.addEventListener("change", () => activateSample(samplesSelect.value));
        samplesSelect.value = samples[0];
        activateSample(samplesSelect.value);
    }

    // Add settings to UI
    {
        const settingsSelect = document.getElementById("settings");
        const settings = {};
        const addSetting = (name, onSelected) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            settingsSelect.appendChild(option);
            settings[name] = onSelected;
        }
        settingsSelect.addEventListener("change", () => {
            settings[settingsSelect.value]()
            settingsSelect.value = firstOption;
        });
        const firstOption = "- select -";
        addSetting(firstOption, () => {
        });
        addSetting("Toggle GUI", () => gui.node.style.display = gui.node.style.display === "none" ? "" : "none");
        addSetting("Toggle shader editor", () => {
            editor.node.style.display = editor.node.style.display === "none" ? "" : "none"
        });
    }
}
