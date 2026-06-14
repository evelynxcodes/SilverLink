-- SilverLink Database Schema
-- PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE user_role AS ENUM ('FAMILY', 'CAREGIVER', 'ADMIN', 'EMERGENCY');
CREATE TYPE device_type AS ENUM ('WRISTBAND', 'HOME_HUB', 'PANIC_BUTTON');
CREATE TYPE device_status AS ENUM ('ONLINE', 'OFFLINE', 'ALERT', 'LOW_BATTERY');
CREATE TYPE alert_type AS ENUM ('FALL', 'HEART_RATE_HIGH', 'HEART_RATE_LOW', 'SPO2_LOW', 'SOS', 'INACTIVITY', 'WANDERING', 'STOVE_ON', 'DOOR_OPEN_NIGHT');
CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');
CREATE TYPE emergency_status AS ENUM ('TRIGGERED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED');
CREATE TYPE notification_channel AS ENUM ('PUSH', 'SMS', 'EMAIL', 'CALL');
CREATE TYPE notification_status AS ENUM ('SENT', 'DELIVERED', 'FAILED');
CREATE TYPE subscription_tier AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');

-- Users (family members, caregivers, admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'FAMILY',
    is_active BOOLEAN DEFAULT TRUE,
    fcm_token TEXT,
    maxis_subscriber_id VARCHAR(50),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Elderly profiles
CREATE TABLE elderly_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    nric VARCHAR(20) UNIQUE,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10),
    blood_type VARCHAR(5),
    medical_conditions JSONB DEFAULT '[]',
    medications JSONB DEFAULT '[]',
    allergies JSONB DEFAULT '[]',
    home_address TEXT,
    home_lat DECIMAL(10, 7),
    home_lng DECIMAL(10, 7),
    safe_zone_radius INTEGER DEFAULT 200,
    photo_url TEXT,
    primary_caregiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_tier subscription_tier DEFAULT 'BASIC',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family/caregiver links to elderly profiles
CREATE TABLE user_elderly_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    elderly_profile_id UUID NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
    relationship VARCHAR(50),
    can_receive_alerts BOOLEAN DEFAULT TRUE,
    alert_priority INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, elderly_profile_id)
);

-- IoT devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_serial VARCHAR(100) UNIQUE NOT NULL,
    type device_type NOT NULL,
    elderly_profile_id UUID REFERENCES elderly_profiles(id) ON DELETE SET NULL,
    firmware_version VARCHAR(20) DEFAULT '1.0.0',
    maxis_sim_iccid VARCHAR(22),
    last_seen_at TIMESTAMPTZ,
    battery_level INTEGER,
    status device_status DEFAULT 'OFFLINE',
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    elderly_profile_id UUID NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    type alert_type NOT NULL,
    severity alert_severity NOT NULL,
    status alert_status DEFAULT 'OPEN',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    location_lat DECIMAL(10, 7),
    location_lng DECIMAL(10, 7),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    ml_confidence DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency cases
CREATE TABLE emergency_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    elderly_profile_id UUID NOT NULL REFERENCES elderly_profiles(id),
    status emergency_status DEFAULT 'TRIGGERED',
    responders JSONB DEFAULT '[]',
    dispatch_time TIMESTAMPTZ,
    arrival_time TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification history
CREATE TABLE notification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
    channel notification_channel NOT NULL,
    status notification_status DEFAULT 'SENT',
    payload JSONB DEFAULT '{}',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- OTA update jobs
CREATE TABLE ota_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    target_version VARCHAR(20) NOT NULL,
    firmware_url TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity patterns baseline (for anomaly detection)
CREATE TABLE activity_baselines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    elderly_profile_id UUID NOT NULL REFERENCES elderly_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    hour_of_day INTEGER NOT NULL,
    avg_heart_rate DECIMAL(5, 1),
    avg_steps INTEGER,
    avg_activity_level DECIMAL(3, 2),
    is_typically_home BOOLEAN,
    sample_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(elderly_profile_id, day_of_week, hour_of_day)
);

-- Indexes
CREATE INDEX idx_devices_elderly ON devices(elderly_profile_id);
CREATE INDEX idx_devices_serial ON devices(device_serial);
CREATE INDEX idx_alerts_elderly ON alerts(elderly_profile_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_triggered ON alerts(triggered_at DESC);
CREATE INDEX idx_emergency_cases_elderly ON emergency_cases(elderly_profile_id);
CREATE INDEX idx_notification_history_user ON notification_history(user_id);
CREATE INDEX idx_user_elderly_links_user ON user_elderly_links(user_id);
CREATE INDEX idx_user_elderly_links_elderly ON user_elderly_links(elderly_profile_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_elderly_updated_at BEFORE UPDATE ON elderly_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_emergency_updated_at BEFORE UPDATE ON emergency_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
