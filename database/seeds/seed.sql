-- SilverLink Demo Seed Data

-- Demo users
INSERT INTO users (id, email, phone, name, password_hash, role) VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'ahmad@example.com',
    '+60123456789',
    'Ahmad Bin Razak',
    crypt('Password123!', gen_salt('bf')),
    'FAMILY'
),
(
    '22222222-2222-2222-2222-222222222222',
    'siti@example.com',
    '+60167891234',
    'Siti Caregiver',
    crypt('Password123!', gen_salt('bf')),
    'CAREGIVER'
),
(
    '33333333-3333-3333-3333-333333333333',
    'admin@silverlink.maxis.com.my',
    '+60312345678',
    'SilverLink Admin',
    crypt('Admin@secure123!', gen_salt('bf')),
    'ADMIN'
);

-- Demo elderly profile
INSERT INTO elderly_profiles (
    id, name, nric, date_of_birth, gender, blood_type,
    medical_conditions, medications,
    home_address, home_lat, home_lng, safe_zone_radius,
    primary_caregiver_id, subscription_tier
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Rokiah Binti Hassan',
    '450512-10-5678',
    '1945-05-12',
    'Female',
    'B+',
    '["Hypertension", "Type 2 Diabetes", "Mild Dementia"]',
    '["Metformin 500mg twice daily", "Amlodipine 5mg once daily"]',
    'No. 12, Jalan Melati, Taman Bunga, 41000 Klang, Selangor',
    3.0319,
    101.4434,
    300,
    '22222222-2222-2222-2222-222222222222',
    'PREMIUM'
);

-- Link family member
INSERT INTO user_elderly_links (user_id, elderly_profile_id, relationship, can_receive_alerts, alert_priority)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Son',
    true,
    1
);

-- Demo devices
INSERT INTO devices (id, device_serial, type, elderly_profile_id, firmware_version, battery_level, status) VALUES
(
    'dddddddd-dddd-dddd-dddd-dddddddddd01',
    'SL-WB-2024-001234',
    'WRISTBAND',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '2.1.0',
    78,
    'ONLINE'
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddd02',
    'SL-HH-2024-005678',
    'HOME_HUB',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '1.3.2',
    NULL,
    'ONLINE'
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddd03',
    'SL-PB-2024-009999',
    'PANIC_BUTTON',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '1.0.5',
    95,
    'ONLINE'
);
