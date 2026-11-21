"""
Builds high-resolution authentic visual cards for the 23-slide presentation
using the real project webcam photo, live dashboard screenshot, and MobaXterm terminal screenshot.
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

BASE_DIR = r"d:\project\WEBCAM PROJ\aws-face-recognition-attendance-system"
ASSETS_DIR = os.path.join(BASE_DIR, "docs", "deck_assets")
IMAGES_DIR = os.path.join(BASE_DIR, "docs", "images")

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

# User real photos & screenshots
CAM_PATH = os.path.join(IMAGES_DIR, "real_logitech_c270_webcam.jpg")
DASH_PATH = os.path.join(IMAGES_DIR, "real_live_kiosk_c270.png")
TERM_PATH = os.path.join(IMAGES_DIR, "real_ubuntu_mobaxterm_ec2.png")
ROSTER_PATH = os.path.join(IMAGES_DIR, "real_attendance_dashboard_roster.png")


def get_font(size, bold=False, mono=False):
    try:
        if mono:
            return ImageFont.truetype("consola.ttf", size)
        fn = "segoeuib.ttf" if bold else "segoeui.ttf"
        return ImageFont.truetype(fn, size)
    except Exception:
        return ImageFont.load_default()


def fit_and_paste(canvas, img_path, box, radius=16, border=(226, 232, 240)):
    """Resizes and crops image to fit inside box, pasting it with rounded corners."""
    bx0, by0, bx1, by1 = box
    bw = bx1 - bx0
    bh = by1 - by0

    with Image.open(img_path) as im:
        im = im.convert("RGB")
        # Resize maintaining aspect ratio
        fitted = ImageOps.fit(im, (bw, bh), method=Image.Resampling.LANCZOS)

    # Rounded mask
    mask = Image.new("L", (bw, bh), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([0, 0, bw, bh], radius=radius, fill=255)

    canvas.paste(fitted, (bx0, by0), mask)

    # Draw border
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=radius, outline=border, width=2)


# ==============================================================================
# 1. Slide 2: Real Side-by-Side (Webcam + Live Dashboard)
# ==============================================================================
def make_slide2_side_by_side(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_card_title = get_font(22, bold=True)
    f_card_sub = get_font(15, bold=False)
    f_badge = get_font(13, bold=True)
    f_pill = get_font(14, bold=True)

    # Left Card: Physical Hardware (Logitech C270)
    # x: 40 to 880, y: 30 to 920
    draw.rounded_rectangle([40, 30, 880, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    # Title & Sub
    draw.text((70, 55), "PHYSICAL HARDWARE SETUP", fill=(15, 23, 42), font=f_card_title)
    draw.text((70, 92), "Logitech C270 HD USB Webcam • Native Linux UVC Driver", fill=(100, 116, 139), font=f_card_sub)
    # Badge
    draw.rounded_rectangle([700, 55, 850, 90], radius=8, fill=(5, 150, 105))
    draw.text((715, 62), "CLASSROOM HW", fill=(255, 255, 255), font=f_badge)
    # Image
    fit_and_paste(canvas, CAM_PATH, (70, 130, 850, 820), radius=16)
    # Pill
    draw.rounded_rectangle([70, 840, 850, 895], radius=12, fill=(241, 245, 249), outline=(203, 213, 225), width=1)
    draw.text((95, 855), "Logitech C270 • 720p 30 FPS • Dedicated Background Capture Thread (Zero Lag)", fill=(30, 41, 59), font=f_pill)

    # Right Card: Live Production Kiosk Dashboard
    # x: 920 to 1760, y: 30 to 920
    draw.rounded_rectangle([920, 30, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    # Title & Sub
    draw.text((950, 55), "LIVE ENTERPRISE DASHBOARD", fill=(15, 23, 42), font=f_card_title)
    draw.text((950, 92), "https://13-126-255-119.sslip.io • Edge Biometric Node", fill=(100, 116, 139), font=f_card_sub)
    # Badge
    draw.rounded_rectangle([1570, 55, 1730, 90], radius=8, fill=(2, 132, 199))
    draw.text((1585, 62), "CLOUD LIVE", fill=(255, 255, 255), font=f_badge)
    # Image
    fit_and_paste(canvas, DASH_PATH, (950, 130, 1730, 820), radius=16)
    # Pill
    draw.rounded_rectangle([950, 840, 1730, 895], radius=12, fill=(240, 253, 244), outline=(187, 247, 208), width=1)
    draw.text((975, 855), "Recent Verifications: vigu (Present 86%) • siva (Present 86%) • Biometric Node Ready", fill=(22, 101, 52), font=f_pill)

    canvas.save(out_path)
    print("Saved Slide 2 visual:", out_path)


# ==============================================================================
# 2. Slide 5: Inside the Linux Terminal (Real MobaXterm + Commands Breakdown)
# ==============================================================================
def make_slide5_terminal(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_card_title = get_font(22, bold=True)
    f_card_sub = get_font(15, bold=False)
    f_badge = get_font(13, bold=True)
    f_cmd = get_font(18, bold=True, mono=True)
    f_desc = get_font(14, bold=False)

    # Left: Real MobaXterm Terminal Window (x: 40 to 980, y: 30 to 920)
    draw.rounded_rectangle([40, 30, 980, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((70, 55), "REAL SERVER TERMINAL (MobaXterm)", fill=(15, 23, 42), font=f_card_title)
    draw.text((70, 92), "Live SSH Session • ubuntu@13.126.255.119 (AWS EC2 Mumbai)", fill=(100, 116, 139), font=f_card_sub)
    draw.rounded_rectangle([820, 55, 950, 90], radius=8, fill=(30, 41, 59))
    draw.text((838, 62), "BASH SSH", fill=(255, 255, 255), font=f_badge)
    fit_and_paste(canvas, TERM_PATH, (70, 130, 950, 840), radius=16)
    draw.text((75, 865), "Actual prompt: ubuntu@ip-172-31-5-93:~$ (EC2 Private Subnet)", fill=(100, 116, 139), font=get_font(13))

    # Right: Essential Linux Commands Breakdown (x: 1020 to 1760, y: 30 to 920)
    draw.rounded_rectangle([1020, 30, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((1050, 55), "ESSENTIAL COMMANDS EXPLAINED", fill=(15, 23, 42), font=f_card_title)
    draw.text((1050, 92), "Giving Direct Instructions to the Operating System", fill=(100, 116, 139), font=f_card_sub)

    commands = [
        ("whoami", "Discovers your active user identity ('ubuntu' admin).", (2, 132, 199)),
        ("ls -la", "Lists every file, hidden config (.env), and AI weight model.", (5, 150, 105)),
        ("mkdir demo && cd demo", "Creates a directory folder and steps into it in 1 millisecond.", (217, 119, 6)),
        ("top / htop", "Monitors live CPU cores, RAM consumption & background daemons.", (147, 51, 234)),
        ("sudo tee /etc/sudoers.d/...", "Grants automated root permissions to background workers (like Jenkins).", (220, 38, 38)),
    ]

    by = 145
    for cmd, desc, col in commands:
        draw.rounded_rectangle([1050, by, 1730, by + 125], radius=16, fill=(248, 250, 252), outline=(226, 232, 240), width=2)
        # Colored command pill
        draw.rounded_rectangle([1070, by + 18, 1380, by + 56], radius=8, fill=col)
        draw.text((1085, by + 23), f"$ {cmd}", fill=(255, 255, 255), font=f_cmd)
        # Description
        draw.text((1070, by + 72), desc, fill=(51, 65, 85), font=f_desc)
        by += 145

    canvas.save(out_path)
    print("Saved Slide 5 visual:", out_path)


# ==============================================================================
# 3. Slide 6: Live Demo: Linux Powering Our Server
# ==============================================================================
def make_slide6_ec2_live_demo(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_title = get_font(22, bold=True)
    f_sub = get_font(15, bold=False)
    f_metric_h = get_font(13, bold=True)
    f_metric_v = get_font(18, bold=True)

    # Outer Frame
    draw.rounded_rectangle([40, 30, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((70, 55), "PRODUCTION CLOUD HOST: UBUNTU 24.04 LTS (AWS EC2)", fill=(15, 23, 42), font=f_title)
    draw.text((70, 92), "Host: 13.126.255.119 • Region: AWS ap-south-1 (Mumbai) • Architecture: x86_64", fill=(100, 116, 139), font=f_sub)

    # Status Pill
    draw.rounded_rectangle([1540, 55, 1730, 90], radius=8, fill=(5, 150, 105))
    draw.text((1560, 62), "100% ONLINE 24/7", fill=(255, 255, 255), font=get_font(13, bold=True))

    # Center Image: Real MobaXterm Terminal
    fit_and_paste(canvas, TERM_PATH, (70, 135, 1730, 770), radius=16)

    # Bottom 4 Metrics Bar
    metrics = [
        ("OPERATING SYSTEM", "Ubuntu 24.04 LTS (Noble)", (30, 41, 59)),
        ("PUBLIC IP ADDRESS", "13.126.255.119", (2, 132, 199)),
        ("BACKGROUND DAEMON", "PM2 Process Manager", (5, 150, 105)),
        ("SSH CONNECTION", "MobaXterm Enhanced Terminal", (217, 119, 6)),
    ]

    mw = 390
    for i, (mh, mv, col) in enumerate(metrics):
        mx0 = 70 + i * (mw + 25)
        mx1 = mx0 + mw
        draw.rounded_rectangle([mx0, 795, mx1, 895], radius=14, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
        draw.text((mx0 + 20, 810), mh, fill=col, font=f_metric_h)
        draw.text((mx0 + 20, 840), mv, fill=(15, 23, 42), font=f_metric_v)

    canvas.save(out_path)
    print("Saved Slide 6 visual:", out_path)


# ==============================================================================
# 4. Slide 10: Code Meets Hardware (Python Script + Real Logitech Webcam)
# ==============================================================================
def make_slide10_code_hardware(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_title = get_font(22, bold=True)
    f_sub = get_font(15, bold=False)
    f_code = get_font(17, bold=False, mono=True)
    f_code_bold = get_font(17, bold=True, mono=True)

    # Left: Clean Python Code Card (x: 40 to 880, y: 30 to 920)
    draw.rounded_rectangle([40, 30, 880, 920], radius=24, fill=(24, 24, 27), outline=(39, 39, 42), width=2)
    # Title bar
    draw.rounded_rectangle([40, 30, 880, 90], radius=24, fill=(39, 39, 42))
    draw.ellipse([65, 52, 81, 68], fill="#EF4444")
    draw.ellipse([90, 52, 106, 68], fill="#F59E0B")
    draw.ellipse([115, 52, 131, 68], fill="#10B981")
    draw.text((150, 48), "camera_kiosk.py — Visual Studio Code", fill="#A1A1AA", font=get_font(16, bold=True))

    code_lines = [
        ("# 1. Import OpenCV computer vision library", "#71717A", False),
        ("import cv2", "#38BDF8", True),
        ("", "#FFFFFF", False),
        ("# 2. Connect to physical Logitech C270 USB webcam", "#71717A", False),
        ("camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)", "#F43F5E", True),
        ("", "#FFFFFF", False),
        ("# 3. Read live photon frame from optical glass lens", "#71717A", False),
        ("success, frame = camera.read()", "#F43F5E", True),
        ("", "#FFFFFF", False),
        ("# 4. Detect student face using YOLOv8 neural network", "#71717A", False),
        ("if face_detected(frame):", "#FBBF24", True),
        ("    # 5. Verify liveness & mark present in AWS Cloud", "#71717A", False),
        ("    mark_attendance(student_id='STU101')", "#10B981", True),
        ("", "#FFFFFF", False),
        ("# Result: Green LED lights up on webcam!", "#34D399", False),
    ]

    cy = 120
    for line, color, is_b in code_lines:
        f = f_code_bold if is_b else f_code
        draw.text((70, cy), line, fill=color, font=f)
        cy += 44

    # Right: Physical Webcam Responding (x: 920 to 1760, y: 30 to 920)
    draw.rounded_rectangle([920, 30, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((950, 55), "PHYSICAL HARDWARE RESPONDING", fill=(15, 23, 42), font=f_title)
    draw.text((950, 92), "The moment code runs, the Logitech C270 green LED turns on!", fill=(100, 116, 139), font=f_sub)
    draw.rounded_rectangle([1560, 55, 1730, 90], radius=8, fill=(5, 150, 105))
    draw.text((1575, 62), "HARDWARE ON", fill=(255, 255, 255), font=get_font(13, bold=True))

    fit_and_paste(canvas, CAM_PATH, (950, 130, 1730, 820), radius=16)

    draw.rounded_rectangle([950, 840, 1730, 895], radius=12, fill=(240, 253, 244), outline=(187, 247, 208), width=1)
    draw.text((975, 855), "Magic of Computer Science: Plain text instructions awaken real silicon & glass!", fill=(22, 101, 52), font=get_font(14, bold=True))

    canvas.save(out_path)
    print("Saved Slide 10 visual:", out_path)


# ==============================================================================
# 5. Slide 17: Jenkins (CI/CD) with Real Sudoers Terminal Configuration
# ==============================================================================
def make_slide17_jenkins(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_title = get_font(22, bold=True)
    f_sub = get_font(15, bold=False)
    f_badge = get_font(13, bold=True)

    # Top: 4 Jenkins Pipeline Cards
    draw.rounded_rectangle([40, 30, 1760, 390], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((70, 55), "JENKINS AUTOMATION PIPELINE (CI/CD)", fill=(15, 23, 42), font=f_title)
    draw.text((70, 92), "How Modern Tech Companies Test & Ship Code Without Human Errors", fill=(100, 116, 139), font=f_sub)
    draw.rounded_rectangle([1580, 55, 1730, 90], radius=8, fill=(220, 38, 38))
    draw.text((1595, 62), "STAGE 5 TOOL", fill=(255, 255, 255), font=f_badge)

    stages = [
        ("1. Git Push Webhook", "Developer pushes code to GitHub repository.", "TRIGGER", (30, 41, 59)),
        ("2. Automated Tests (39/39)", "Jenkins runs pytest suite verifying face algorithms.", "TEST SUITE", (5, 150, 105)),
        ("3. Automated Vite Build", "Compiles React dashboard frontend assets.", "BUILD STAGE", (2, 132, 199)),
        ("4. Zero-Downtime Deploy", "Reloads PM2 on Ubuntu EC2 without dropping users.", "DEPLOYMENT", (217, 119, 6)),
    ]

    cw = 390
    for i, (st, desc, bdg, bcol) in enumerate(stages):
        cx0 = 70 + i * (cw + 25)
        cx1 = cx0 + cw
        draw.rounded_rectangle([cx0, 140, cx1, 350], radius=16, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
        draw.text((cx0 + 20, 160), st, fill=(15, 23, 42), font=get_font(17, bold=True))
        draw.text((cx0 + 20, 200), desc, fill=(100, 116, 139), font=get_font(14))
        draw.rounded_rectangle([cx0 + 20, 290, cx0 + 160, 325], radius=6, fill=bcol)
        draw.text((cx0 + 30, 298), bdg, fill=(255, 255, 255), font=get_font(12, bold=True))

    # Bottom: Real Terminal Setup for Jenkins
    draw.rounded_rectangle([40, 420, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((70, 445), "REAL SERVER SETUP: GRANTING JENKINS SUDO PRIVILEGES", fill=(15, 23, 42), font=f_title)
    draw.text((70, 482), "Real Command: echo 'jenkins ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/jenkins", fill=(100, 116, 139), font=f_sub)

    # Frame the terminal screenshot
    fit_and_paste(canvas, TERM_PATH, (70, 520, 1730, 890), radius=16)

    canvas.save(out_path)
    print("Saved Slide 17 visual:", out_path)


# ==============================================================================
# 6. Slide 23: Complete Journey Panorama with Live Kiosk
# ==============================================================================
def make_slide23_panorama(out_path):
    canvas = Image.new("RGB", (1800, 950), (247, 247, 245))
    draw = ImageDraw.Draw(canvas)

    f_title = get_font(22, bold=True)
    f_sub = get_font(15, bold=False)

    # Left: 7-layer roadmap (x: 40 to 880, y: 30 to 920)
    draw.rounded_rectangle([40, 30, 880, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((70, 55), "THE 7-LAYER INDUSTRY STACK", fill=(15, 23, 42), font=f_title)
    draw.text((70, 92), "Every production system is built on these 7 stepping stones:", fill=(100, 116, 139), font=f_sub)

    layers = [
        ("1. Linux OS", "The invisible rock-solid engine running 96%+ of world servers.", (30, 41, 59)),
        ("2. Python Language", "Turning human ideas into clean, readable machine instructions.", (2, 132, 199)),
        ("3. AI & Vision (YOLO)", "Giving machines eyes to see, locate, and verify students.", (5, 150, 105)),
        ("4. Docker Containers", "Packaging apps so they behave identically everywhere.", (37, 99, 235)),
        ("5. Jenkins (CI/CD)", "The automation butler testing and shipping code instantly.", (220, 38, 38)),
        ("6. AWS Cloud Supercomputers", "Renting computing, database, and vector matching on demand.", (217, 119, 6)),
        ("7. Global Networking", "Sub-second packets traveling between webcam and cloud.", (13, 148, 136)),
    ]

    ly = 135
    for name, desc, col in layers:
        draw.rounded_rectangle([70, ly, 850, ly + 95], radius=12, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
        draw.rounded_rectangle([85, ly + 14, 280, ly + 46], radius=6, fill=col)
        draw.text((95, ly + 19), name, fill=(255, 255, 255), font=get_font(13, bold=True))
        draw.text((85, ly + 56), desc, fill=(71, 85, 105), font=get_font(13))
        ly += 105

    # Right: The Working Live System (x: 920 to 1760, y: 30 to 920)
    draw.rounded_rectangle([920, 30, 1760, 920], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.text((950, 55), "THE WORKING RESULT: LIVE ATTENDANCE SYSTEM", fill=(15, 23, 42), font=f_title)
    draw.text((950, 92), "https://13-126-255-119.sslip.io • Powered by All 7 Layers", fill=(100, 116, 139), font=f_sub)
    draw.rounded_rectangle([1580, 55, 1730, 90], radius=8, fill=(5, 150, 105))
    draw.text((1595, 62), "ALL 7 LAYERS", fill=(255, 255, 255), font=get_font(12, bold=True))

    fit_and_paste(canvas, DASH_PATH, (950, 130, 1730, 820), radius=16)

    draw.rounded_rectangle([950, 840, 1730, 895], radius=12, fill=(240, 253, 244), outline=(187, 247, 208), width=1)
    draw.text((975, 855), "From a student laptop to an enterprise cloud: you have the blueprint to build anything!", fill=(22, 101, 52), font=get_font(14, bold=True))

    canvas.save(out_path)
    print("Saved Slide 23 visual:", out_path)


if __name__ == "__main__":
    make_slide2_side_by_side(os.path.join(ASSETS_DIR, "slide2_real_attendance_demo.png"))
    make_slide5_terminal(os.path.join(ASSETS_DIR, "slide5_real_terminal.png"))
    make_slide6_ec2_live_demo(os.path.join(ASSETS_DIR, "slide6_real_ec2_ubuntu.png"))
    make_slide10_code_hardware(os.path.join(ASSETS_DIR, "slide10_code_meets_hardware.png"))
    make_slide17_jenkins(os.path.join(ASSETS_DIR, "slide17_jenkins_automation.png"))
    make_slide23_panorama(os.path.join(ASSETS_DIR, "slide23_complete_journey_with_kiosk.png"))
    print("All authentic slide assets generated successfully!")
