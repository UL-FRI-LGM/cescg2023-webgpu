{
    const shaders = {
        Triangle:
`struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vColor : vec4<f32>
};

@stage(vertex)
fn vs_main(@builtin(vertex_index) VertexIndex: u32) -> Output {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.5),
        vec2<f32>(-0.5, -0.5),
        vec2<f32>(0.5, -0.5)
    );

    var color = array<vec3<f32>, 3>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );

    var output: Output;
    output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    output.vColor = vec4<f32>(color[VertexIndex], 1.0);
    return output;
}

@stage(fragment)
fn fs_main(@location(0) vColor: vec4<f32>) -> @location(0) vec4<f32> {
    return vColor;
}`
    }

    SAMPLES.Triangle = class extends Sample {
        init() {
            this._colorAttachment = {
                view: null, // Will be set in draw()
                clearValue: { r: 0, g: 0, b: 0, a: 1},
                loadOp: "clear",
                loadValue: { r: 0, g: 0, b: 0, a: 1},
                storeOp: "store"
            };

            this._vertices = new GUI.NumberBox(3, 1000000, 1, 3, (value) => {
                this.update();
            });

            const window = new GUI.Window("Settings");
            window.add(new GUI.NamedElement("#vertices", this._vertices));
            this.gui.add(window);
        }

        update() {
            const commandEncoder = this.device.createCommandEncoder();
            this._colorAttachment.view = this.context.getCurrentTexture().createView();
            const renderPass = commandEncoder.beginRenderPass({ colorAttachments: [this._colorAttachment] });
            renderPass.setPipeline(this.pipeline);
            renderPass.draw(this._vertices.value, 1, 0, 0);
            renderPass.end();
            this.device.queue.submit([commandEncoder.finish()]);
        }

        shaders() {
            return shaders;
        }

        reloadShader(shaderName, shaderCode) {
            this.pipeline = this.device.createRenderPipeline({
                layout: "auto",
                vertex: {
                    module: this.device.createShaderModule({
                        code: shaderCode
                    }),
                    entryPoint: "vs_main"
                },
                fragment: {
                    module: this.device.createShaderModule({
                        code: shaderCode
                    }),
                    entryPoint: "fs_main",
                    targets: [{
                        format: this.context.getPreferredFormat(this.adapter)
                    }]
                },
                primitive: {
                    topology: "triangle-strip"
                }
            });
        }
    }
}