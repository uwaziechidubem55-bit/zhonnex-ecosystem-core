pub mod guidance;
pub mod iot_license;

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::guidance::{
        EnvironmentalTarget, KinematicState, MxUnifiedGuidanceEngine, TransportationDomain, Vector3D,
    };
    use crate::iot_license::{AutonomousLockState, OnBoardAssetAuditor, VehicleDomain};

    fn origin() -> Vector3D {
        Vector3D { x: 0.0, y: 0.0, z: 0.0 }
    }

    fn still() -> KinematicState {
        KinematicState {
            position: origin(),
            velocity: origin(),
            acceleration: origin(),
        }
    }

    #[test]
    fn clear_sensor_matrix_stays_on_the_nominal_path() {
        let engine = MxUnifiedGuidanceEngine::instantiate_framework(
            "ZNX-SHUTTLE-04",
            TransportationDomain::AtmosphericAviation,
            Vector3D { x: 1000.0, y: 0.0, z: 500.0 },
        );
        let command = engine.process_tactical_slice(still(), &[]).expect("slice");
        assert!(!command.must_override_hardware);
        assert!(command.diagnostic_log.contains("ENVIRONMENT_CLEAR_PATH_NOMINAL"));
    }

    #[test]
    fn close_confident_target_forces_a_hardware_override() {
        let engine = MxUnifiedGuidanceEngine::instantiate_framework(
            "ZNX-MARINE-02",
            TransportationDomain::Maritime,
            Vector3D { x: 100.0, y: 0.0, z: 0.0 },
        );
        let own = KinematicState {
            position: origin(),
            velocity: Vector3D { x: 10.0, y: 0.0, z: 0.0 },
            acceleration: origin(),
        };
        let target = EnvironmentalTarget {
            target_id: "CONTACT-1".to_string(),
            current_state: KinematicState {
                position: Vector3D { x: 5.0, y: 0.0, z: 0.0 },
                velocity: origin(),
                acceleration: origin(),
            },
            tracking_confidence: 0.95,
            spatial_bounding_radius_meters: 20.0,
        };
        let command = engine.process_tactical_slice(own, &[target]).expect("slice");
        assert!(command.must_override_hardware);
        assert!(command.diagnostic_log.contains("CRITICAL_BREACH"));
    }

    #[test]
    fn unpaid_surface_craft_hard_locks() {
        let mut auditor = OnBoardAssetAuditor::initialize_asset_agent(
            "ZNX-RAIL-11",
            VehicleDomain::SubsurfaceRailLine,
            "ZHONNEX",
        );
        let mut payload = HashMap::new();
        payload.insert("checksum_verified".to_string(), "true".to_string());
        payload.insert("rental_contract_active".to_string(), "false".to_string());
        assert_eq!(
            auditor.enforce_licensing_state(&payload),
            AutonomousLockState::HardLockdownSafeParkedOrAnchored
        );
    }

    #[test]
    fn unpaid_aircraft_drops_to_manual() {
        let mut auditor = OnBoardAssetAuditor::initialize_asset_agent(
            "ZNX-SHUTTLE-04",
            VehicleDomain::AviationAircraft,
            "ZHONNEX",
        );
        let mut payload = HashMap::new();
        payload.insert("checksum_verified".to_string(), "true".to_string());
        payload.insert("rental_contract_active".to_string(), "false".to_string());
        assert_eq!(
            auditor.enforce_licensing_state(&payload),
            AutonomousLockState::DegradedManualControlOnly
        );
    }

    #[test]
    fn paid_and_verified_license_stays_nominal() {
        let mut auditor = OnBoardAssetAuditor::initialize_asset_agent(
            "ZNX-ROVER-19",
            VehicleDomain::TerrestrialSurfaceCraft,
            "ZHONNEX",
        );
        let mut payload = HashMap::new();
        payload.insert("checksum_verified".to_string(), "true".to_string());
        payload.insert("rental_contract_active".to_string(), "true".to_string());
        assert_eq!(
            auditor.enforce_licensing_state(&payload),
            AutonomousLockState::FullyAutonomousNominal
        );
    }
}