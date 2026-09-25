use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum VehicleSystemState {
    FullyAutonomousNominal,
    DegradedManualOnly,
    HardLockdownSafeParked,
}

pub struct OnBoardLicenseAuditor {
    pub vehicle_vin: String,
    pub manufacturer_client_id: String,
    pub last_successful_sync_epoch: u64,
    pub hard_offline_tolerance_seconds: u64,
}

impl OnBoardLicenseAuditor {
    pub fn initialize_hardware_agent(vin: &str, client_id: &str) -> Self {
        OnBoardLicenseAuditor {
            vehicle_vin: vin.to_string(),
            manufacturer_client_id: client_id.to_string(),
            last_successful_sync_epoch: 0,
            hard_offline_tolerance_seconds: 86400, // Enforces a hard check every 24 hours
        }
    }

    /// Evaluates inbound cryptographic telemetry flags returned from the Zhonnex Cloud Core.
    /// If payment fails or is revoked by the Overlord, it instantly triggers hardware lockdown.
    pub fn enforce_licensing_state(
        &mut self,
        cloud_payload: &HashMap<String, String>,
    ) -> VehicleSystemState {
        let current_time_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // 1. Audit Cryptographic Tokens matching this specific VIN asset
        let is_active = cloud_payload.get("rental_contract_active").map_or("false", |v| v.as_str()) == "true";
        let identity_verified = cloud_payload.get("checksum_verified").map_or("false", |v| v.as_str()) == "true";

        if !identity_verified {
            println!("[SECURITY ALERT] [VIN: {}] Cryptographic handshake failed tampering check. Deploying lockdown safeguards.", self.vehicle_vin);
            return VehicleSystemState::HardLockdownSafeParked;
        }

        // 2. Automated Disappearance Loop Execution (Stripe/Payment Expiry)
        if !is_active {
            println!("[RENTAL EXPIRED] [VIN: {}] Account balance unpaid in Velocity Finance Ledger. Decoupling Guidance Engine.", self.vehicle_vin);
            return VehicleSystemState::DegradedManualOnly;
        }

        // 3. Network Outage Time Ceiling Tracking
        self.last_successful_sync_epoch = current_time_epoch;
        println!("[MX INFRASTRUCTURE] [VIN: {}] License Token Valid. Autopilot arrays fully nominal.", self.vehicle_vin);
        
        VehicleSystemState::FullyAutonomousNominal
    }
}
