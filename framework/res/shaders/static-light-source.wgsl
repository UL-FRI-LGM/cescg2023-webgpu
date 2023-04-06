struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}

struct VertexOutput {
    @builtin(position) clip_position: vec4f,
    // Task 3.1: pass position in world space to fragment shader
    @location(0) position: vec3f,       // <- world positions are at location 0
    @location(1) normal: vec3f,         // <- normals are at location 1
    @location(2) texcoord: vec2f,       // <- texcoords are at location 2
}

struct FragmentInput {
    // Task 3.1: pass position in world space to fragment shader
    @location(0) position: vec3f,   // <- world positions are at location 0
    @location(1) normal: vec3f,     // <- normals are at location 1
    @location(2) texcoord: vec2f,   // <- texcoords are at location 2
}

struct FragmentOutput {
    @location(0) color: vec4f,
}

struct Camera {
    // Task 3.1: add the camera's position to our Camera struct
    position: vec3f,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

// we add new render modes to switch between displaying a textured model or the model's normals
const MODE_TEXTURE: u32 = 0u;
const MODE_NORMALS: u32 = 1u;

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
    mode: u32,          // <- we add a new variable to switch between render modes
}

// Task 3.1: add a PointLight struct
struct PointLight {
    position: vec3f,
    attenuation: vec3f,
    color: vec3f,
}

// Task 3.1: add a Material struct
struct Material {
    diffuse: f32,
    specular: f32,
    shininess: f32,
}

// Task 3.1: add a constant instance of our PointLight struct
const LIGHT_SOURCE: PointLight = PointLight(
    vec3(0.0, 1.0, 1.0),
    vec3(2.0, 0.0, 1.0),
    vec3(1.0, 1.0, 1.0),
);

// Task 3.1: add a constant instance of our Material struct
const MATERIAL: Material = Material(
    1,  // diffuse
    1,  // specular
    50, // shininess
);

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    let position = uniforms.model * vec4f(input.position, 1);
    let normal = (uniforms.model * vec4f(input.normal, 0)).xyz;

    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * position,
        position.xyz,
        normalize(normal),
        input.texcoord,
    );
}

fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    return max(0.0, dot(normal, light_direction)) * MATERIAL.diffuse;
}

fn compute_specular_lighting(position: vec3f, normal: vec3f, light_direction: vec3f) -> f32 {
    let view_direction = normalize(uniforms.camera.position - position);
    let reflection_vector = reflect(-light_direction, normal);
    return pow(max(0.0, dot(light_direction, reflection_vector)), MATERIAL.shininess) * MATERIAL.specular;
}

fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f) -> vec3f {
    let d = distance(position, LIGHT_SOURCE.position);
    let attenuation = 1.0 / dot(LIGHT_SOURCE.attenuation, vec3f(1, d, d * d));
    let attenuated_light_color = attenuation * LIGHT_SOURCE.color;

    let light_direction = normalize(LIGHT_SOURCE.position - position);

    let diffuse = compute_diffuse_lighting(normal, light_direction) * attenuated_light_color;
    let specular = compute_specular_lighting(position, normal, light_direction) * attenuated_light_color;

    return albedo * diffuse + specular;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;

    let ambient = vec3f(0.1);
    var color = vec4f(ambient + compute_lighting(input.position, input.normal, albedo), 1.0);

    if uniforms.mode == MODE_NORMALS {
        color = vec4f(input.normal, 1.0);
    }

    return FragmentOutput(
        color,
    );
}
