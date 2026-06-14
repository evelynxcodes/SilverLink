# SilverLink Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          IoT Devices (Maxis SIM)                      │
│   ┌─────────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│   │  Wristband  │    │   Home Hub   │    │    Panic Button        │  │
│   │ HR, SpO2,   │    │ Motion, Gas, │    │    SOS, GPS            │  │
│   │ GPS, Fall   │    │ Door, Stove  │    │                        │  │
│   └──────┬──────┘    └──────┬───────┘    └───────────┬────────────┘  │
└──────────┼─────────────────┼────────────────────────┼───────────────┘
           │                 │                         │
           └─────────────────┴─────────────────────────┘
                             │ MQTT (QoS 1/2)
                    ┌────────▼────────┐
                    │  Mosquitto MQTT │
                    │     Broker      │
                    └────────┬────────┘
                             │
                    ┌────────▼──────────────────┐
                    │   Telemetry Ingestion Svc  │
                    │  InfluxDB writer           │
                    │  Kafka producer            │
                    └────────┬──────────────────┘
                             │
              ┌──────────────┼──────────────────┐
              │              │                  │
        InfluxDB          Kafka            ┌────▼──────────────┐
    (time-series)    silverlink.*          │  Alert Processing │
                              │            │  Rule engine      │
                    ┌─────────▼──────┐     │  Geofence check   │
                    │   Analytics    │     │  ML confidence    │
                    │   Service      │     └────────┬──────────┘
                    └────────────────┘              │
                                              Kafka: silverlink.alerts
                                        ┌──────────┴────────────────┐
                                        │                           │
                               ┌────────▼────────┐    ┌────────────▼──────┐
                               │  Notification   │    │ Emergency Response │
                               │  push/SMS/email │    │ Ambulance / PDRM   │
                               └─────────────────┘    └────────────────────┘

                    ┌─────────────────────────────────────────────────────┐
                    │                   REST API Layer                     │
                    │                                                      │
                    │  API Gateway (:3000)  — JWT auth, rate limit, proxy │
                    │  ├── Device Management (:3001) — register, OTA      │
                    │  ├── User Profile (:3004) — auth, elderly profiles  │
                    │  ├── Alert Processing (:3003) — CRUD, ack, resolve  │
                    │  ├── Analytics (:3006) — trends, risk score         │
                    │  └── Emergency Response (:3007) — dispatch          │
                    └─────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────┐
                    │              Client Applications                     │
                    │  ┌─────────────────┐  ┌──────────────────────────┐ │
                    │  │  Family Mobile  │  │    Caregiver Web Portal  │ │
                    │  │  App (Flutter)  │  │       (React)            │ │
                    │  └─────────────────┘  └──────────────────────────┘ │
                    └─────────────────────────────────────────────────────┘
```

## Microservices

| Service | Port | Responsibility |
|---|---|---|
| api-gateway | 3000 | JWT auth, rate limiting, reverse proxy |
| device-management | 3001 | Device registration, status, OTA via MQTT |
| telemetry-ingestion | 3002 | MQTT → InfluxDB + Kafka pipeline |
| alert-processing | 3003 | Rule engine, ML scoring, alert persistence |
| user-profile | 3004 | Auth (JWT), user/elderly profile CRUD |
| notification | 3005 | Push (FCM), SMS (Maxis API), email |
| analytics | 3006 | InfluxDB queries, risk scoring |
| emergency-response | 3007 | Ambulance/PDRM dispatch, case tracking |

## MQTT Topic Structure

```
silverlink/devices/{deviceSerial}/telemetry   ← device → broker (QoS 1)
silverlink/devices/{deviceSerial}/alerts      ← device → broker (QoS 2)
silverlink/devices/{deviceSerial}/config      ← server → device (QoS 1)
silverlink/devices/{deviceSerial}/ota         ← server → device (QoS 2)
silverlink/devices/{deviceSerial}/heartbeat   ← device → broker (QoS 0)
```

## Kafka Topics

```
silverlink.telemetry        ingestion → alert-processing, analytics
silverlink.device-alerts    ingestion → alert-processing
silverlink.alerts           alert-processing → notification, emergency-response
```

## Alert Flow

```
Device detects event
  ↓
Publish to MQTT /alerts or /telemetry
  ↓
Telemetry Ingestion forwards to Kafka
  ↓
Alert Processing consumes:
  • Applies rule engine (fall, heart rate, geofence)
  • Scores confidence
  • Persists to PostgreSQL alerts table
  • Publishes to silverlink.alerts topic
  ↓
Notification Service consumes:
  • Push to family via FCM
  • SMS via Maxis API (HIGH/CRITICAL only)
  ↓
Emergency Response consumes:
  • AUTO-triggers for CRITICAL FALL alerts
  • Dispatches ambulance via API
```

## Data Stores

| Store | Purpose |
|---|---|
| PostgreSQL | Users, elderly profiles, devices, alerts, emergency cases, notification history |
| InfluxDB | Time-series telemetry (vitals, activity, location, environment) |
| Redis | JWT blacklisting, rate limit state, device online cache |

## Subscription Tiers

| Feature | Basic | Standard | Premium |
|---|---|---|---|
| Wristband monitoring | ✓ | ✓ | ✓ |
| Fall detection | ✓ | ✓ | ✓ |
| SOS button | ✓ | ✓ | ✓ |
| Home Hub sensors | | ✓ | ✓ |
| Geofence/Wandering | | ✓ | ✓ |
| 24h location trail | | ✓ | ✓ |
| Risk score AI | | | ✓ |
| Auto ambulance dispatch | | | ✓ |
| Health trend reports | | | ✓ |
