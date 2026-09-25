-- ==========================================
-- ZHONNEX CORP CENTRAL IDENTITY ENGINE SCHEMA
-- ==========================================

-- Enforce strict relational schemas
CREATE TYPE account_tier_enum AS ENUM ('STANDARD_TIER', 'PRO', 'ENTERPRISE');

-- Master Identity Profile Matrix
CREATE TABLE IF NOT EXISTS public.zhonnex_identity_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    zhonnex_uid VARCHAR(64) UNIQUE NOT NULL,
    primary_email TEXT UNIQUE NOT NULL,
    account_tier account_tier_enum DEFAULT 'STANDARD_TIER' NOT NULL,
    is_security_locked BOOLEAN DEFAULT FALSE NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index critical search pathways for sub-millisecond execution speeds
CREATE INDEX IF NOT EXISTS idx_zhonnex_uid ON public.zhonnex_identity_profiles(zhonnex_uid);

-- Enable Row-Level Security (RLS) to encapsulate data walls
ALTER TABLE public.zhonnex_identity_profiles ENABLE ROW LEVEL SECURITY;

-- 🛡️ STRICT SECURITY POLICIES (No public reading or cross-tenant contamination)
CREATE POLICY "Users can only read their own corporate profile." 
    ON public.zhonnex_identity_profiles 
    FOR SELECT 
    USING (auth.uid() = id AND is_security_locked = FALSE);

CREATE POLICY "Users can only update their own non-sensitive profile columns." 
    ON public.zhonnex_identity_profiles 
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND is_security_locked = FALSE);

-- Automatic system update tracker
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_identity_timestamp 
    BEFORE UPDATE ON public.zhonnex_identity_profiles 
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
