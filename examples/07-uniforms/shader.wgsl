struct VertexInput {
    @location(0) position : vec2f,
    @location(1) color : vec4f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
}

struct FragmentInput {
    @location(0) color : vec4f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}

struct Uniforms {
    translation : vec2f,
}

// The uniforms are organized into groups. The groups often correspond to
// how frequently certain data changes. For example, the camera transformation
// is usually the same for all models. The model transformation changes for
// every model. Material data may change multiple times for a single model.

// We add the uniforms as a uniform variable at the binding location 0
// in the group 0.
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    output.position = vec4f(input.position + uniforms.translation, 0, 1);
    output.color = input.color;
    return output;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    var output : FragmentOutput;
    output.color = pow(input.color, vec4f(1 / 2.2));
    return output;
}
