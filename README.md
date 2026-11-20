# Production Smart Attendance System

[![CI/CD Pipeline](https://github.com/sirisgowda/aws-face-recognition-attendance-system/actions/workflows/deploy-aws.yml/badge.svg)](https://github.com/sirisgowda/aws-face-recognition-attendance-system/actions)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![AWS Region](https://img.shields.io/badge/AWS%20Region-ap--south--1%20(Mumbai)-orange.svg)](https://aws.amazon.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-ready, edge-to-cloud Smart Attendance System engineered with **Logitech USB webcam tuning**, **YOLOv8n-face detection**, **MediaPipe Eye Aspect Ratio (EAR) liveness verification**, **SQLite offline resilience queue**, and an **AWS Serverless backend** featuring **Amazon Rekognition User Vectors** and **DynamoDB conditional duplicate locking**.

---

## Attribution & Project Lineage

This production-grade system is refactored and upgraded from the original proof-of-concept repository:
- **Original Repository:** [sirisgowda/aws-face-recognition-attendance-system](https://github.com/sirisgowda/aws-face-recognition-attendance-system.git)
- **Original Author:** Siri S Gowda ([@sirisgowda](https://github.com/sirisgowda))
- **Original Walkthrough Demos:**
  - 🎥 Part 1: [Loom Video Walkthrough](https://www.loom.com/share/dfeec5f74e984d71b1141cc8dc4c969b)
  - 🎥 Part 2: [Loom Video Walkthrough](https://www.loom.com/share/a6c63367173240b0874b0f8f397cbd39)
- Historical screenshots from the original implementation are preserved in [`docs/screenshots/`](docs/screenshots/).

---

## Key Upgrades & Architecture

```
                       ┌────────────────────────────────────────────────────────┐
                       │               Edge Kiosk (Windows / Linux)             │
                       │                                                        │
┌─────────────────┐    │  ┌──────────────────┐       ┌───────────────────────┐  │
│ Logitech Webcam │───>│  │ LogitechWebcam   │──────>│ YOLOv8n-face Detector │  │
│ 1080p @ 30 FPS  │    │  │ MJPG / CAP_DSHOW │       │ CUDA / CPU (~20% pad) │  │
└─────────────────┘    │  └──────────────────┘       └───────────┬───────────┘  │
                       │                                         │              │
                       │  ┌──────────────────────────────────────▼───────────┐  │
                       │  │ Local Quality & Liveness Gates                   │  │
                       │  │ • Laplacian Variance Sharpness (>80.0)           │  │
                       │  │ • MediaPipe Face Landmarker EAR Blink Check      │  │
                       │  └──────────────────────┬───────────────────────────┘  │
                       │                         │                              │
                       │  ┌──────────────────────▼───────────┐                  │
                       │  │ Centroid Tracker & Cooldown      │                  │
                       │  │ 15-second per-face cooldown      │                  │
                       │  └──────────────┬───────────────────┘                  │
                       │                 │                                      │
                       │          [Network OK?]                                 │
                       │          /          \                                  │
                       │       (Yes)         (No)                               │
                       │         │             │                                │
                       │         │      ┌──────▼─────────────────────┐          │
                       │         │      │ SQLite Offline Queue       │          │
                       │         │      │ (auto-syncs on reconnect)  │          │
                       │         │      └────────────────────────────┘          │
                       └─────────┼──────────────────────────────────────────────┘
                                 │
                    HTTPS Direct │ (x-api-key)
                                 ▼
         ┌─────────────────────────────────────────────────┐
         │         AWS Serverless Cloud (ap-south-1)       │
         │                                                 │
         │   ┌─────────────────────────────────────────┐   │
         │   │   Amazon HTTP API Gateway               │   │
         │   │   POST /check-in   POST /enroll   GET /att  │   │
         │   └────────────────────┬────────────────────┘   │
         │                        │                        │
         │   ┌────────────────────▼────────────────────┐   │
         │   │   AWS Lambda Handlers (Python 3.12)     │   │
         │   └──────┬─────────────┬─────────────┬──────┘   │
         │          │             │             │          │
         │   ┌──────▼─────┐ ┌─────▼───────┐ ┌───▼──────┐   │
         │   │ Rekognition│ │ DynamoDB    │ │ Amazon S3│   │
         │   │ UserVectors│ │ Condition   │ │ 7-day TTL│   │
         │   │ (92% match)│ │ Lock (IST)  │ │ Audit    │   │
         │   └────────────┘ └─────────────┘ └──────────┘   │
         │          │                                      │
         │   ┌──────▼─────────────┐                        │
         │   │ Amazon SNS Alerts  │                        │
         │   │ (unknown/perimeter)│                        │
         │   └────────────────────┘                        │
         └────────────────────────┼────────────────────────┘
                                  ▲
                                  │ HTTPS API
         ┌────────────────────────┴────────────────────────┐
         │       Admin Dashboard (React + Vite + Tailwind) │
         │   • Live Check-in Feed   • Daily Stats Cards    │
         │   • Multi-angle Studio   • 1-Click CSV Export   │
         └─────────────────────────────────────────────────┘
```

### Edge Kiosk Capabilities (`edge-kiosk/`)
- **Logitech USB Webcam Tuning:** Auto-selects `cv2.CAP_DSHOW` (Windows) or `cv2.CAP_V4L2` (Linux) with 1080p resolution at 30 FPS over `MJPG` FourCC codec, buffer size 1 for zero frame latency, and smart reconnect resilience.
- **Auto-Discovery & CLI:** Supports `CAMERA_SOURCE=auto` and `CAMERA_NAME_FILTER=Logitech` to auto-detect USB webcams. Run `python main.py --list-cameras` to scan all connected video hardware.
- **YOLOv8 Face Detection:** Prefers `yolov8s-face.pt` with automatic CPU fallback to `yolov8n-face.pt` with strict confidence threshold `conf=0.80`, cropping all faces in frame with ~20% bounding box margin.
- **Multi-Stage Local Quality Gates:**
  - **Min Face Size Gate:** Rejects bounding boxes smaller than 112×112 pixels (`"Move closer - face too small"`).
  - **Exposure Gate:** Rejects underexposed (< 45) or washed-out (> 220) frames.
  - **Sharpness Gate:** Laplacian variance blur filter ($var \ge 100.0$) (`"Hold still - image blurry"`).
  - **Liveness Gate:** MediaPipe Face Landmarker Eye Aspect Ratio (EAR) blink detection.
- **Centroid Tracker with Cooldown:** 15-second check-in cooldown per tracked user to avoid spamming AWS API Gateway.
- **SQLite Offline Queue:** Buffers failed check-ins locally in `offline_queue.db` with exact IST timestamps and auto-syncs when internet returns.

### AWS Serverless Cloud Backend (`aws-backend/`)
- **AWS SAM Template:** Defined in `aws-backend/template.yaml` for region `ap-south-1` (Mumbai) on `python3.12` / AL2023.
- **Amazon Rekognition User Vectors:** Uses `CreateUser`, `IndexFaces` (with `QualityFilter="AUTO"` across 3-5 enrollment photos), and `SearchUsersByImage` (`UserMatchThreshold=88.0–92.0`). Strictly rejects unknown faces with HTTP 403.
- **DynamoDB Single-Table / Session Locking & Automatic ABSENT:**
  - `Users` Table (PK: `user_id`).
  - `AttendanceLogs` Table (PK: `CLASS#YYYY-MM-DD`, SK: `user_id`).
  - Repeat scans return `"Already marked present"` via `attribute_not_exists(user_id)`.
  - `GET /attendance` merges all active students: registered students without a live scan are automatically flagged `status: "ABSENT"`.
- **Student Profile & Face Photo Management:** Complete CRUD endpoints: `GET /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`, `POST /users/{id}/faces`, `DELETE /users/{id}/faces/{index}`.
- **S3 Snapshot Audit:** 7-day automatic lifecycle expiration rule for privacy compliance and cost minimization.
- **Security Alerts:** Publishes to Amazon SNS when unregistered individuals or out-of-boundary access attempts occur.

### Modern Admin Dashboard (`dashboard/`)
- Built with **React 18**, **Vite**, and **Tailwind CSS**.
- **Clean Neutral Design System:** Warm light neutral background (`#F7F7F5`), white card surfaces, hairline borders (`#E5E7EB`), Inter typography, left sidebar navigation. Strictly banned AI-slop (no purple/neon gradients, no glassmorphism, no sparkle icons).
- **Deep Learning Biometric Engine:** Client-side **`face-api.js`** using SSD MobileNet V1 and ResNet-based 128-dimensional face embedding vectors for high-precision matching against 3–5 multi-angle registered templates.
- **Automatic ABSENT Tracking:** Daily KPI counters show Total Registered, Present, Late, and Absent students. Attendance table supports filter tabs: `All`, `Present`, `Late`, `Absent`.
- **Student Roster & Photo Management Modal:** In-dashboard editing of student details, viewing of enrolled angle thumbnails, adding new angle photos, and removing poor angles.
- **Hardware-Aware Camera Selector:** Auto-detects external Logitech and laptop cameras, remembers preferred device in `localStorage`.
- **Reports and analytics:** Date and department filtering with 1-click CSV export.

---

## Directory Structure

```
aws-face-recognition-attendance-system/
│
├── edge-kiosk/                     # Edge Kiosk Application
│   ├── camera.py                   # Logitech webcam controller (MJPG, 1080p, 30fps)
│   ├── config.py                   # 12-factor configuration reader
│   ├── detector.py                 # YOLOv8n-face detector with GPU/CPU auto-fallback
│   ├── geofence.py                 # Campus perimeter validation (Haversine)
│   ├── liveness.py                 # Laplacian blur test & MediaPipe EAR liveness
│   ├── offline_queue.py            # SQLite offline queue & background sync worker
│   ├── tracker.py                  # Centroid face tracker with 15s cooldown
│   ├── client.py                   # Direct API Gateway client with offline fallback
│   ├── main.py                     # Main kiosk execution loop & HUD
│   ├── Dockerfile                  # Container definition with /dev/video0 pass-through
│   └── requirements.txt            # Python dependencies for Edge Kiosk
│
├── aws-backend/                    # AWS Serverless Application Model (SAM)
│   ├── template.yaml               # CloudFormation / SAM infrastructure template
│   └── handlers/                   # Serverless Lambda Handlers (Python 3.12)
│       ├── check_in.py             # Rekognition SearchUsersByImage + DynamoDB lock
│       ├── enroll.py               # User Vectors registration (3-5 angles)
│       ├── get_attendance.py       # Session-partitioned query
│       ├── get_users.py            # Active student list
│       └── requirements.txt        # Lambda runtime dependencies
│
├── dashboard/                      # Modern React Admin Dashboard
│   ├── src/
│   │   ├── components/             # Navbar, Overview, Enrollment, Reports
│   │   ├── services/api.js         # API Gateway integration service
│   │   ├── App.jsx                 # Main layout
│   │   └── main.jsx                # Application root
│   ├── Dockerfile                  # Multi-stage build (node:22-alpine -> nginx:alpine)
│   ├── nginx.conf                  # Nginx production configuration
│   └── package.json                # Dashboard dependencies
│
├── docker/                         # Multi-Container Compose Stacks
│   ├── docker-compose.yml          # Production Linux Edge stack (Kiosk + Dashboard)
│   └── docker-compose.dev.yml      # Windows/macOS Dev stack (Dashboard + DynamoDB-local)
│
├── docs/screenshots/               # Preserved historical demo screenshots
├── scripts/
│   └── init_rekognition.py         # One-time Rekognition Collection initialization
├── tests/                          # Automated Pytest Suite
│   ├── test_edge_kiosk.py          # Edge Kiosk unit tests
│   └── test_aws_backend.py         # AWS backend Lambda unit tests
│
├── .env.example                    # Complete environment variables template
├── .gitignore                      # Security-hardened gitignore
└── README.md                       # Comprehensive system documentation
```

---

## Quickstart Guide

### 1. Configuration Setup
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
Update AWS credentials, API secret key, and campus coordinates as required.

---

### 2. Windows Local Development Setup

#### A. Run Edge Kiosk Natively (Direct USB Webcam & CUDA Access)
```bash
# Navigate to edge-kiosk directory
cd edge-kiosk

# Install dependencies
pip install -r requirements.txt

# Run kiosk with live HUD preview window
python main.py

# Or run headless in background
python main.py --headless
```

#### B. Run Admin Dashboard
```bash
# Navigate to dashboard directory
cd dashboard

# Install dependencies & run development server
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 3. Linux / Raspberry Pi Docker Deployment

Deploy the entire production stack (Edge Kiosk + Admin Dashboard) using Docker Compose:
```bash
docker compose -f docker/docker-compose.yml up -d --build
```
> **Note:** Ensure your webcam is connected to `/dev/video0` and accessible by your current user (`sudo usermod -a -G video $USER`).

---

### 4. AWS Serverless Backend Deployment (AWS SAM)

#### Prerequisites:
- AWS CLI configured (`aws configure`)
- AWS SAM CLI installed ([Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))

#### Deploy Cloud Infrastructure:
```bash
# Navigate to aws-backend directory
cd aws-backend

# Build SAM application
sam build

# Deploy to AWS ap-south-1 (Mumbai)
sam deploy --guided
```

#### One-Time Rekognition Collection Setup:
```bash
python scripts/init_rekognition.py
```

---

## Automated Verification & Testing

Run the automated test suite covering OpenCV blur/EAR gates, tracker cooldowns, SQLite offline resilience, Rekognition User Vectors, and DynamoDB duplicate locking:

```bash
# Run all tests
python -m pytest tests/ -v
```

### Test Suite Summary:
```
tests/test_aws_backend.py::test_enroll_missing_fields PASSED
tests/test_aws_backend.py::test_enroll_success PASSED
tests/test_aws_backend.py::test_checkin_unauthorized_key PASSED
tests/test_aws_backend.py::test_checkin_geofence_violation PASSED
tests/test_aws_backend.py::test_checkin_unknown_face_alert PASSED
tests/test_aws_backend.py::test_checkin_success_and_duplicate_lock PASSED
tests/test_aws_backend.py::test_get_attendance_query PASSED
tests/test_aws_backend.py::test_get_users PASSED
tests/test_edge_kiosk.py::test_blur_detector_sharp_vs_blurry PASSED
tests/test_edge_kiosk.py::test_ear_calculation PASSED
tests/test_edge_kiosk.py::test_liveness_gate_blink_accumulation PASSED
tests/test_edge_kiosk.py::test_yolo_padding_calculation PASSED
tests/test_edge_kiosk.py::test_centroid_tracker_and_cooldown PASSED
tests/test_edge_kiosk.py::test_offline_queue_enqueue_and_sync PASSED
tests/test_edge_kiosk.py::test_geofencing_inside_and_outside_radius PASSED
tests/test_edge_kiosk.py::test_api_client_success PASSED
tests/test_edge_kiosk.py::test_api_client_network_failure_enqueues_offline PASSED

======================== 17 passed in 0.74s ========================
```

---

## Contributing & Development Guidelines
1. **Zero Hardcoded Secrets:** Never hardcode credentials, bucket names, or API keys. Always read from `.env` or system environment variables.
2. **Offline-First:** All kiosk features must degrade gracefully to the SQLite offline queue during internet disruptions.
3. **Run Verification Before Commit:** Ensure `pytest tests/` and `npm run build` pass before pushing changes.

---

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
