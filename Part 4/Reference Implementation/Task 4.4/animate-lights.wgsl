// Task 3.1: add a PointLight struct
struct PointLight {
    position: vec3f,
    // Task 3.3: we use a fragment's distance to the light source instead of making a hard cut at a certain distance
    //           so instead of storing a radius in the light source, we store its intensity to control its overall brightness
    intensity: f32,
    color: vec3f,
    // Task 4.4: until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}

const DOWN: u32 = 0u;
const UP: u32 = 1u;

const MOVEMENT_SPEED = 0.005;

@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;

@id(0) override WORKGROUP_SIZE: u32 = 64;

@compute
@workgroup_size(WORKGROUP_SIZE)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let num_lights = arrayLength(&uLights);

    // terminate the thread if its global id is outside the light buffer's bounds
    if num_lights < global_id.x {
        return;
    }

    if uLights[global_id.x].direction == DOWN {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y - MOVEMENT_SPEED;
        if uLights[global_id.x].position.y < -0.5 {
            uLights[global_id.x].direction = UP;
        }
    } else {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y + MOVEMENT_SPEED;
        if uLights[global_id.x].position.y > 0.5 {
            uLights[global_id.x].direction = DOWN;
        }
    }
}