use crate::guidance::{
    EnvironmentalTarget, KinematicState, MxUnifiedGuidanceEngine, Vector3D,
};
use crate::iot_license::AutonomousLockState;

/// One contact already reduced to meters by a sensor driver.
/// The driver, not this file, reads the sensor's own binary packet.
#[derive(Debug, Clone)]
pub struct RangeContact {
    pub contact_id: String,
    pub position_meters: Vector3D,
    pub velocity_mps: Vector3D,
    pub confidence: f64,
    pub radius_meters: f64,
}

/// The craft's own motion, after GNSS and the inertial unit have been read.
#[derive(Debug, Clone, Copy)]
pub struct OwnMotion {
    pub position_known: bool,
    pub position_meters: Vector3D,
    pub velocity_mps: Vector3D,
    pub acceleration_mps2: Vector3D,
}

/// One moment from every sensor that has already been translated into numbers.
#[derive(Debug, Clone)]
pub struct SensorSlice {
    pub own: OwnMotion,
    pub contacts: Vec<RangeContact>,
}

/// A request for the machine's own drive controller.
/// This file does not open a brake wire, a CAN bus, or a motor.
#[derive(Debug, Clone)]
pub struct MachineCommand {
    pub dispatch_allowed: bool,
    pub hold_position: bool,
    pub requested_velocity_mps: Vector3D,
    pub reason: String,
}

fn stopped() -> Vector3D {
    Vector3D { x: 0.0, y: 0.0, z: 0.0 }
}

/// Bring the sensor numbers and the license to the guidance brain.
/// Returns a command the vehicle computer may forward only if its own safety unit accepts it.
pub fn fuse_and_command(
    engine: &MxUnifiedGuidanceEngine,
    license: AutonomousLockState,
    slice: &SensorSlice,
) -> Result<MachineCommand, &'static str> {
    if !slice.own.position_known {
        return Err("SENSOR LINK REJECTED: own position is not known.");
    }

    if license != AutonomousLockState::FullyAutonomousNominal {
        return Ok(MachineCommand {
            dispatch_allowed: false,
            hold_position: true,
            requested_velocity_mps: stopped(),
            reason: "LICENSE_NOT_NOMINAL_HOLD".to_string(),
        });
    }

    let own_state = KinematicState {
        position: slice.own.position_meters,
        velocity: slice.own.velocity_mps,
        acceleration: slice.own.acceleration_mps2,
    };
    let targets: Vec<EnvironmentalTarget> = slice
        .contacts
        .iter()
        .map(|contact| EnvironmentalTarget {
            target_id: contact.contact_id.clone(),
            current_state: KinematicState {
                position: contact.position_meters,
                velocity: contact.velocity_mps,
                acceleration: stopped(),
            },
            tracking_confidence: contact.confidence,
            spatial_bounding_radius_meters: contact.radius_meters,
        })
        .collect();

    let decision = engine.process_tactical_slice(own_state, &targets)?;
    Ok(MachineCommand {
        dispatch_allowed: true,
        hold_position: false,
        requested_velocity_mps: decision.targeted_thrust_vector,
        reason: decision.diagnostic_log,
    })
}