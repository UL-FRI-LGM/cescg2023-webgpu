// Task 3.1: add a PointLight struct
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // Task 4.1: until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}

const DOWN: u32 = 0u;
const UP: u32 = 1u;
const MOVEMENT_SPEED = 0.005;

@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;

@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    // terminate the thread if its global id is outside the light buffer's bounds
    if global_id.x >= arrayLength(&uLights) {
        return;
    }

    let light_id = global_id.x;
    if uLights[light_id].direction == DOWN {
        uLights[light_id].position.y = uLights[light_id].position.y - MOVEMENT_SPEED;
        if uLights[light_id].position.y < -0.5 {
            uLights[light_id].direction = UP;
        }
    } else {
        uLights[light_id].position.y = uLights[light_id].position.y + MOVEMENT_SPEED;
        if uLights[light_id].position.y > 0.5 {
            uLights[light_id].direction = DOWN;
        }
    }
}