use std::io::{self, BufRead};
use zhonnex_resolve::{
    decide, Contact, ControlInput, Equipment, Mode, SOFTWARE_NAME,
};

fn main() {
    let stdin = io::stdin();
    let mut input = ControlInput::new(Mode::Sea);
    let mut contacts: Vec<Contact> = Vec::new();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(err) => {
                eprintln!("RESOLVE_READ_ERROR {err}");
                std::process::exit(2);
            }
        };
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let key = parts.next().unwrap_or("");
        match key {
            "mode" => input.mode = parse_mode(parts.next().unwrap_or("sea")),
            "contract_nominal" => input.contract_nominal = truth(parts.next()),
            "position_known" => input.position_known = truth(parts.next()),
            "x" => input.x_m = number(parts.next()),
            "y" => input.y_m = number(parts.next()),
            "z" => input.z_m = number(parts.next()),
            "speed" => input.speed_mps = number(parts.next()),
            "heading" => input.heading_deg = number(parts.next()),
            "dest_x" => input.dest_x_m = number(parts.next()),
            "dest_y" => input.dest_y_m = number(parts.next()),
            "dest_z" => input.dest_z_m = number(parts.next()),
            "max_speed" => input.max_speed_mps = number(parts.next()),
            "length" => input.length_m = number(parts.next()),
            "depth" => input.depth_m = number(parts.next()),
            "draft" => input.draft_m = number(parts.next()),
            "wind_from" => input.wind_from_deg = number(parts.next()),
            "wind" => input.wind_mps = number(parts.next()),
            "current" => input.current_mps = number(parts.next()),
            "stop_a" => input.stop_a = number(parts.next()),
            "stop_b" => input.stop_b = number(parts.next()),
            "stop_c" => input.stop_c = number(parts.next()),
            "mu" => input.mu = number(parts.next()),
            "eta" => input.eta = number(parts.next()),
            "reaction_s" => input.reaction_s = number(parts.next()),
            "permitted_speed" => input.permitted_speed_mps = number(parts.next()),
            "authority_m" => input.authority_m = number(parts.next()),
            "altitude" => input.altitude_m = number(parts.next()),
            "airspeed" => input.airspeed_mps = number(parts.next()),
            "aoa" => input.angle_of_attack_deg = number(parts.next()),
            "stall_angle" => input.stall_angle_deg = number(parts.next()),
            "propellant" => input.propellant_kg = number(parts.next()),
            "dp_requested" => input.dp_requested = truth(parts.next()),
            "dp_engaged" => input.dp_engaged = truth(parts.next()),
            "dp_x" => input.dp_x_m = number(parts.next()),
            "dp_y" => input.dp_y_m = number(parts.next()),
            "dp_heading" => input.dp_heading_deg = number(parts.next()),
            "dp_radius" => input.dp_radius_m = number(parts.next()),
            "yaw_rate" => input.yaw_rate_dps = number(parts.next()),
            "integral" => input.rudder_integral = number(parts.next()),
            "dt" => input.dt_s = number(parts.next()),
            "contact" => contacts.push(Contact {
                bearing_deg: number(parts.next()),
                range_m: number(parts.next()),
                closing_mps: number(parts.next()),
                confidence: number(parts.next()),
            }),
            "autopilot" => input.equipment.autopilot_accepts = truth(parts.next()),
            "rudder" => input.equipment.rudder_answers = truth(parts.next()),
            "emergency_steering" => input.equipment.emergency_steering_answers = truth(parts.next()),
            "governor" => input.equipment.governor_accepts = truth(parts.next()),
            "propellers" => input.equipment.propellers_answering = number(parts.next()) as u8,
            "thruster" => input.equipment.thruster_answers = truth(parts.next()),
            "dp_accepts" => input.equipment.dp_accepts = truth(parts.next()),
            "brake" => input.equipment.brake_answers = truth(parts.next()),
            "emergency_brake" => input.equipment.emergency_brake_answers = truth(parts.next()),
            "road_steering" => input.equipment.road_steering_answers = truth(parts.next()),
            "side_clear" => input.equipment.side_path_clear = truth(parts.next()),
            "flight" => input.equipment.flight_accepts = truth(parts.next()),
            "wheels" => input.equipment.reaction_wheels_answer = truth(parts.next()),
            "anchor" => input.equipment.anchor_available = truth(parts.next()),
            "anchor_depth" => input.equipment.depth_allows_anchor = truth(parts.next()),
            _ => {}
        }
    }
    input.contacts = contacts;
    let _ = Equipment::default();
    let cmd = decide(&input);
    println!("software {SOFTWARE_NAME}");
    println!("kind {}", cmd.kind.as_str());
    println!("ladder_step {}", cmd.ladder_step);
    println!("heading {}", cmd.heading_deg);
    println!("speed {}", cmd.speed_mps);
    println!("rudder {}", cmd.rudder_deg);
    println!("propeller {}", cmd.propeller_fraction);
    println!("pitch {}", cmd.pitch_fraction);
    println!("port {}", cmd.port_fraction);
    println!("starboard {}", cmd.starboard_fraction);
    println!("altitude {}", cmd.altitude_m);
    println!("delta_v {}", cmd.delta_v_mps);
    println!("dp_error {}", cmd.dp_error_m);
    println!("heading_error {}", cmd.heading_error_deg);
    println!("on_station {}", cmd.on_station);
    println!("integral {}", cmd.rudder_integral);
    println!("reason {}", cmd.reason.replace(' ', "_"));
}

fn parse_mode(raw: &str) -> Mode {
    match raw {
        "road" => Mode::Road,
        "rail" => Mode::Rail,
        "air" => Mode::Air,
        "orbit" => Mode::Orbit,
        _ => Mode::Sea,
    }
}

fn truth(raw: Option<&str>) -> bool {
    matches!(raw, Some("true" | "1" | "yes"))
}

fn number(raw: Option<&str>) -> f64 {
    raw.and_then(|v| v.parse().ok()).unwrap_or(0.0)
}