//! Resolve. The seventh Zhonnex software.
//! It is not a module of MX Suite. It decides one next command for a craft.
//! The craft's own controller must accept that command before anything moves.

pub const SOFTWARE_NAME: &str = "Resolve";

const GRAVITY: f64 = 9.80665;
const CONFIDENCE_FLOOR: f64 = 0.70;
const SEA_DP_MAX_SPEED_MPS: f64 = 3.0;
const RUDDER_LIMIT_DEG: f64 = 35.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Sea,
    Road,
    Rail,
    Air,
    Orbit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandKind {
    NominalTrack,
    DangerAvoidance,
    DpHold,
    DpCreep,
    DpRelease,
    EmergencySteering,
    DifferentialThrust,
    AsternStop,
    LetGoAnchor,
    NotUnderCommand,
    ServiceBrake,
    EmergencyBrake,
    SteerClear,
    WithdrawAuthority,
    ReduceAngleOfAttack,
    AvoidancePath,
    AvoidanceBurn,
    AttitudeOnly,
    SafeDrift,
    ManualReversion,
    LossOfControl,
    Hold,
}

impl CommandKind {
    pub fn as_str(self) -> &'static str {
        match self {
            CommandKind::NominalTrack => "NOMINAL_TRACK",
            CommandKind::DangerAvoidance => "DANGER_AVOIDANCE",
            CommandKind::DpHold => "DP_HOLD",
            CommandKind::DpCreep => "DP_CREEP",
            CommandKind::DpRelease => "DP_RELEASE",
            CommandKind::EmergencySteering => "EMERGENCY_STEERING",
            CommandKind::DifferentialThrust => "DIFFERENTIAL_THRUST",
            CommandKind::AsternStop => "ASTERN_STOP",
            CommandKind::LetGoAnchor => "LET_GO_ANCHOR",
            CommandKind::NotUnderCommand => "NOT_UNDER_COMMAND",
            CommandKind::ServiceBrake => "SERVICE_BRAKE",
            CommandKind::EmergencyBrake => "EMERGENCY_BRAKE",
            CommandKind::SteerClear => "STEER_CLEAR",
            CommandKind::WithdrawAuthority => "WITHDRAW_AUTHORITY",
            CommandKind::ReduceAngleOfAttack => "REDUCE_ANGLE_OF_ATTACK",
            CommandKind::AvoidancePath => "AVOIDANCE_PATH",
            CommandKind::AvoidanceBurn => "AVOIDANCE_BURN",
            CommandKind::AttitudeOnly => "ATTITUDE_ONLY",
            CommandKind::SafeDrift => "SAFE_DRIFT",
            CommandKind::ManualReversion => "MANUAL_REVERSION",
            CommandKind::LossOfControl => "LOSS_OF_CONTROL",
            CommandKind::Hold => "HOLD",
        }
    }
}

/// What still answers. False means that option has failed.
#[derive(Debug, Clone, Copy)]
pub struct Equipment {
    pub autopilot_accepts: bool,
    pub rudder_answers: bool,
    pub emergency_steering_answers: bool,
    pub governor_accepts: bool,
    pub propellers_answering: u8,
    pub thruster_answers: bool,
    pub dp_accepts: bool,
    pub brake_answers: bool,
    pub emergency_brake_answers: bool,
    pub road_steering_answers: bool,
    pub side_path_clear: bool,
    pub flight_accepts: bool,
    pub reaction_wheels_answer: bool,
    pub anchor_available: bool,
    pub depth_allows_anchor: bool,
}

impl Default for Equipment {
    fn default() -> Self {
        Self {
            autopilot_accepts: false,
            rudder_answers: false,
            emergency_steering_answers: false,
            governor_accepts: false,
            propellers_answering: 0,
            thruster_answers: false,
            dp_accepts: false,
            brake_answers: false,
            emergency_brake_answers: false,
            road_steering_answers: false,
            side_path_clear: false,
            flight_accepts: false,
            reaction_wheels_answer: false,
            anchor_available: false,
            depth_allows_anchor: false,
        }
    }
}

/// Relative bearing: 0 is ahead, positive is starboard, negative is port.
#[derive(Debug, Clone, Copy)]
pub struct Contact {
    pub bearing_deg: f64,
    pub range_m: f64,
    pub closing_mps: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone)]
pub struct ControlInput {
    pub mode: Mode,
    pub contract_nominal: bool,
    pub position_known: bool,
    pub x_m: f64,
    pub y_m: f64,
    pub z_m: f64,
    pub speed_mps: f64,
    pub heading_deg: f64,
    pub dest_x_m: f64,
    pub dest_y_m: f64,
    pub dest_z_m: f64,
    pub max_speed_mps: f64,
    pub length_m: f64,
    pub depth_m: f64,
    pub draft_m: f64,
    pub wind_from_deg: f64,
    pub wind_mps: f64,
    pub current_mps: f64,
    pub stop_a: f64,
    pub stop_b: f64,
    pub stop_c: f64,
    pub mu: f64,
    pub eta: f64,
    pub reaction_s: f64,
    pub permitted_speed_mps: f64,
    pub authority_m: f64,
    pub altitude_m: f64,
    pub airspeed_mps: f64,
    pub angle_of_attack_deg: f64,
    pub stall_angle_deg: f64,
    pub propellant_kg: f64,
    pub dp_requested: bool,
    pub dp_engaged: bool,
    pub dp_x_m: f64,
    pub dp_y_m: f64,
    pub dp_heading_deg: f64,
    pub dp_radius_m: f64,
    pub yaw_rate_dps: f64,
    pub rudder_integral: f64,
    pub dt_s: f64,
    pub contacts: Vec<Contact>,
    pub equipment: Equipment,
}

impl ControlInput {
    pub fn new(mode: Mode) -> Self {
        Self {
            mode,
            contract_nominal: false,
            position_known: false,
            x_m: 0.0,
            y_m: 0.0,
            z_m: 0.0,
            speed_mps: 0.0,
            heading_deg: 0.0,
            dest_x_m: 0.0,
            dest_y_m: 0.0,
            dest_z_m: 0.0,
            max_speed_mps: 0.0,
            length_m: 0.0,
            depth_m: 0.0,
            draft_m: 0.0,
            wind_from_deg: 0.0,
            wind_mps: 0.0,
            current_mps: 0.0,
            stop_a: 0.0,
            stop_b: 0.0,
            stop_c: 0.0,
            mu: 0.0,
            eta: 0.0,
            reaction_s: 0.2,
            permitted_speed_mps: 0.0,
            authority_m: 0.0,
            altitude_m: 0.0,
            airspeed_mps: 0.0,
            angle_of_attack_deg: 0.0,
            stall_angle_deg: 15.0,
            propellant_kg: 0.0,
            dp_requested: false,
            dp_engaged: false,
            dp_x_m: 0.0,
            dp_y_m: 0.0,
            dp_heading_deg: 0.0,
            dp_radius_m: 5.0,
            yaw_rate_dps: 0.0,
            rudder_integral: 0.0,
            dt_s: 0.2,
            contacts: Vec::new(),
            equipment: Equipment::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ControlCommand {
    pub kind: CommandKind,
    pub ladder_step: u8,
    pub heading_deg: f64,
    pub speed_mps: f64,
    pub rudder_deg: f64,
    pub propeller_fraction: f64,
    pub pitch_fraction: f64,
    pub port_fraction: f64,
    pub starboard_fraction: f64,
    pub altitude_m: f64,
    pub delta_v_mps: f64,
    pub dp_error_m: f64,
    pub heading_error_deg: f64,
    pub on_station: bool,
    pub rudder_integral: f64,
    pub reason: String,
}

impl ControlCommand {
    fn bare(kind: CommandKind, step: u8, reason: impl Into<String>) -> Self {
        Self {
            kind,
            ladder_step: step,
            heading_deg: 0.0,
            speed_mps: 0.0,
            rudder_deg: 0.0,
            propeller_fraction: 0.0,
            pitch_fraction: 0.0,
            port_fraction: 0.0,
            starboard_fraction: 0.0,
            altitude_m: 0.0,
            delta_v_mps: 0.0,
            dp_error_m: 0.0,
            heading_error_deg: 0.0,
            on_station: false,
            rudder_integral: 0.0,
            reason: reason.into(),
        }
    }
}

pub fn wrap_360(deg: f64) -> f64 {
    if !deg.is_finite() {
        return 0.0;
    }
    let mut d = deg % 360.0;
    if d < 0.0 {
        d += 360.0;
    }
    d
}

pub fn wrap_signed(deg: f64) -> f64 {
    let mut d = wrap_360(deg);
    if d > 180.0 {
        d -= 360.0;
    }
    d
}

/// Heading to a point. X is east, Y is north. 0 is north.
pub fn heading_to(from_x: f64, from_y: f64, to_x: f64, to_y: f64) -> Option<f64> {
    let east = to_x - from_x;
    let north = to_y - from_y;
    if east.abs() < 1e-9 && north.abs() < 1e-9 {
        return None;
    }
    Some(wrap_360(east.atan2(north).to_degrees()))
}

pub fn braking_distance_m(speed_mps: f64, mu: f64, eta: f64) -> f64 {
    let speed = speed_mps.max(0.0);
    let denom = 2.0 * GRAVITY * mu * eta;
    if denom <= 1e-9 {
        f64::INFINITY
    } else {
        (speed * speed) / denom
    }
}

pub fn stopping_distance_m(speed_mps: f64, mu: f64, eta: f64, reaction_s: f64) -> f64 {
    let reaction = speed_mps.max(0.0) * reaction_s.max(0.0);
    reaction + braking_distance_m(speed_mps, mu, eta)
}

/// Illustrative ship-length formula S = A ln(1+B) + C. Not this hull unless A, B, and C were supplied.
pub fn sea_stopping_ship_lengths(a: f64, b: f64, c: f64) -> f64 {
    if a <= 0.0 {
        return f64::NAN;
    }
    a * (1.0 + b.max(0.0)).ln() + c.max(0.0)
}

pub fn dp_position_error_m(x: f64, y: f64, set_x: f64, set_y: f64) -> f64 {
    let dx = set_x - x;
    let dy = set_y - y;
    (dx * dx + dy * dy).sqrt()
}

pub fn ordered_rudder_deg(error_deg: f64, yaw_rate_dps: f64, integral: &mut f64, dt_s: f64) -> f64 {
    let error = wrap_signed(error_deg);
    let dt = if dt_s.is_finite() && dt_s > 0.0 { dt_s } else { 0.2 };
    *integral = (*integral + error * dt).clamp(-20.0, 20.0);
    let raw = 1.5 * error + 0.02 * *integral + 0.8 * yaw_rate_dps;
    raw.clamp(-RUDDER_LIMIT_DEG, RUDDER_LIMIT_DEG)
}

/// One command. Call `next_step` when the craft refuses it.
pub fn decide(input: &ControlInput) -> ControlCommand {
    if !input.contract_nominal {
        return contract_hold(input);
    }
    if !input.position_known && input.mode != Mode::Orbit {
        return position_unknown(input);
    }
    match input.mode {
        Mode::Sea => sea_decide(input),
        Mode::Road => road_decide(input),
        Mode::Rail => rail_decide(input),
        Mode::Air => air_decide(input),
        Mode::Orbit => orbit_decide(input),
    }
}

/// The option in `failed` did not happen. Return the single next step, or the same loss if none remains.
pub fn next_step(input: &ControlInput, failed: &ControlCommand) -> ControlCommand {
    let start = failed.ladder_step.saturating_add(1);
    match input.mode {
        Mode::Sea => sea_from_step(input, start, failed.reason.as_str()),
        Mode::Road => road_from_step(input, start, failed.reason.as_str()),
        Mode::Rail => rail_from_step(input, start, failed.reason.as_str()),
        Mode::Air => air_loss(input, "NEXT_STEP_AFTER_REFUSAL"),
        Mode::Orbit => orbit_from_step(input, start, failed.reason.as_str()),
    }
}

fn contract_hold(input: &ControlInput) -> ControlCommand {
    match input.mode {
        Mode::Sea => sea_from_step(input, 4, "CONTRACT_NOT_NOMINAL"),
        Mode::Road => road_from_step(input, 1, "CONTRACT_NOT_NOMINAL"),
        Mode::Rail => rail_from_step(input, 1, "CONTRACT_NOT_NOMINAL"),
        Mode::Air => {
            let mut cmd = ControlCommand::bare(CommandKind::ManualReversion, 1, "CONTRACT_NOT_NOMINAL");
            cmd.speed_mps = input.airspeed_mps.max(0.0);
            cmd.altitude_m = input.altitude_m;
            cmd.heading_deg = input.heading_deg;
            cmd
        }
        Mode::Orbit => {
            if urgent_contact(input).is_some() && input.propellant_kg > 0.0 && input.equipment.thruster_answers {
                orbit_burn(input, "CONTRACT_OFF_BUT_COLLISION_BURN")
            } else {
                let mut cmd = ControlCommand::bare(CommandKind::SafeDrift, 3, "CONTRACT_NOT_NOMINAL");
                cmd.altitude_m = input.z_m;
                cmd
            }
        }
    }
}

fn position_unknown(input: &ControlInput) -> ControlCommand {
    match input.mode {
        Mode::Sea => sea_from_step(input, 4, "POSITION_UNKNOWN"),
        Mode::Road => road_from_step(input, 1, "POSITION_UNKNOWN"),
        Mode::Rail => rail_from_step(input, 2, "POSITION_UNKNOWN"),
        Mode::Air => air_loss(input, "POSITION_UNKNOWN"),
        Mode::Orbit => orbit_decide(input),
    }
}

fn sea_decide(input: &ControlInput) -> ControlCommand {
    if input.dp_engaged && !input.dp_requested {
        if input.equipment.dp_accepts {
            let mut cmd = ControlCommand::bare(CommandKind::DpRelease, 1, "DP_RELEASE_BEFORE_VOYAGE");
            cmd.heading_deg = input.heading_deg;
            cmd.speed_mps = input.speed_mps;
            return cmd;
        }
        return sea_from_step(input, 2, "DP_RELEASE_REFUSED");
    }
    if input.dp_requested && input.speed_mps <= SEA_DP_MAX_SPEED_MPS {
        return sea_dp(input);
    }
    if input.dp_requested && input.speed_mps > SEA_DP_MAX_SPEED_MPS {
        let mut cmd = sea_voyage(input, "DP_REFUSED_SPEED_TOO_HIGH");
        if sea_primary_ok(input) {
            return cmd;
        }
        cmd.reason = "DP_REFUSED_SPEED_TOO_HIGH".to_string();
        return sea_from_step(input, 2, &cmd.reason);
    }
    if let Some(danger) = sea_danger(input) {
        if input.equipment.autopilot_accepts && input.equipment.rudder_answers {
            return danger;
        }
        return sea_from_step(input, 2, "DANGER_PRIMARY_REFUSED");
    }
    if shallow(input) {
        let mut cmd = sea_voyage(input, "SHALLOW_WATER_SLOW");
        cmd.speed_mps = cmd.speed_mps.min(2.0);
        cmd.propeller_fraction = fraction(cmd.speed_mps, input.max_speed_mps);
        cmd.pitch_fraction = cmd.propeller_fraction;
        if sea_primary_ok(input) {
            return cmd;
        }
        return sea_from_step(input, 2, "SHALLOW_PRIMARY_REFUSED");
    }
    if sea_primary_ok(input) {
        return sea_voyage(input, "VOYAGE");
    }
    sea_from_step(input, 2, "VOYAGE_PRIMARY_REFUSED")
}

fn sea_primary_ok(input: &ControlInput) -> bool {
    input.equipment.autopilot_accepts && input.equipment.rudder_answers && input.equipment.governor_accepts
}

fn sea_dp(input: &ControlInput) -> ControlCommand {
    let error = dp_position_error_m(input.x_m, input.y_m, input.dp_x_m, input.dp_y_m);
    let heading_error = wrap_signed(input.dp_heading_deg - input.heading_deg);
    if !input.equipment.dp_accepts {
        return sea_from_step(input, 4, "DP_CONTROLLER_REFUSED");
    }
    let on_station = error <= input.dp_radius_m.max(0.0) && heading_error.abs() <= 5.0;
    let kind = if on_station { CommandKind::DpHold } else { CommandKind::DpCreep };
    let mut cmd = ControlCommand::bare(kind, 1, if on_station { "DP_ON_STATION" } else { "DP_OFF_STATION" });
    cmd.heading_deg = input.dp_heading_deg;
    cmd.speed_mps = 0.0;
    cmd.dp_error_m = error;
    cmd.heading_error_deg = heading_error;
    cmd.on_station = on_station;
    cmd
}

fn sea_voyage(input: &ControlInput, reason: &str) -> ControlCommand {
    let mut integral = input.rudder_integral;
    let heading = heading_to(input.x_m, input.y_m, input.dest_x_m, input.dest_y_m)
        .unwrap_or(input.heading_deg);
    let biased = wrap_360(heading + wind_bias(input, heading));
    let error = wrap_signed(biased - input.heading_deg);
    let rudder = ordered_rudder_deg(error, input.yaw_rate_dps, &mut integral, input.dt_s);
    let speed = cruise_speed(input);
    let mut cmd = ControlCommand::bare(CommandKind::NominalTrack, 1, reason);
    cmd.heading_deg = biased;
    cmd.speed_mps = speed;
    cmd.rudder_deg = rudder;
    cmd.propeller_fraction = fraction(speed, input.max_speed_mps);
    cmd.pitch_fraction = cmd.propeller_fraction;
    cmd.heading_error_deg = error;
    cmd.rudder_integral = integral;
    cmd
}

fn sea_danger(input: &ControlInput) -> Option<ControlCommand> {
    let contact = urgent_contact(input)?;
    let bearing = wrap_signed(contact.bearing_deg);
    let tti = contact.range_m / contact.closing_mps.max(0.001);
    let mut heading = input.heading_deg;
    let mut speed = input.speed_mps.max(0.0) * 0.7;
    let reason;
    if bearing.abs() <= 6.0 {
        heading = wrap_360(input.heading_deg + 35.0);
        reason = "SEA_HEAD_ON_ALTER_STARBOARD";
    } else if (5.0..112.5).contains(&bearing) {
        heading = wrap_360(input.heading_deg + 40.0);
        reason = "SEA_GIVE_WAY_ALTER_STARBOARD";
    } else if (-112.5..-5.0).contains(&bearing) && tti < 45.0 {
        heading = wrap_360(input.heading_deg + 35.0);
        speed = input.speed_mps.max(0.0) * 0.6;
        reason = "SEA_STAND_ON_LATE_ACTION";
    } else if bearing.abs() > 112.5 && tti < 45.0 {
        speed = input.speed_mps.max(0.0) * 0.5;
        reason = "SEA_OVERTAKEN_REDUCE_SPEED";
    } else {
        return None;
    }
    let reach = sea_reach_m(input);
    if contact.range_m < reach {
        speed = speed.min(input.speed_mps.max(0.0) * 0.5);
    }
    let mut integral = input.rudder_integral;
    let error = wrap_signed(heading - input.heading_deg);
    let rudder = ordered_rudder_deg(error, input.yaw_rate_dps, &mut integral, input.dt_s);
    let mut cmd = ControlCommand::bare(CommandKind::DangerAvoidance, 1, reason);
    cmd.heading_deg = heading;
    cmd.speed_mps = speed;
    cmd.rudder_deg = rudder;
    cmd.propeller_fraction = fraction(speed, input.max_speed_mps.max(speed).max(0.1));
    cmd.pitch_fraction = cmd.propeller_fraction;
    cmd.heading_error_deg = error;
    cmd.rudder_integral = integral;
    Some(cmd)
}

fn sea_from_step(input: &ControlInput, step: u8, why: &str) -> ControlCommand {
    if step <= 2 && input.equipment.emergency_steering_answers {
        let heading = heading_to(input.x_m, input.y_m, input.dest_x_m, input.dest_y_m)
            .unwrap_or(input.heading_deg);
        let mut cmd = ControlCommand::bare(
            CommandKind::EmergencySteering,
            2,
            format!("{why}_EMERGENCY_STEERING"),
        );
        cmd.heading_deg = heading;
        cmd.speed_mps = input.speed_mps.min(2.0).max(0.0);
        return cmd;
    }
    if step <= 3 && input.equipment.propellers_answering >= 2 && input.equipment.governor_accepts {
        let mut cmd = ControlCommand::bare(
            CommandKind::DifferentialThrust,
            3,
            format!("{why}_DIFFERENTIAL_THRUST"),
        );
        cmd.heading_deg = input.heading_deg;
        cmd.port_fraction = 0.35;
        cmd.starboard_fraction = -0.35;
        return cmd;
    }
    if step <= 4 && input.equipment.propellers_answering >= 1 && input.equipment.governor_accepts {
        let mut cmd = ControlCommand::bare(CommandKind::AsternStop, 4, format!("{why}_ASTERN_STOP"));
        cmd.heading_deg = input.heading_deg;
        cmd.propeller_fraction = -0.8;
        cmd.pitch_fraction = -0.8;
        return cmd;
    }
    if step <= 5 && input.equipment.anchor_available && input.equipment.depth_allows_anchor {
        let mut cmd = ControlCommand::bare(CommandKind::LetGoAnchor, 5, format!("{why}_ANCHOR"));
        cmd.heading_deg = input.heading_deg;
        return cmd;
    }
    let mut cmd = ControlCommand::bare(CommandKind::NotUnderCommand, 6, format!("{why}_NO_REMAINING_CONTROL"));
    cmd.heading_deg = input.heading_deg;
    cmd
}

fn road_decide(input: &ControlInput) -> ControlCommand {
    let stop = stopping_distance_m(input.speed_mps, input.mu, input.eta, input.reaction_s);
    if let Some(contact) = urgent_contact(input) {
        if contact.range_m <= stop && input.equipment.brake_answers {
            return road_brake(input, CommandKind::ServiceBrake, 1, "ROAD_BRAKE_FITS");
        }
        if input.equipment.brake_answers {
            return road_brake(input, CommandKind::ServiceBrake, 1, "ROAD_BRAKE_FOR_CONTACT");
        }
        return road_from_step(input, 2, "ROAD_BRAKE_REFUSED");
    }
    if input.equipment.road_steering_answers && input.equipment.governor_accepts {
        let heading = heading_to(input.x_m, input.y_m, input.dest_x_m, input.dest_y_m)
            .unwrap_or(input.heading_deg);
        let speed = cruise_speed(input);
        let mut cmd = ControlCommand::bare(CommandKind::NominalTrack, 1, "ROAD_TRACK");
        cmd.heading_deg = heading;
        cmd.speed_mps = speed;
        cmd.propeller_fraction = fraction(speed, input.max_speed_mps);
        return cmd;
    }
    road_from_step(input, 2, "ROAD_TRACK_REFUSED")
}

fn road_from_step(input: &ControlInput, step: u8, why: &str) -> ControlCommand {
    if step <= 1 && input.equipment.brake_answers {
        return road_brake(input, CommandKind::ServiceBrake, 1, format!("{why}_SERVICE_BRAKE"));
    }
    if step <= 2 && input.equipment.road_steering_answers && input.equipment.side_path_clear {
        let mut cmd = ControlCommand::bare(CommandKind::SteerClear, 2, format!("{why}_STEER_CLEAR"));
        cmd.heading_deg = wrap_360(input.heading_deg + 15.0);
        cmd.speed_mps = input.speed_mps.max(0.0) * 0.5;
        return cmd;
    }
    let mut cmd = ControlCommand::bare(CommandKind::LossOfControl, 3, format!("{why}_NO_REMAINING_CONTROL"));
    cmd.heading_deg = input.heading_deg;
    cmd
}

fn road_brake(input: &ControlInput, kind: CommandKind, step: u8, reason: impl Into<String>) -> ControlCommand {
    let mut cmd = ControlCommand::bare(kind, step, reason);
    cmd.heading_deg = input.heading_deg;
    cmd.speed_mps = 0.0;
    cmd.propeller_fraction = 0.0;
    cmd
}

fn rail_decide(input: &ControlInput) -> ControlCommand {
    let decel = (input.mu.max(0.05) * GRAVITY * input.eta.max(0.3)).max(0.2);
    let brake_need = braking_distance_m(input.speed_mps, input.mu.max(0.05), input.eta.max(0.3));
    let obstructed = urgent_contact(input).is_some();
    let overspeed = input.permitted_speed_mps > 0.0 && input.speed_mps > input.permitted_speed_mps;
    let short_authority = input.authority_m > 0.0 && input.authority_m <= brake_need;
    if obstructed || overspeed || short_authority {
        let why = if obstructed {
            "RAIL_OBSTRUCTION"
        } else if overspeed {
            "RAIL_OVERSPEED"
        } else {
            "RAIL_AUTHORITY_SHORT"
        };
        return rail_from_step(input, 1, why);
    }
    if input.equipment.governor_accepts {
        let speed = if input.permitted_speed_mps > 0.0 {
            cruise_speed(input).min(input.permitted_speed_mps)
        } else {
            cruise_speed(input)
        };
        let mut cmd = ControlCommand::bare(CommandKind::NominalTrack, 1, "RAIL_TRACK");
        cmd.heading_deg = input.heading_deg;
        cmd.speed_mps = speed;
        cmd.propeller_fraction = fraction(speed, input.max_speed_mps.max(speed).max(0.1));
        let _ = decel;
        return cmd;
    }
    rail_from_step(input, 2, "RAIL_POWER_REFUSED")
}

fn rail_from_step(input: &ControlInput, step: u8, why: &str) -> ControlCommand {
    if step <= 1 && input.equipment.brake_answers {
        let mut cmd = ControlCommand::bare(CommandKind::ServiceBrake, 1, format!("{why}_SERVICE_BRAKE"));
        cmd.heading_deg = input.heading_deg;
        return cmd;
    }
    if step <= 2 && input.equipment.emergency_brake_answers {
        let mut cmd = ControlCommand::bare(CommandKind::EmergencyBrake, 2, format!("{why}_EMERGENCY_BRAKE"));
        cmd.heading_deg = input.heading_deg;
        return cmd;
    }
    let mut cmd = ControlCommand::bare(CommandKind::WithdrawAuthority, 3, format!("{why}_WITHDRAW_AUTHORITY"));
    cmd.heading_deg = input.heading_deg;
    cmd
}

fn air_decide(input: &ControlInput) -> ControlCommand {
    if input.angle_of_attack_deg >= input.stall_angle_deg {
        if input.equipment.flight_accepts {
            return air_unstall(input, "AIR_STALL_REDUCE_AOA");
        }
        return air_loss(input, "AIR_STALL_CONTROL_REFUSED");
    }
    if urgent_contact(input).is_some() {
        if input.equipment.flight_accepts {
            let mut cmd = ControlCommand::bare(CommandKind::AvoidancePath, 1, "AIR_AVOID_NO_STOP");
            cmd.heading_deg = wrap_360(input.heading_deg + 20.0);
            cmd.speed_mps = input.airspeed_mps.max(input.speed_mps).max(1.0);
            cmd.altitude_m = input.altitude_m + 300.0;
            return cmd;
        }
        return air_loss(input, "AIR_AVOID_REFUSED");
    }
    if input.equipment.flight_accepts {
        let heading = heading_to(input.x_m, input.y_m, input.dest_x_m, input.dest_y_m)
            .unwrap_or(input.heading_deg);
        let mut cmd = ControlCommand::bare(CommandKind::NominalTrack, 1, "AIR_TRACK");
        cmd.heading_deg = heading;
        cmd.speed_mps = input.airspeed_mps.max(1.0);
        cmd.altitude_m = if input.dest_z_m.is_finite() && input.dest_z_m != 0.0 {
            input.dest_z_m
        } else {
            input.altitude_m
        };
        return cmd;
    }
    air_loss(input, "AIR_TRACK_REFUSED")
}

fn air_unstall(input: &ControlInput, reason: &str) -> ControlCommand {
    let mut cmd = ControlCommand::bare(CommandKind::ReduceAngleOfAttack, 1, reason);
    cmd.heading_deg = input.heading_deg;
    cmd.speed_mps = input.airspeed_mps.max(input.speed_mps).max(1.0);
    cmd.altitude_m = input.altitude_m;
    cmd
}

fn air_loss(input: &ControlInput, why: &str) -> ControlCommand {
    let mut cmd = ControlCommand::bare(CommandKind::LossOfControl, 2, why);
    cmd.heading_deg = input.heading_deg;
    cmd.speed_mps = input.airspeed_mps.max(0.0);
    cmd.altitude_m = input.altitude_m;
    cmd
}

fn orbit_decide(input: &ControlInput) -> ControlCommand {
    if urgent_contact(input).is_some() {
        return orbit_from_step(input, 1, "ORBIT_COLLISION");
    }
    let mut cmd = ControlCommand::bare(CommandKind::NominalTrack, 1, "ORBIT_STATION");
    cmd.altitude_m = input.z_m;
    cmd.delta_v_mps = 0.0;
    cmd
}

fn orbit_from_step(input: &ControlInput, step: u8, why: &str) -> ControlCommand {
    if step <= 1 && input.propellant_kg > 0.0 && input.equipment.thruster_answers {
        return orbit_burn(input, why);
    }
    if step <= 2 && input.equipment.reaction_wheels_answer {
        let mut cmd = ControlCommand::bare(CommandKind::AttitudeOnly, 2, format!("{why}_ATTITUDE_ONLY"));
        cmd.altitude_m = input.z_m;
        return cmd;
    }
    let mut cmd = ControlCommand::bare(CommandKind::SafeDrift, 3, format!("{why}_SAFE_DRIFT"));
    cmd.altitude_m = input.z_m;
    cmd
}

fn orbit_burn(input: &ControlInput, why: &str) -> ControlCommand {
    let closing = urgent_contact(input).map(|c| c.closing_mps).unwrap_or(0.5);
    let mut cmd = ControlCommand::bare(CommandKind::AvoidanceBurn, 1, format!("{why}_AVOIDANCE_BURN"));
    cmd.delta_v_mps = closing.clamp(0.05, 2.0);
    cmd.altitude_m = input.z_m;
    cmd
}

fn urgent_contact(input: &ControlInput) -> Option<&Contact> {
    input
        .contacts
        .iter()
        .filter(|c| c.confidence >= CONFIDENCE_FLOOR && c.range_m > 0.0 && c.closing_mps > 0.0)
        .min_by(|a, b| {
            let ta = a.range_m / a.closing_mps;
            let tb = b.range_m / b.closing_mps;
            ta.partial_cmp(&tb).unwrap_or(std::cmp::Ordering::Equal)
        })
}

fn cruise_speed(input: &ControlInput) -> f64 {
    if input.max_speed_mps > 0.0 {
        input.max_speed_mps
    } else {
        input.speed_mps.max(0.0)
    }
}

fn fraction(target: f64, max_speed: f64) -> f64 {
    if max_speed <= 1e-6 {
        return 0.0;
    }
    (target / max_speed).clamp(-1.0, 1.0)
}

fn wind_bias(input: &ControlInput, heading: f64) -> f64 {
    let relative = wrap_signed(input.wind_from_deg - heading);
    (input.wind_mps * relative.to_radians().sin() * 0.4).clamp(-10.0, 10.0)
}

fn shallow(input: &ControlInput) -> bool {
    input.depth_m > 0.0 && input.draft_m > 0.0 && (input.depth_m - input.draft_m) < 1.0
}

fn sea_reach_m(input: &ControlInput) -> f64 {
    let (a, b, c, estimated) = if input.stop_a > 0.0 {
        (input.stop_a, input.stop_b, input.stop_c, false)
    } else {
        (16.0, 1.5, 0.8, true)
    };
    let lengths = sea_stopping_ship_lengths(a, b, c);
    let hull = if input.length_m > 0.0 { input.length_m } else { 100.0 };
    let current_scale = 1.0 + input.current_mps.max(0.0) / input.speed_mps.max(1.0);
    let reach = lengths * hull * current_scale.clamp(1.0, 2.0);
    let _ = estimated;
    reach
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sea() -> ControlInput {
        let mut input = ControlInput::new(Mode::Sea);
        input.contract_nominal = true;
        input.position_known = true;
        input.dest_y_m = 1000.0;
        input.speed_mps = 6.0;
        input.max_speed_mps = 8.0;
        input.length_m = 150.0;
        input.equipment.autopilot_accepts = true;
        input.equipment.rudder_answers = true;
        input.equipment.governor_accepts = true;
        input.equipment.propellers_answering = 1;
        input
    }

    #[test]
    fn name_is_resolve() {
        assert_eq!(SOFTWARE_NAME, "Resolve");
    }

    #[test]
    fn sea_nominal_heads_north() {
        let cmd = decide(&sea());
        assert_eq!(cmd.kind, CommandKind::NominalTrack);
        assert!(cmd.heading_deg.abs() < 1.0);
        assert!(cmd.rudder_deg.abs() <= 35.0);
    }

    #[test]
    fn sea_head_on_alters_starboard() {
        let mut input = sea();
        input.contacts.push(Contact {
            bearing_deg: 0.0,
            range_m: 400.0,
            closing_mps: 8.0,
            confidence: 0.95,
        });
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::DangerAvoidance);
        assert!((cmd.heading_deg - 35.0).abs() < 0.1);
    }

    #[test]
    fn dp_hold_does_not_order_a_propeller() {
        let mut input = sea();
        input.speed_mps = 0.4;
        input.dp_requested = true;
        input.dp_radius_m = 8.0;
        input.equipment.dp_accepts = true;
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::DpHold);
        assert!(cmd.on_station);
        assert_eq!(cmd.propeller_fraction, 0.0);
        assert_eq!(cmd.rudder_deg, 0.0);
    }

    #[test]
    fn dp_is_refused_at_transit_speed() {
        let mut input = sea();
        input.speed_mps = 10.0;
        input.dp_requested = true;
        input.equipment.dp_accepts = true;
        let cmd = decide(&input);
        assert_ne!(cmd.kind, CommandKind::DpHold);
        assert!(cmd.reason.contains("DP_REFUSED_SPEED_TOO_HIGH"));
    }

    #[test]
    fn two_propellers_are_the_step_after_a_dead_rudder() {
        let mut input = sea();
        input.equipment.rudder_answers = false;
        input.equipment.autopilot_accepts = false;
        input.equipment.propellers_answering = 2;
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::DifferentialThrust);
        assert!(cmd.port_fraction > 0.0);
        assert!(cmd.starboard_fraction < 0.0);
    }

    #[test]
    fn next_step_after_astern_is_anchor_when_it_can_answer() {
        let mut input = sea();
        input.equipment.anchor_available = true;
        input.equipment.depth_allows_anchor = true;
        let failed = ControlCommand::bare(CommandKind::AsternStop, 4, "FAILED");
        let cmd = next_step(&input, &failed);
        assert_eq!(cmd.kind, CommandKind::LetGoAnchor);
        assert_eq!(cmd.ladder_step, 5);
    }

    #[test]
    fn nothing_left_is_not_under_command() {
        let mut input = sea();
        input.equipment.governor_accepts = false;
        input.equipment.rudder_answers = false;
        input.equipment.autopilot_accepts = false;
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::NotUnderCommand);
    }

    #[test]
    fn road_brake_distance_grows_as_grip_falls() {
        let dry = braking_distance_m(20.0, 0.8, 1.0);
        let ice = braking_distance_m(20.0, 0.1, 1.0);
        assert!(ice > dry * 5.0);
    }

    #[test]
    fn road_with_no_brake_and_a_clear_side_steers() {
        let mut input = ControlInput::new(Mode::Road);
        input.contract_nominal = true;
        input.position_known = true;
        input.speed_mps = 12.0;
        input.mu = 0.8;
        input.eta = 1.0;
        input.contacts.push(Contact {
            bearing_deg: 0.0,
            range_m: 20.0,
            closing_mps: 12.0,
            confidence: 0.9,
        });
        input.equipment.side_path_clear = true;
        input.equipment.road_steering_answers = true;
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::SteerClear);
    }

    #[test]
    fn rail_obstruction_does_not_turn() {
        let mut input = ControlInput::new(Mode::Rail);
        input.contract_nominal = true;
        input.position_known = true;
        input.heading_deg = 12.0;
        input.speed_mps = 20.0;
        input.mu = 0.2;
        input.eta = 0.8;
        input.equipment.brake_answers = true;
        input.contacts.push(Contact {
            bearing_deg: 0.0,
            range_m: 300.0,
            closing_mps: 20.0,
            confidence: 0.99,
        });
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::ServiceBrake);
        assert_eq!(cmd.heading_deg, 12.0);
        assert_eq!(cmd.speed_mps, 0.0);
    }

    #[test]
    fn air_stall_does_not_stop() {
        let mut input = ControlInput::new(Mode::Air);
        input.contract_nominal = true;
        input.position_known = true;
        input.airspeed_mps = 70.0;
        input.altitude_m = 1200.0;
        input.angle_of_attack_deg = 18.0;
        input.stall_angle_deg = 14.0;
        input.equipment.flight_accepts = true;
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::ReduceAngleOfAttack);
        assert!(cmd.speed_mps > 1.0);
    }

    #[test]
    fn orbit_without_a_thruster_does_not_invent_a_burn() {
        let mut input = ControlInput::new(Mode::Orbit);
        input.contract_nominal = true;
        input.propellant_kg = 4.0;
        input.equipment.reaction_wheels_answer = true;
        input.contacts.push(Contact {
            bearing_deg: 0.0,
            range_m: 1000.0,
            closing_mps: 2.0,
            confidence: 0.9,
        });
        let cmd = decide(&input);
        assert_eq!(cmd.kind, CommandKind::AttitudeOnly);
        assert_eq!(cmd.delta_v_mps, 0.0);
    }
}