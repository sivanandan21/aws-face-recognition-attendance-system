# Smart Attendance System: Edge-to-Cloud Biometric Verification

[![Live Production](https://img.shields.io/badge/Production%20Live-13--126--255--119.sslip.io-166534?style=flat&logo=amazon-aws)](https://13-126-255-119.sslip.io)
[![CI/CD Pipeline](https://github.com/sivanandan21/aws-face-recognition-attendance-system/actions/workflows/deploy-aws.yml/badge.svg)](https://github.com/sivanandan21/aws-face-recognition-attendance-system/actions)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![AWS Region](https://img.shields.io/badge/AWS%20Region-ap--south--1%20(Mumbai)-orange.svg)](https://aws.amazon.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-grade, edge-to-cloud Smart Biometric Attendance System featuring **simultaneous multi-person face recognition**, **Logitech USB webcam hardware optimization**, **YOLOv8n-face detection**, **MediaPipe Eye Aspect Ratio (EAR) liveness checks**, an **offline-first SQLite sync queue**, and an **AWS Serverless cloud backbone** utilizing **Amazon Rekognition User Vectors** and **DynamoDB conditional session locking**.

Engineered with a bespoke **Ceramic & Stone architectural design system** (Newsreader Serif + Tabular Inter UI) and deployed with 24/7 uptime on AWS EC2 with automatic Let's Encrypt SSL.

🌐 **Live Production Web App:** [https://13-126-255-119.sslip.io](https://13-126-255-119.sslip.io)

---

## Table of Contents
- [Attribution & Project Lineage](#attribution--project-lineage)
- [System Architecture](#system-architecture)
- [Key Capabilities & Feature Highlights](#key-capabilities--feature-highlights)
  - [1. Multi-Person Biometric Recognition Engine](#1-multi-person-biometric-recognition-engine)
  - [2. Bespoke Editorial UI/UX Design System](#2-bespoke-editorial-uiux-design-system)
  - [3. Edge Kiosk Hardware & Computer Vision Pipeline](#3-edge-kiosk-hardware--computer-vision-pipeline)
  - [4. AWS Serverless Cloud Backbone](#4-aws-serverless-cloud-backbone)
- [Directory Layout](#directory-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [AWS Cloud Setup (DynamoDB & Rekognition)](#aws-cloud-setup-dynamodb--rekognition)
  - [Running the Modern Dashboard Locally](#running-the-modern-dashboard-locally)
  - [Running the Edge Kiosk Application](#running-the-edge-kiosk-application)
- [EC2 Production Deployment & 24/7 Daemon](#ec2-production-deployment--247-daemon)
- [Automated Verification & Testing](#automated-verification--testing)
- [Contributing & Code Standards](#contributing--code-standards)
- [License](#license)

---

## Attribution & Project Lineage

This production-grade system has been extensively refactored, redesigned, and upgraded from the original proof-of-concept repository:
- **Original Repository:** [sirisgowda/aws-face-recognition-attendance-system](https://github.com/sirisgowda/aws-face-recognition-attendance-system.git)
- **Original Author:** Siri S Gowda ([@sirisgowda](https://github.com/sirisgowda))
- **Active Extended Repository:** [sivanandan21/aws-face-recognition-attendance-system](https://github.com/sivanandan21/aws-face-recognition-attendance-system)
- **Original Walkthrough Demos:**
  - 🎥 Part 1: [Loom Video Walkthrough](https://www.loom.com/share/dfeec5f74e984d71b1141cc8dc4c969b)
  - 🎥 Part 2: [Loom Video Walkthrough](https://www.loom.com/share/a6c63367173240b0874b0f8f397cbd39)
- Historical screenshots from the original implementation are preserved in [`docs/screenshots/`](docs/screenshots/).

---

## System Architecture

```
                                 ┌──────────────────────────────────────────────────┐
                                 │              Edge Kiosk / Web Client             │
                                 │                                                  │
┌──────────────────────────┐     │  ┌────────────────────┐   ┌───────────────────┐  │
│ External Webcam / Laptop │────>│  │ Hardware Capture   │──>│ YOLOv8 / SSD      │  │
│ 1080p / 720p @ 30 FPS    │     │  │ MJPG Low Latency   │   │ MobileNet-V1      │  │
└──────────────────────────┘     │  └────────────────────┘   └─────────┬─────────┘  │
                                 │                                     │            │
                                 │  ┌──────────────────────────────────▼─────────┐  │
                                 │  │ Local Quality, Liveness & Matching         │  │
                                 │  │ • Laplacian Variance Sharpness (>80.0)     │  │
                                 │  │ • MediaPipe EAR Blink Verification         │  │
                                 │  │ • Multi-Person ResNet 128-D FaceMatcher    │  │
                                 │  └──────────────────┬─────────────────────────┘  │
                                 │                     │                            │
                                 │  ┌──────────────────▼─────────────────┐          │
                                 │  │ Centroid Tracker & Cooldown Engine │          │
                                 │  │ 15s per-face deduplication window  │          │
                                 │  └──────────────────┬─────────────────┘          │
                                 │                     │                            │
                                 │              [Network State]                     │
                                 │              /             \                     │
                                 │          (Online)       (Offline)                │
                                 │             │               │                    │
                                 │             │      ┌────────▼──────────┐         │
                                 │             │      │ SQLite Sync Queue │         │
                                 │             │      │ (Auto-Replay)     │         │
                                 │             │      └───────────────────┘         │
                                 └─────────────┼────────────────────────────────────┘
                                               │
                                  HTTPS Direct │ (Signed Token / API Key)
                                               ▼
                         ┌───────────────────────────────────────────┐
                         │      AWS Cloud Backbone (ap-south-1)      │
                         │                                           │
                         │   ┌───────────────────────────────────┐   │
                         │   │      Amazon API Gateway / EC2     │   │
                         │   │   Nginx Reverse Proxy + Let's Enc │   │
                         │   └─────────────────┬─────────────────┘   │
                         │                     │                     │
                         │   ┌─────────────────▼─────────────────┐   │
                         │   │  AWS Lambda / Express API Router  │   │
                         │   └────────┬──────────────────┬───────┘   │
                         │            │                  │           │
                         │   ┌────────▼────────┐ ┌───────▼───────┐   │
                         │   │ AWS Rekognition │ │ Amazon        │   │
                         │   │ User Vectors    │ │ DynamoDB      │   │
                         │   │ Collection      │ │ State Locks   │   │
                         │   └─────────────────┘ └───────────────┘   │
                         └───────────────────────────────────────────┘
```

---

## Key Capabilities & Feature Highlights

### 1. Multi-Person Biometric Recognition Engine & Accuracy Pipeline
- **Multi-Frame Burst Consensus & Best-Frame Selection:** Gathers a burst window of 3–5 consecutive frames over ~0.6s per tracked face. Evaluates combined Laplacian sharpness and detection confidence to select the single sharpest, highest-quality crop for AWS Rekognition.
- **Adaptive Lighting Preprocessing (CLAHE):** Automatically detects low-light face crops (mean L-channel < 75 in LAB color space) and applies Contrast Limited Adaptive Histogram Equalization (`clipLimit=2.0`, `tileGridSize=(8,8)`) to preserve facial geometry in dim environments.
- **Smart 25%–30% Bounding Box Padding:** Expands raw YOLO face crops with 25% symmetric margin clamped cleanly to frame borders, ensuring Rekognition captures full facial landmarks (forehead, chin, ears, jawline).
- **Head-Pose & Quality Gates:** Rejects extreme yaw (>30°) and pitch (>20°) using landmark symmetry (`"Turn slightly toward camera"`), enforces minimum 120×120px face size and minimum 110.0 Laplacian sharpness.
- **High-Precision 128-D Descriptors:** Pre-computes 128-dimensional biometric embeddings using deep residual neural networks (ResNet), cached in memory for sub-millisecond Euclidean distance evaluation via `faceapi.FaceMatcher`.
- **Intelligent Cooldown Gate:** Tracks each verified student with a non-blocking 15-second cooldown cache. Students walking together are all recognized, marked present, and prevented from creating duplicate DynamoDB log spam.
- **Strict UserMatchThreshold (90%–95%):** Guaranteed rejection of unknown/unregistered visitors.

### 2. Real-Time Date & Time Synchronization (Asia/Kolkata IST)
- **Zero UTC Date-Shift Bugs:** Eliminates the critical UTC date-shift issue (where 00:00–05:30 AM IST check-ins logged under yesterday's UTC date). All Edge Kiosk timestamps, AWS Lambda handlers, and DynamoDB session keys (`CLASS#YYYY-MM-DD`) strictly adhere to `Asia/Kolkata` (UTC+05:30).
- **Live Ticking Header Clock:** Synchronized IST ticking clock on both the Web Dashboard header (`DD MMM YYYY, hh:mm:ss A IST`) and the Edge Kiosk OpenCV HUD.
- **Instant Silent Polling:** Overview roster silently auto-refreshes every 2.5 seconds without flickering loading spinners so a 10:30 detection appears live on screen at 10:30 immediately.

### 3. Comprehensive Student Directory & Biometric Management
- **Full Student Profile Editing:** Slide-over modal allows instant updates to student Name, Roll Number, Department, Class Section, Email, Phone, and Active status.
- **Multi-Angle Face Gallery:** Inspect all enrolled biometric vectors. Safely remove degraded angles with an automatic last-face deletion safeguard (`>= 1` face required).
- **Add Biometric Angles On-the-Fly:** Upload new high-resolution reference photos or capture live snapshots directly via Logitech/USB webcam. Automatically associates new vectors to the student's Rekognition User ID.

### 4. Bespoke Editorial UI/UX Design System
Custom-engineered to match luxury architectural design specifications:
- **Design Tokens:** Warm ceramic canvas (`#F5F4F0`), pure architectural sheet (`#FFFFFF`), slim navigation rail (`#FAF9F6`), carbon typography (`#141413`), forest pine accent (`#166534`), and muted status pills (`#7B9478` Present, `#B58E43` Late, `#864446` Absent).
- **Typography:** Serif `Newsreader` headlines combined with tabular-nums `Inter` body for precision alignment of student IDs, timestamps, and confidence percentages.
- **5 Tailored Screens:**
  1. **Today's Attendance (Overview):** 96×96 Donut progress ring, 4 large KPI display numerals, segmented status pills, 240px search bar, hairline roster table with initials avatar bubbles, Students Directory toggle, and direct Student Edit actions.
  2. **Live Kiosk Check-In:** Matte espresso viewfinder (`#161614`), gold L-bracket guides, floating resolution indicator, active multi-face HUD canvas, recent verifications stream.
  3. **Student Enrollment Studio:** 5-slot pose grid (Frontal, Slight Left, Slight Right, Neutral, Extra Angle), minimum 3 required indicator progress bar, live camera snapshot mode, real-time index & vector save.
  4. **System Settings:** Daily late cutoff time picker (IST), Rekognition match threshold slider (50%–99%), minimum angle selector (3, 4, 5), auto-absent session toggle, hardware camera device selector, live cloud health indicator (DynamoDB & Rekognition connected).
  5. **Attendance Reports & Analytics:** 3-metric statistical summary strip, calendar date picker pill, department filter dropdown, attendance status dropdown, unified search, and 1-click verified CSV export with Roll Number support.
- **Fully Responsive Navigation:** 76px desktop icon rail transitions smoothly to an ergonomic iOS-style bottom navigation bar on mobile devices (<768px).

### 5. Edge Kiosk Hardware & Computer Vision Pipeline
- **Logitech USB Optimization:** Auto-selects `cv2.CAP_DSHOW` (Windows) or `cv2.CAP_V4L2` (Linux) with 1080p/720p resolution at 30 FPS over `MJPG` FourCC codec, buffer size 1 for zero frame latency.
- **Multi-Stage Local Quality Gates:**
  - *Min Face Size Gate:* Rejects bounding boxes smaller than 120×120 pixels (`"Move closer - face too small"`).
  - *Exposure Gate:* Rejects underexposed (< 45) or washed-out (> 220) frames.
  - *Sharpness Gate:* Laplacian variance blur filter ($var \ge 110.0$) (`"Hold still - image blurry"`).
  - *Liveness & Pose Gate:* MediaPipe Face Landmarker Eye Aspect Ratio (EAR) blink detection and head pose symmetry.
- **SQLite Offline Queue:** Buffers failed check-ins locally in `offline_queue.db` with exact original `captured_at` IST timestamps and auto-syncs when network connectivity returns.

### 6. AWS Serverless Cloud Backbone
- **Amazon Rekognition:** Vector collection `smart-attendance-collection` (Region: `ap-south-1` Mumbai) stores indexed biometric vectors across 3–5 multi-angle enrollment photos.
- **Amazon DynamoDB Tables:**
  - `SmartAttendanceUsers` (Partition Key: `user_id`): Stores student registration identity, roll number, department, email, phone, profile photos, and enrolled biometric descriptor vectors.
  - `SmartAttendanceLogs` (Partition Key: `PK: CLASS#YYYY-MM-DD`, Sort Key: `SK: user_id`): Enforces conditional idempotent writes via `attribute_not_exists(user_id)` so repeat scans within the same session never overwrite initial attendance. Automatically computes `Present`, `Late` (based on cutoff time), or `Absent`. Dynamically synchronizes user profile updates across historical logs.

---

## Directory Layout

```
aws-face-recognition-attendance-system/
│
├── dashboard/                      # Production React 18 + Vite + Tailwind Web App
│   ├── src/
│   │   ├── components/             # 5 Core Application Screens
│   │   │   ├── Sidebar.jsx         # 76px Desktop Rail & Mobile Bottom Bar
│   │   │   ├── Overview.jsx        # Today's Attendance, Donut KPI & Roster
│   │   │   ├── LiveKiosk.jsx       # Multi-Face Camera Viewfinder & HUD
│   │   │   ├── Enrollment.jsx      # 5-Slot Biometric Enrollment Studio
│   │   │   ├── Settings.jsx        # Cutoff, Threshold Slider & AWS Health
│   │   │   └── Reports.jsx         # Query Engine & 1-Click CSV Export
│   │   ├── services/
│   │   │   ├── api.js              # DynamoDB & Rekognition Cloud API Connector
│   │   │   └── faceMatcher.js      # Multi-Person 128-D ResNet Biometric Engine
│   │   ├── App.jsx                 # View routing & responsive shell
│   │   ├── index.css               # Design system tokens & root CSS variables
│   │   └── main.jsx                # React root
│   ├── public/models/              # face-api.js weights (SSD, Landmarks, ResNet)
│   ├── tailwind.config.js          # Bespoke theme colors, spacing & typography
│   └── vite.config.js              # Vite bundler configuration & proxy
│
├── edge-kiosk/                     # Python Edge Kiosk Application
│   ├── camera.py                   # Logitech webcam controller (MJPG, 1080p, 30fps)
│   ├── config.py                   # 12-factor configuration reader
│   ├── detector.py                 # YOLOv8n-face detector with GPU/CPU auto-fallback
│   ├── geofence.py                 # Campus perimeter validation (Haversine)
│   ├── liveness.py                 # Laplacian blur test & MediaPipe EAR liveness
│   ├── offline_queue.py            # SQLite offline queue & background sync worker
│   ├── tracker.py                  # Centroid face tracker with 15s cooldown
│   ├── client.py                   # Direct API Gateway client with offline fallback
│   └── main.py                     # Main kiosk execution loop & HUD
│
├── aws-backend/                    # AWS Serverless Cloud Backend (SAM)
│   ├── template.yaml               # CloudFormation / SAM infrastructure template
│   └── handlers/                   # Python 3.12 Serverless Lambda Handlers
│       ├── check_in.py             # Rekognition SearchUsersByImage + DynamoDB lock (IST)
│       ├── enroll.py               # User Vectors registration (3-5 angles, 1 face gate)
│       ├── get_attendance.py       # Session-partitioned query with dynamic metadata sync
│       ├── get_users.py            # Active student list
│       └── manage_user.py          # Profile update, add face angles, delete face angle
│
├── scripts/
│   ├── init_aws.py                 # One-click DynamoDB & Rekognition provisioner
│   └── init_rekognition.py         # Rekognition collection creator
│
├── tests/                          # Automated Pytest Suite (30 Tests)
│   ├── test_edge_kiosk.py          # Edge Kiosk unit, burst & quality gate tests
│   └── test_aws_backend.py         # AWS backend Lambda & user management unit tests
│
├── .env.example                    # Environment variable template
├── docker-compose.yml              # Production container stack
└── README.md                       # Comprehensive project documentation
```

---

## Getting Started

### Prerequisites
- **Node.js** v18+ or v22 LTS
- **Python** 3.8+ / 3.12
- **AWS CLI** configured (`aws configure` with valid IAM credentials)
- **Webcam** (Built-in or USB webcam such as Logitech C270 / Brio)

---

### Environment Configuration
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```
Ensure your AWS credentials and region are set:
```ini
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
REKOGNITION_COLLECTION_ID=smart-attendance-collection
DYNAMODB_USERS_TABLE=SmartAttendanceUsers
DYNAMODB_LOGS_TABLE=SmartAttendanceLogs
```

---

### AWS Cloud Setup (DynamoDB & Rekognition)
To automatically inspect, verify, or provision the required DynamoDB tables and Rekognition Collection in AWS `ap-south-1`:
```bash
# Activate your python virtual environment
python scripts/init_aws.py
```
*Output:*
```
Checking DynamoDB tables in region ap-south-1...
Table 'SmartAttendanceUsers' verified / created.
Table 'SmartAttendanceLogs' verified / created.
Rekognition Collection 'smart-attendance-collection' verified.
AWS backend resources are ready!
```

---

### Running the Modern Dashboard Locally
```bash
# Navigate to dashboard folder
cd dashboard

# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Running the Edge Kiosk Application
```bash
# Navigate to edge-kiosk folder
cd edge-kiosk

# Install dependencies
pip install -r requirements.txt

# Run the Kiosk with live camera HUD preview
python main.py

# Or run headless as a background service
python main.py --headless
```

---

## EC2 Production Deployment & 24/7 Daemon

The application is deployed on an **AWS EC2 Ubuntu 24.04 LTS instance** in region `ap-south-1` (Mumbai) under the domain:
👉 **[https://13-126-255-119.sslip.io](https://13-126-255-119.sslip.io)**

### Architecture on EC2:
1. **PM2 (Process Manager):** Keeps Vite dashboard running 24/7 in the background with auto-restart on boot:
   ```bash
   pm2 start npm --name "attendance-dashboard" -- run dev -- --host 0.0.0.0 --port 3000
   pm2 save
   sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
   ```
2. **Nginx Reverse Proxy:** Terminates incoming SSL/HTTPS traffic on Port 443 and proxies to Port 3000:
   ```nginx
   server {
       server_name 13-126-255-119.sslip.io;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
3. **Let's Encrypt Certbot:** Provides a free, auto-renewing SSL certificate:
   ```bash
   sudo certbot --nginx -d 13-126-255-119.sslip.io --non-interactive --agree-tos -m your_email@example.com
   ```

### Updating EC2 to Latest Code:
Whenever changes are pushed to GitHub, update the server with one command:
```bash
cd ~/aws-face-recognition-attendance-system && git pull && pm2 restart attendance-dashboard
```

---

## Automated Verification & Testing

The system includes automated tests validating the biometric quality gates, blink EAR liveness, centroid tracking, offline SQLite queueing, DynamoDB locking, and Rekognition interactions.

### Run Pytest Suite:
```bash
python -m pytest tests/ -v
```
**Test Results (32/32 Passed):**
```
tests/test_aws_backend.py::test_enroll_missing_fields PASSED                      [  3%]
tests/test_aws_backend.py::test_enroll_success PASSED                             [  6%]
tests/test_aws_backend.py::test_checkin_unauthorized_key PASSED                   [  9%]
tests/test_aws_backend.py::test_checkin_geofence_violation PASSED                 [ 12%]
tests/test_aws_backend.py::test_checkin_unknown_face_alert PASSED                 [ 15%]
tests/test_aws_backend.py::test_checkin_success_and_duplicate_lock PASSED          [ 18%]
tests/test_aws_backend.py::test_checkin_ist_midnight_boundary_date PASSED         [ 21%]
tests/test_aws_backend.py::test_checkin_exact_10_30_detection_time PASSED         [ 25%]
tests/test_aws_backend.py::test_get_attendance_query PASSED                       [ 28%]
tests/test_aws_backend.py::test_get_users PASSED                                  [ 31%]
tests/test_aws_backend.py::test_update_user_handler PASSED                         [ 34%]
tests/test_aws_backend.py::test_add_faces_handler PASSED                           [ 37%]
tests/test_aws_backend.py::test_remove_face_safeguard_prevents_last_photo_deletion PASSED [ 40%]
tests/test_aws_backend.py::test_remove_face_success PASSED                         [ 43%]
tests/test_aws_backend.py::test_remove_attendance_record_success PASSED          [ 46%]
tests/test_aws_backend.py::test_remove_attendance_record_missing_user_id PASSED  [ 50%]
tests/test_edge_kiosk.py::test_blur_detector_sharp_vs_blurry PASSED               [ 53%]
tests/test_edge_kiosk.py::test_ear_calculation PASSED                             [ 56%]
tests/test_edge_kiosk.py::test_liveness_gate_blink_accumulation PASSED            [ 59%]
tests/test_edge_kiosk.py::test_yolo_padding_calculation PASSED                    [ 62%]
tests/test_edge_kiosk.py::test_centroid_tracker_and_cooldown PASSED               [ 65%]
tests/test_edge_kiosk.py::test_offline_queue_enqueue_and_sync PASSED              [ 68%]
tests/test_edge_kiosk.py::test_geofencing_inside_and_outside_radius PASSED          [ 71%]
tests/test_edge_kiosk.py::test_api_client_success PASSED                          [ 75%]
tests/test_edge_kiosk.py::test_api_client_network_failure_enqueues_offline PASSED  [ 78%]
tests/test_edge_kiosk.py::test_exposure_gate_dark_normal_bright PASSED            [ 81%]
tests/test_edge_kiosk.py::test_min_face_size_gate PASSED                          [ 84%]
tests/test_edge_kiosk.py::test_camera_auto_discovery_fallback PASSED              [ 87%]
tests/test_edge_kiosk.py::test_clahe_enhancement_low_light_vs_bright PASSED       [ 90%]
tests/test_edge_kiosk.py::test_burst_frame_selection_and_consensus PASSED        [ 93%]
tests/test_edge_kiosk.py::test_padding_percent_expanded_25 PASSED                [ 96%]
tests/test_edge_kiosk.py::test_score_face_crop PASSED                            [100%]

======================== 32 passed in 6.05s ========================
```

### Validate Production Web Build:
```bash
cd dashboard && npm run build
```
*Output: `✓ built in ~2.5s` with 0 errors.*

---

## Contributing & Code Standards
1. **Zero Hardcoded Credentials:** Never push AWS Secret Keys or private tokens. All credentials must be read from environment variables.
2. **Offline Resilience:** All biometric capture features must gracefully failover to the local SQLite offline queue when network drops.
3. **Biometric Integrity:** Multi-person verification requires valid 128-D face embeddings matching registered enrollment vectors above the configured threshold.
4. **Verification Requirement:** All pull requests must pass both `pytest tests/ -v` and `npm run build`.

---

## License

This project is open-source under the [MIT License](LICENSE).
Attribution to original creator Siri S Gowda ([@sirisgowda](https://github.com/sirisgowda)). Extended and enhanced by [@sivanandan21](https://github.com/sivanandan21).
