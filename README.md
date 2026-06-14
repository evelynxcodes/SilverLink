# SilverLink — 5G Connected Elderly Safety Platform

> A Maxis future innovation project — IoT + microservices platform for real-time elderly health monitoring, fall detection, and emergency response.

## The Problem

Malaysia is on track to become an **aged nation by 2030** with 3.8M+ elderly. Many live alone or with working family members. Falls, cardiac events, dementia wandering, and kitchen accidents are leading causes of elderly emergency hospitalizations — and most go undetected until it's too late.

## The Solution

SilverLink is a Maxis-native 5G IoT platform that connects elderly individuals with their families, caregivers, and emergency services in real time. Every device runs on a Maxis SIM, every alert escalates through Maxis infrastructure.

---

## Architecture

```
IoT Devices (Maxis SIM)
  └─► MQTT Broker (Mosquitto)
        └─► Telemetry Ingestion → InfluxDB + Kafka
              ├─► Alert Processing (Rules + ML)
              │     ├─► Notification (Push / SMS via Maxis API)
              │     └─► Emergency Response (Ambulance / PDRM)
              └─► Analytics (Vitals trends, Risk scoring)

REST API Gateway (JWT auth + rate limiting)
  ├── Device Management
  ├── User & Elderly Profiles
  ├── Alert CRUD
  ├── Analytics
  └── Emergency Response
```

See [docs/architecture.md](docs/architecture.md) for the full diagram.

---

## IoT Devices

| Device | Sensors | Connection |
|---|---|---|
| **Smart Wristband** | Heart rate, SpO2, body temp, GPS, accelerometer (fall), SOS button | Maxis LTE |
| **Home Hub** | Motion, door/window, smart plug (stove), gas/smoke, temperature, humidity | Maxis Fibre + WiFi |
| **Panic Button** | SOS trigger, GPS | Maxis LTE |

---

## Microservices

| Service | Port | Description |
|---|---|---|
| `api-gateway` | 3000 | JWT auth, rate limiting, reverse proxy |
| `device-management` | 3001 | Device registration, OTA firmware updates |
| `telemetry-ingestion` | 3002 | MQTT subscriber → InfluxDB + Kafka |
| `alert-processing` | 3003 | Rule engine, ML confidence scoring, alert persistence |
| `user-profile` | 3004 | Auth (JWT), user management, elderly profiles |
| `notification` | 3005 | Push (FCM), SMS (Maxis API), email |
| `analytics` | 3006 | Health trends, activity patterns, risk score AI |
| `emergency-response` | 3007 | Ambulance dispatch, PDRM notification, case tracking |

---

## Alert Types

| Alert | Trigger | Severity |
|---|---|---|
| Fall Detected | Accelerometer impact > threshold | CRITICAL |
| SOS Pressed | Manual button press | CRITICAL |
| Heart Rate High | > 130 bpm | HIGH / CRITICAL |
| Heart Rate Low | < 45 bpm (bradycardia) | HIGH / CRITICAL |
| SpO2 Low | < 92% | HIGH / CRITICAL |
| Wandering | Outside geofence radius | HIGH / CRITICAL |
| Stove On Long | Stove active > 60 mins | MEDIUM / HIGH |
| Door Open at Night | Main door opened 10pm–6am | MEDIUM |
| Gas Detected | Gas sensor triggered | CRITICAL |

---

## Tech Stack

| Layer | Technology |
|---|---|
| IoT Protocol | MQTT (Mosquitto 2.0, QoS 1/2) |
| Event Streaming | Apache Kafka |
| Time-series DB | InfluxDB 2.7 |
| Relational DB | PostgreSQL 15 |
| Cache | Redis 7 |
| Backend | Node.js 20, Express |
| Auth | JWT (RS256-ready) |
| Containerization | Docker + Docker Compose |

---

## Getting Started

### Prerequisites
- Docker + Docker Compose
- Node.js 20 (for local dev)

### Run with Docker Compose

```bash
# Copy environment config
cp .env.example .env
# Edit .env with your FCM key, Maxis SMS API key, etc.

# Start all services + infrastructure
docker compose up -d

# Include device simulator (dev mode)
docker compose --profile dev up -d

# View logs
docker compose logs -f telemetry-ingestion alert-processing
```

### Services will be available at:

| Service | URL |
|---|---|
| API Gateway | http://localhost:3000 |
| InfluxDB UI | http://localhost:8086 |
| MQTT Broker | mqtt://localhost:1883 |

### Quick API Test

```bash
# Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmad@example.com","phone":"+60123456789","name":"Ahmad","password":"Password123!"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmad@example.com","password":"Password123!"}'

# Use the returned token for subsequent requests
export TOKEN="<jwt_token>"

# Get elderly profiles
curl http://localhost:3000/api/v1/elderly/mine \
  -H "Authorization: Bearer $TOKEN"

# Get risk score
curl http://localhost:3000/api/v1/analytics/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/risk-score \
  -H "Authorization: Bearer $TOKEN"
```

---

## API Documentation

OpenAPI 3.0 spec: [docs/api-spec/openapi.yaml](docs/api-spec/openapi.yaml)

Import into Postman or open with Swagger UI.

---

## MQTT Message Formats

### Telemetry Payload (`/telemetry` topic)

```json
{
  "deviceSerial": "SL-WB-2024-001234",
  "elderlyId": "uuid",
  "timestamp": "2024-11-15T10:30:00.000Z",
  "type": "VITALS",
  "vitals": {
    "heartRate": 72,
    "spO2": 98.1,
    "bodyTemp": 36.5,
    "systolicBP": 125,
    "diastolicBP": 80
  },
  "location": { "lat": 3.0319, "lng": 101.4434, "accuracy": 5 },
  "activity": { "steps": 120, "activityLevel": "LIGHT", "posture": "WALKING" },
  "device": { "battery": 82, "signalStrength": -75 }
}
```

### Alert Payload (`/alerts` topic)

```json
{
  "deviceSerial": "SL-WB-2024-001234",
  "elderlyId": "uuid",
  "timestamp": "2024-11-15T10:35:00.000Z",
  "alertType": "FALL_DETECTED",
  "severity": "CRITICAL",
  "confirmed": false,
  "data": { "impactForce": 22.4, "preImpactPosture": "WALKING" },
  "location": { "lat": 3.0319, "lng": 101.4434 }
}
```

---

## Business Model (Maxis)

| Plan | Price | Features |
|---|---|---|
| Basic | RM 49/month | Wristband + fall detection + SOS |
| Standard | RM 89/month | + Home Hub + geofencing + location trail |
| Premium | RM 149/month | + AI risk scoring + auto emergency dispatch + health reports |

*Device hardware sold separately or bundled with 12/24-month contract (like a Maxis phone plan)*

---

## Project Structure

```
silverlink/
├── services/
│   ├── api-gateway/           # JWT auth, routing
│   ├── device-management/     # Device CRUD, OTA
│   ├── telemetry-ingestion/   # MQTT → InfluxDB + Kafka
│   ├── alert-processing/      # Rule engine + ML scoring
│   ├── user-profile/          # Auth + user/elderly CRUD
│   ├── notification/          # Push/SMS/email dispatch
│   ├── analytics/             # Trends + risk scoring
│   └── emergency-response/    # Ambulance/PDRM integration
├── iot/
│   ├── schemas/               # JSON Schema for MQTT payloads
│   ├── device-simulator/      # Dev-mode IoT simulator
│   └── mqtt-broker/           # Mosquitto config
├── database/
│   ├── migrations/            # PostgreSQL schema
│   └── seeds/                 # Demo data
├── docs/
│   ├── architecture.md        # System architecture diagram
│   └── api-spec/openapi.yaml  # Full REST API spec
└── docker-compose.yml
```
