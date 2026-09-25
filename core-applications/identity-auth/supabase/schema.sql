-- =============================================================================
--               ZHONNEX CORP — CENTRAL DATABASE MATRIX SCHEMAS
-- =============================================================================

-- 1. ENUM TYPE CONSTRAINTS FOR SYSTEM-WIDE COMPLIANCE
CREATE TYPE zhonnex_role_enum AS ENUM ('CUSTOMER', 'STAFF', 'MANAGEMENT_MD', 'MANAGEMENT_SECRETARY', 'OVERLORD');
CREATE TYPE account_tier_enum AS ENUM ('STANDARD_TIER', 'PRO', 'ENTERPRISE');
CREATE TYPE vehicle_domain_enum AS ENUM ('MaritimeVessel', 'AviationAircraft', 'TerrestrialSurfaceCraft', 'SubsurfaceRailLine');
CREATE TYPE rental_status_enum AS ENUM ('ACTIVE', 'LAPSED', 'OVERRIDDEN_LOCKDOWN');

-- 2. MASTER IDENTITY PROFILE SYSTEM (Binds your Vercel frontend with your Core)
CREATE TABLE IF NOT EXISTS public.zhonnex_identity_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    zhonnex_uid VARCHAR(64) UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    primary_email TEXT UNIQUE NOT NULL,
    assigned_role zhonnex_role_enum DEFAULT 'CUSTOMER' NOT NULL,
    account_tier account_tier_enum DEFAULT 'STANDARD_TIER' NOT NULL,
    tasks_completed_count INT DEFAULT 0 NOT NULL,
    contract_salary_cents INT DEFAULT 0 NOT NULL,
    bank_routing_or_bic VARCHAR(32),
    bank_iban_masked VARCHAR(64),
    is_security_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index critical search paths for sub-millisecond staff/manager identification speeds
CREATE INDEX IF NOT EXISTS idx_profile_zhonnex_uid ON public.zhonnex_identity_profiles(zhonnex_uid);
CREATE INDEX IF NOT EXISTS idx_profile_assigned_role ON public.zhonnex_identity_profiles(assigned_role);

-- 3. GLOBAL CONVEYANCE FLEET & ASSET REGISTRY (For renting the MX Suite)
CREATE TABLE IF NOT EXISTS public.zhonnex_mx_fleet_allocations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asset_serial_id VARCHAR(128) UNIQUE NOT NULL,
    transportation_domain vehicle_domain_enum NOT NULL,
    parent_conglomerate_name TEXT NOT NULL,
    monthly_rental_fee_cents INT NOT NULL,
    contract_status rental_status_enum DEFAULT 'ACTIVE' NOT NULL,
    checksum_verified BOOLEAN DEFAULT TRUE NOT NULL,
    last_satellite_sync_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fleet_serial_id ON public.zhonnex_mx_fleet_allocations(asset_serial_id);

-- =============================================================================
-- 🛡️ HARDENED SECURITY MATRIX: ROW-LEVEL SECURITY (RLS) RULES
-- =============================================================================
ALTER TABLE public.zhonnex_identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zhonnex_mx_fleet_allocations ENABLE ROW LEVEL SECURITY;

-- A. USER RULES: Customers can only interact with their own files
CREATE POLICY "Users can exclusively select their own profile dataset." 
    ON public.zhonnex_identity_profiles FOR SELECT 
    USING (auth.uid() = id AND is_security_locked = FALSE);

CREATE POLICY "Users can exclusively update non-sensitive identity fields." 
    ON public.zhonnex_identity_profiles FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND assigned_role = 'CUSTOMER');

-- B. MANAGER RULES: Executives can view employee productivity names and trigger staged salaries
CREATE POLICY "Managing Directors can read workforce profiles for performance audits." 
    ON public.zhonnex_identity_profiles FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.zhonnex_identity_profiles 
            WHERE id = auth.uid() AND assigned_role IN ('MANAGEMENT_MD', 'MANAGEMENT_SECRETARY', 'OVERLORD')
        )
    );

-- C. OVERLORD RULES: You bypass every data wall automatically
CREATE POLICY "Overlord possesses omnipotent override permissions across identities." 
    ON public.zhonnex_identity_profiles FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.zhonnex_identity_profiles WHERE id = auth.uid() AND assigned_role = 'OVERLORD'));

CREATE POLICY "Overlord possesses omnipotent override permissions across fleet allocations." 
    ON public.zhonnex_mx_fleet_allocations FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.zhonnex_identity_profiles WHERE id = auth.uid() AND assigned_role = 'OVERLORD'));

-- =============================================================================
-- 🔄 AUTOMATED AUDIT SYSTEM TIMESTAMPS
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_system_timestamp_mutation()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_identity_timestamp_modification 
    BEFORE UPDATE ON public.zhonnex_identity_profiles 
    FOR EACH ROW EXECUTE PROCEDURE trigger_system_timestamp_mutation();
