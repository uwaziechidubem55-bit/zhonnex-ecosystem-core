use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum VehicleDomain {
    MaritimeVessel,
    AviationAircraft,
    TerrestrialSurfaceCraft,
    SubsurfaceRailLine,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum AutonomousLockState {
    FullyAutonomousNominal,
    DegradedManualControlOnly,
    HardLockdownSafeParkedOrAnchored,
}

pub struct OnBoardAssetAuditor {
    pub asset_serial_id: String,
    pub transportation_domain: VehicleDomain,
    pub parent_conglomerate_id: String,
    pub last_successful_sync_epoch: u64,
    pub strict_offline_timeout_seconds: u64,
}

impl OnBoardAssetAuditor {
    pub fn initialize_asset_agent(serial: &str, domain: VehicleDomain, client_id: &str) -> Self {
        OnBoardAssetAuditor {
            asset_serial_id: serial.to_string(),
            transportation_domain: domain,
            parent_conglomerate_id: client_id.to_string(),
            last_successful_sync_epoch: 0,
            strict_offline_timeout_seconds: 86400, // Enforces cellular/satellite check every 24 hours
        }
    }

    /// Evaluates cryptographic telemetry flags sent from the Zhonnex Cloud Core.
    /// Dictates craft action based on the specific industrial domain physics.
    pub fn enforce_licensing_state(&mut self, cloud_payload: &HashMap<String, String>) -> AutonomousLockState {
        let current_time_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let is_active = cloud_payload.get("rental_contract_active").map_or("false", |v| v.as_str()) == "true";
        let checksum_verified = cloud_payload.get("checksum_verified").map_or("false", |v| v.as_str()) == "true";

        if !checksum_verified {
            println!("[SECURITY BREACH] [ID: {}] Handshake failed tampering check. Deploying localized safe-stop protocols for Domain: {:?}", self.asset_serial_id, self.transportation_domain);
            return AutonomousLockState::HardLockdownSafeParkedOrAnchored;
        }

        // 🔄 Automated Disappearance/Deactivation Loop Execution (If Stripe Payment Lapses)
        if !is_active {
            println!("[RENTAL REJECTED] [ID: {}] Contract balance outstanding in Velocity Ledger. Decoupling autonomous pathfinding arrays.", self.asset_serial_id);
            return match self.transportation_domain {
                VehicleDomain::AviationAircraft => {
                    // Aircraft cannot stop mid-air; switch to basic safe auto-land/manual flight modes
                    println!("[DOMAIND SAFETY] Reverting aircraft to auxiliary manual instrumentation.");
                    AutonomousLockState::DegradedManualControlOnly
                },
                _ => {
                    // Ships, trains, and carts execute controlled emergency stopping paths
                    println!("[DOMAIN SAFETY] Commanding safe-anchor/brake stabilization vectors.");
                    AutonomousLockState::HardLockdownSafeParkedOrAnchored
                }
            };
        }

        self.last_successful_sync_epoch = current_time_epoch;
        println!("[MX SUITE COMPLETE] [ID: {}] License Active. Multi-Domain Autopilot fully online.", self.asset_serial_id);
        
        AutonomousLockState::FullyAutonomousNominal
    }
}
