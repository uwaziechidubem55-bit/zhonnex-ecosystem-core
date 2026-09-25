use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TransportationDomain {
    Maritime,
    TerrestrialSurface,
    SubsurfaceRail,
    AtmosphericAviation,
    OrbitalAerospace,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct KinematicState {
    pub position: Vector3D,
    pub velocity: Vector3D,
    pub acceleration: Vector3D,
}

#[derive(Debug, Clone)]
pub struct EnvironmentalTarget {
    pub target_id: String,
    pub current_state: KinematicState,
    pub tracking_confidence: f64,
    pub spatial_bounding_radius_meters: f64,
}

pub struct DomainPhysicsProfile {
    pub maximum_velocity_mps: f64,
    pub critical_deceleration_limit: f64,
    pub dynamic_safety_buffer_multiplier: f64,
}

pub struct MxUnifiedGuidanceEngine {
    pub asset_id: String,
    pub domain: TransportationDomain,
    pub physics_profile: DomainPhysicsProfile,
    pub active_destination: Vector3D,
}

pub struct KineticEvasionCommand {
    pub must_override_hardware: bool,
    pub targeted_thrust_vector: Vector3D,
    pub execution_urgency_factor: f64,
    pub diagnostic_log: String,
}

impl MxUnifiedGuidanceEngine {
    pub fn instantiate_framework(
        id: &str,
        domain: TransportationDomain,
        destination: Vector3D,
    ) -> Self {
        let profile = match domain {
            TransportationDomain::Maritime => DomainPhysicsProfile {
                maximum_velocity_mps: 25.0,
                critical_deceleration_limit: 1.5,
                dynamic_safety_buffer_multiplier: 3.0,
            },
            TransportationDomain::TerrestrialSurface => DomainPhysicsProfile {
                maximum_velocity_mps: 45.0,
                critical_deceleration_limit: 8.5,
                dynamic_safety_buffer_multiplier: 1.5,
            },
            TransportationDomain::SubsurfaceRail => DomainPhysicsProfile {
                maximum_velocity_mps: 90.0,
                critical_deceleration_limit: 4.0,
                dynamic_safety_buffer_multiplier: 2.0,
            },
            TransportationDomain::AtmosphericAviation => DomainPhysicsProfile {
                maximum_velocity_mps: 340.0,
                critical_deceleration_limit: 25.0,
                dynamic_safety_buffer_multiplier: 5.0,
            },
            TransportationDomain::OrbitalAerospace => DomainPhysicsProfile {
                maximum_velocity_mps: 7800.0,
                critical_deceleration_limit: 150.0,
                dynamic_safety_buffer_multiplier: 10.0,
            },
        };

        MxUnifiedGuidanceEngine {
            asset_id: id.to_string(),
            domain,
            physics_profile: profile,
            active_destination: destination,
        }
    }

    pub fn process_tactical_slice(
        &self,
        own_state: KinematicState,
        sensor_matrix: &[EnvironmentalTarget],
    ) -> Result<KineticEvasionCommand, &'static str> {
        let calculation_epoch = Instant::now();

        if sensor_matrix.is_empty() {
            return Ok(KineticEvasionCommand {
                must_override_hardware: false,
                targeted_thrust_vector: self.calculate_nominal_path(own_state),
                execution_urgency_factor: 0.0,
                diagnostic_log: "ENVIRONMENT_CLEAR_PATH_NOMINAL".to_string(),
            });
        }

        for target in sensor_matrix {
            if target.tracking_confidence < 0.70 {
                continue;
            }

            let absolute_distance = self.calculate_distance(own_state.position, target.current_state.position);
            let combined_safety_radius = (target.spatial_bounding_radius_meters * self.physics_profile.dynamic_safety_buffer_multiplier) 
                + (own_state.velocity.x.abs() * self.physics_profile.dynamic_safety_buffer_multiplier);

            if absolute_distance <= combined_safety_radius {
                let closing_velocity = self.calculate_relative_velocity(own_state.velocity, target.current_state.velocity);
                let time_to_impact = absolute_distance / closing_velocity;

                if time_to_impact < 30.0 {
                    let evasion_vector = self.compute_evasion_vector(own_state, target.current_state);
                    let urgency = 1.0 - (time_to_impact / 30.0);

                    return Ok(KineticEvasionCommand {
                        must_override_hardware: true,
                        targeted_thrust_vector: evasion_vector,
                        execution_urgency_factor: urgency.clamp(0.0, 1.0),
                        diagnostic_log: format!(
                            "CRITICAL_BREACH_DETECTED_BY_TARGET_{}_IN_DOMAIN_{:?}", 
                            target.target_id, self.domain
                        ),
                    });
                }
            }
        }

        let process_duration = calculation_epoch.elapsed().as_nanos();
        
        Ok(KineticEvasionCommand {
            must_override_hardware: false,
            targeted_thrust_vector: self.calculate_nominal_path(own_state),
            execution_urgency_factor: 0.0,
            diagnostic_log: format!("NOMINAL_TACTICAL_COMPUTATION_COMPLETED_NANOSECONDS_{}", process_duration),
        })
    }

    fn calculate_distance(&self, a: Vector3D, b: Vector3D) -> f64 {
        ((a.x - b.x).powi(2) + (a.y - b.y).powi(2) + (a.z - b.z).powi(2)).sqrt()
    }

    fn calculate_relative_velocity(&self, own_vel: Vector3D, target_vel: Vector3D) -> f64 {
        let relative_x = own_vel.x - target_vel.x;
        let relative_y = own_vel.y - target_vel.y;
        let relative_z = own_vel.z - target_vel.z;
        let speed = (relative_x.powi(2) + relative_y.powi(2) + relative_z.powi(2)).sqrt();
        if speed == 0.0 { 0.001 } else { speed }
    }

    fn calculate_nominal_path(&self, own_state: KinematicState) -> Vector3D {
        let dx = self.active_destination.x - own_state.position.x;
        let dy = self.active_destination.y - own_state.position.y;
        let dz = self.active_destination.z - own_state.position.z;
        let length = (dx.powi(2) + dy.powi(2) + dz.powi(2)).sqrt();
        
        Vector3D {
            x: (dx / length) * self.physics_profile.maximum_velocity_mps,
            y: (dy / length) * self.physics_profile.maximum_velocity_mps,
            z: (dz / length) * self.physics_profile.maximum_velocity_mps,
        }
    }

    fn compute_evasion_vector(&self, own_state: KinematicState, target_state: KinematicState) -> Vector3D {
        let mut raw_evasion = Vector3D {
            x: own_state.position.x - target_state.position.x,
            y: own_state.position.y - target_state.position.y,
            z: own_state.position.z - target_state.position.z,
        };

        if self.domain == TransportationDomain::SubsurfaceRail {
            raw_evasion.x = 0.0;
            raw_evasion.y = 0.0;
            raw_evasion.z = 0.0; 
        }

        let length = (raw_evasion.x.powi(2) + raw_evasion.y.powi(2) + raw_evasion.z.powi(2)).sqrt();
        if length == 0.0 {
            return Vector3D { x: 0.0, y: 0.0, z: -self.physics_profile.maximum_velocity_mps };
        }

        Vector3D {
            x: (raw_evasion.x / length) * self.physics_profile.maximum_velocity_mps,
            y: (raw_evasion.y / length) * self.physics_profile.maximum_velocity_mps,
            z: (raw_evasion.z / length) * self.physics_profile.maximum_velocity_mps,
        }
    }
}
