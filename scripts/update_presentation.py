"""
Generates and populates the Smart Attendance System Presentation with exact images and technical content.
"""

import os
import shutil
from PIL import Image
import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

pptx_in = r"C:\Users\Sivanandan\.gemini\antigravity\brain\2e7993e5-0d65-4279-855f-83f68f1e45c0\.user_uploaded\media_1795247142113_4d74167f.pptx"
pptx_out_repo = r"d:\project\WEBCAM PROJ\aws-face-recognition-attendance-system\docs\Smart_Attendance_System_Presentation.pptx"
pptx_out_art = r"C:\Users\Sivanandan\.gemini\antigravity\brain\2e7993e5-0d65-4279-855f-83f68f1e45c0\Smart_Attendance_System_Presentation.pptx"
img_dir = r"d:\project\WEBCAM PROJ\aws-face-recognition-attendance-system\docs\images"

prs = pptx.Presentation(pptx_in)

slide_data = [
    {
        "title": "Smart Attendance System",
        "subtitle": "Edge-to-Cloud Biometric Verification Platform",
        "points": [
            "Enterprise-Grade Contactless Attendance: Sub-second multi-person verification with zero proxy attendance.",
            "Zero Friend-Swap False Positives: Strict 95% threshold combined with mathematical Ambiguity Margin Rule.",
            "Intelligent Edge Processing: Native Logitech C270 USB webcam optimization, YOLOv8n-face detection, and MediaPipe liveness.",
            "Resilient Cloud Serverless Backbone: Amazon Rekognition User Vectors, DynamoDB idempotent locks, and S3 audit storage.",
            "Bespoke Editorial UI Architecture: Architectural ceramic aesthetic with Newsreader Serif and Tabular Inter typography."
        ],
        "img": "01_smart_attendance_system.jpg"
    },
    {
        "title": "The Problem: Traditional Attendance",
        "subtitle": "Vulnerabilities of Legacy Systems",
        "points": [
            "Manual Paper Registers: Subject to signature forgery, lost sheets, manual entry delays, and lack of audit trails.",
            "Buddy Punching & Proxy Attendance: Students sharing RFID cards or badges to falsely mark absent peers.",
            "Fingerprint Scanner Bottlenecks: Hygiene concerns, slow transit throughput during peak morning arrival windows, hardware wear.",
            "Naive Facial POC Vulnerabilities: Single-frame photo/screen spoofing, severe lighting sensitivity, and USB buffer lag.",
            "Incomplete Roster Tracking: Legacy systems omit absent students until final manual roll-call reconciliation."
        ],
        "img": "02_traditional_attendance_problem.png"
    },
    {
        "title": "Camera Input (Logitech Webcam)",
        "subtitle": "Hardware-Tuned USB Video Capture Pipeline",
        "points": [
            "Logitech C270 & USB Webcam Optimization: High-throughput 1080p / 720p stream at 30 FPS over MJPG FourCC codec.",
            "Zero Frame Buffer Latency: Dedicated background thread continuously drains USB buffer (CAP_PROP_BUFFERSIZE = 1).",
            "OS-Specific Video Backends: Automatically selects DirectShow (CAP_DSHOW) on Windows and Video4Linux (CAP_V4L2) on Linux.",
            "Intelligent Camera Enumeration: Discovers and lists connected video devices with auto-selection.",
            "Automatic USB Reconnect Logic: Exponential backoff reconnects stream seamlessly if cable is unplugged."
        ],
        "img": "03_camera_input_logitech.png"
    },
    {
        "title": "Face Detection (YOLO & OpenCV)",
        "subtitle": "Robust Multi-Person Bounding Box Regression",
        "points": [
            "Ultralytics YOLOv8n-face: Single-stage convolutional neural network optimized for fast, accurate multi-face localization.",
            "Adaptive 30% Symmetric Padding: Clamped to frame bounds to capture entire facial geometry (jawline, ears, forehead).",
            "Quality Crop Gating: Rejects crops smaller than 120x120 pixels or below 0.80 detection confidence.",
            "Adaptive CLAHE Normalization: Enhances L-channel in LAB color space when mean brightness < 75.",
            "Simultaneous Multi-Person Tracking: Centroid tracker tracks concurrent faces with 15-second individual cooldowns."
        ],
        "img": "04_face_detection_yolo_opencv.png"
    },
    {
        "title": "Liveness Check (Real Person vs Photo)",
        "subtitle": "MediaPipe 3D Mesh & Optical Liveness Verification",
        "points": [
            "Anti-Spoofing Protection: Defeats 2D printed photographs, digital tablets, and mobile screen replays.",
            "MediaPipe Face Landmarker: 468-point 3D facial mesh for high-fidelity eye and contour tracking.",
            "Eye Aspect Ratio (EAR) Blink Detection: Requires verified blink cycle (EAR < 0.22) within a 5-second window.",
            "Head-Pose Symmetry Validation: Restricts extreme yaw (>30 deg) and pitch (>20 deg) to ensure frontal alignment.",
            "Laplacian Blur Filtering: Rejects motion-blurred transit crops (variance < 110.0) locally before cloud dispatch."
        ],
        "img": "05_liveness_check_real_vs_photo.png"
    },
    {
        "title": "Student Registration (Multi-Angle Photos)",
        "subtitle": "Strict Biometric Enrollment & Vector Purity",
        "points": [
            "5-Angle Enrollment Studio: Captures Frontal, Slight Left, Slight Right, Neutral, and Tilted reference angles.",
            "Single-Face Guard: Calls DetectFaces prior to indexing; rejects image if face count != 1 (prevents friend contamination).",
            "Cross-User Collision Detection: SearchUsersByImage checks if face is already registered under another ID (HTTP 409).",
            "High Quality Filtering: IndexFaces applies QualityFilter=HIGH to eliminate low-resolution training samples.",
            "S3 Archival Storage: Original high-resolution angles securely stored in AWS S3 for auditability."
        ],
        "img": "06_student_registration_multi_angle.png"
    },
    {
        "title": "Cloud Face Matching (AWS Rekognition)",
        "subtitle": "Deep User Vector Search & Ambiguity Defense",
        "points": [
            "Amazon Rekognition User Vectors: High-dimensional vector embeddings stored in smart-attendance-collection.",
            "Strict Similarity Floor: Configured threshold of 95.0% (hard minimum of 93.0%) guarantees accurate identification.",
            "Ambiguity Margin Rule: Evaluates top candidates; requires (top1 - top2) >= 4.0% similarity separation.",
            "Zero Friend-Swap False Positives: Rejects close runner-up matches with HTTP 422 AMBIGUOUS_MATCH.",
            "Sub-Second Verification: Complete cloud vector search and DynamoDB state lock executes in < 350 ms."
        ],
        "img": "07_cloud_face_matching_rekognition.png"
    },
    {
        "title": "Database & Storage (DynamoDB, S3 & SQLite)",
        "subtitle": "Resilient Hybrid Cloud & Offline Persistence Architecture",
        "points": [
            "SmartAttendanceUsers Table: Master student directory, roll numbers, departments, and Rekognition FaceIds.",
            "SmartAttendanceLogs Table: Daily partitions (CLASS#YYYY-MM-DD in IST) with sort key user_id.",
            "Idempotent Conditional Lock: attribute_not_exists(user_id) prevents duplicate check-in overwrite.",
            "Amazon S3 Audit Storage: Automatically archives timestamped live capture frames under audit/YYYY-MM-DD/.",
            "SQLite WAL Offline Queue: Edge kiosks buffer check-in events during WAN outages and auto-sync on reconnect."
        ],
        "img": "08_database_storage_dynamodb_s3.png"
    },
    {
        "title": "Live Attendance Dashboard",
        "subtitle": "Editorial Architectural Interface & 100% Roster Tracking",
        "points": [
            "100% Enrolled Student Visibility: Exhaustive LastEvaluatedKey pagination loops return all registered students.",
            "Full Left-Join Roster Engine: Un-scanned students automatically appear as ABSENT; flip dynamically to PRESENT upon scan.",
            "Bespoke Ceramic Aesthetic: Designed with Newsreader serif headlines and tabular-nums Inter alignment.",
            "Real-Time Ticking IST Clock: Synchronized with Asia/Kolkata (UTC+05:30) to eliminate midnight boundary bugs.",
            "Integrated Admin Controls: Slide-over profile editor, delete check-in capability, and 1-click verified CSV export."
        ],
        "img": "09_live_attendance_dashboard.jpg"
    },
    {
        "title": "Hosting & Automation (EC2, Nginx & Jenkins)",
        "subtitle": "Production Infrastructure & Automated CI/CD Pipeline",
        "points": [
            "AWS EC2 Cloud Host: Ubuntu 24.04 LTS instance running in ap-south-1 (Mumbai).",
            "Nginx Reverse Proxy: Production HTTPS termination with automated Let's Encrypt SSL certificate renewal.",
            "PM2 Process Manager: Zero-downtime application process management with automatic system restart.",
            "GitHub Webhook Integration: Push events to main branch trigger Jenkins automated CI/CD pipeline.",
            "Automated 39-Test Suite: Jenkins validates Python backend and edge kiosk before compiling Vite bundle and reloading."
        ],
        "img": "10_hosting_automation_ec2_jenkins.png"
    }
]

for idx, data in enumerate(slide_data):
    slide = prs.slides[idx]
    
    # 1. Update Title Shape
    title_shape = slide.shapes[0]
    title_shape.text_frame.word_wrap = True
    p = title_shape.text_frame.paragraphs[0]
    p.text = data["title"]
    p.font.name = "Georgia"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = RGBColor(20, 20, 19)
    
    # 2. Left column text box
    body_shape = slide.shapes[1]
    body_shape.left = Inches(0.8)
    body_shape.top = Inches(1.5)
    body_shape.width = Inches(5.6)
    body_shape.height = Inches(5.4)
    
    tf = body_shape.text_frame
    tf.word_wrap = True
    tf.clear()
    
    sub_p = tf.paragraphs[0]
    sub_p.text = data["subtitle"].upper()
    sub_p.font.name = "Calibri"
    sub_p.font.size = Pt(11)
    sub_p.font.bold = True
    sub_p.font.color.rgb = RGBColor(22, 101, 52)
    sub_p.space_after = Pt(12)
    
    for point in data["points"]:
        bp = tf.add_paragraph()
        bp.text = point
        bp.font.name = "Calibri"
        bp.font.size = Pt(13)
        bp.font.color.rgb = RGBColor(50, 50, 48)
        bp.space_after = Pt(8)
        bp.level = 0
    
    # 3. Add Image on the Right
    img_path = os.path.join(img_dir, data["img"])
    if os.path.exists(img_path):
        with Image.open(img_path) as im:
            iw, ih = im.size
            aspect = iw / ih
        
        max_w = Inches(5.9)
        max_h = Inches(5.3)
        
        if (max_w / max_h) > aspect:
            final_h = max_h
            final_w = final_h * aspect
        else:
            final_w = max_w
            final_h = final_w / aspect
            
        img_left = Inches(6.8) + (max_w - final_w) / 2
        img_top = Inches(1.55) + (max_h - final_h) / 2
        
        slide.shapes.add_picture(img_path, img_left, img_top, width=final_w, height=final_h)
        print("Slide", idx + 1, ": Added image", data["img"])

prs.save(pptx_out_repo)
prs.save(pptx_out_art)
shutil.copy2(pptx_out_repo, pptx_in)
print("Successfully generated and saved updated presentation!")
