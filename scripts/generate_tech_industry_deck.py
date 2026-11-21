"""
Generator script for the 23-slide 'How the Tech Industry Works' PowerPoint presentation.
Target audience: 1st-year college students.
Format: 16:9 widescreen, clean studio aesthetic (#F7F7F5), zero on-slide text clutter,
authentic tool recognition + clean 3D isometric models, speaker notes on every slide.
"""

import os
import sys
import shutil
import subprocess
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from mpl_toolkits.mplot3d import Axes3D
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import pptx
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

BASE_DIR = r"d:\project\WEBCAM PROJ\aws-face-recognition-attendance-system"
ASSETS_DIR = os.path.join(BASE_DIR, "docs", "deck_assets")
IMAGES_DIR = os.path.join(BASE_DIR, "docs", "images")
USER_UP = r"C:\Users\Sivanandan\.gemini\antigravity\brain\2e7993e5-0d65-4279-855f-83f68f1e45c0\.user_uploaded"
OUTPUT_PPTX_REPO = r"d:\project\WEBCAM PROJ\Tech_Industry_How_It_Works_Presentation.pptx"
OUTPUT_PPTX_ART = r"C:\Users\Sivanandan\.gemini\antigravity\brain\2e7993e5-0d65-4279-855f-83f68f1e45c0\Tech_Industry_How_It_Works_Presentation.pptx"

os.makedirs(ASSETS_DIR, exist_ok=True)


# ==============================================================================
# 1. HELPER GRAPHICS & 3D ISOMETRIC GENERATORS
# ==============================================================================

def create_base_canvas(width=1800, height=1050, bg_color=(247, 247, 245)):
    return Image.new("RGB", (width, height), bg_color)


def draw_rounded_card(im, xy, fill=(255, 255, 255), outline=(225, 225, 220), radius=20, shadow=True):
    draw = ImageDraw.Draw(im)
    x0, y0, x1, y1 = xy
    if shadow:
        s_draw = ImageDraw.Draw(im)
        s_draw.rounded_rectangle([x0+4, y0+6, x1+4, y1+6], radius=radius, fill=(230, 230, 226))
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline, width=2)
    return im


def generate_3d_assembly_line_slide1(out_path):
    """Slide 1: 3D Isometric 7-stage assembly line roadmap"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=24, azim=-55)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    stages = [
        ("1. Linux", "#1E293B", 0, 0),
        ("2. Python", "#0284C7", 2.2, 0.4),
        ("3. AI / ML", "#059669", 4.4, 0.2),
        ("4. Docker", "#2563EB", 6.6, 0.6),
        ("5. Jenkins", "#DC2626", 8.8, 0.3),
        ("6. AWS Cloud", "#D97706", 11.0, 0.7),
        ("7. Network", "#0D9488", 13.2, 0.5),
    ]

    for name, col, x, y in stages:
        # 3D block
        ax.bar3d(x, y, 0, 1.6, 1.4, 0.5, color=col, shade=True, edgecolor='#334155', alpha=0.95, linewidth=1.2)
        # Glow base
        ax.bar3d(x-0.1, y-0.1, -0.05, 1.8, 1.6, 0.05, color='#CBD5E1', alpha=0.5)
        # Label on top
        ax.text(x + 0.8, y + 0.7, 0.85, name, color='#0F172A', fontsize=11, fontweight='bold',
                horizontalalignment='center', verticalalignment='bottom')

    # Draw connecting glowing paths
    for i in range(len(stages) - 1):
        x1, y1 = stages[i][2] + 1.6, stages[i][3] + 0.7
        x2, y2 = stages[i+1][2], stages[i+1][3] + 0.7
        ax.plot([x1, x2], [y1, y2], [0.25, 0.25], color='#64748B', linewidth=3.5, linestyle='--')

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_linux_kernel_slide4(out_path):
    """Slide 4: 3-tier stacked 3D isometric model of Linux Kernel"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=20, azim=-45)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    # Tier 1 (Top): Apps & Terminal
    ax.bar3d(2, 2, 3.0, 6, 4, 0.5, color='#F8FAFC', shade=True, edgecolor='#475569', linewidth=1.2)
    ax.text(5, 4, 3.8, "Top Tier: Applications & Terminal\n(Python, Web Server, Kiosk HUD)", 
            color='#0F172A', fontsize=12, fontweight='bold', ha='center')

    # Connecting arrows / glow
    ax.plot([5, 5], [4, 4], [2.3, 3.0], color='#F59E0B', linewidth=4)

    # Tier 2 (Middle): Linux Kernel
    ax.bar3d(1.5, 1.5, 1.6, 7, 5, 0.6, color='#F59E0B', shade=True, edgecolor='#B45309', alpha=0.95, linewidth=1.2)
    ax.text(5, 4, 2.4, "Middle Tier: Linux Kernel (Translator)\n(Process Scheduling • Device Drivers • RAM Management)", 
            color='#FFFFFF', fontsize=12, fontweight='bold', ha='center')

    # Connecting arrows / glow
    ax.plot([5, 5], [4, 4], [0.7, 1.6], color='#F59E0B', linewidth=4)

    # Tier 3 (Bottom): Physical Hardware
    ax.bar3d(1, 1, 0, 8, 6, 0.6, color='#1E293B', shade=True, edgecolor='#0F172A', linewidth=1.2)
    ax.text(5, 4, 0.8, "Foundation Tier: Physical Hardware\n(Intel/AMD CPU • Logitech USB Webcam • DDR RAM • SSD)", 
            color='#94A3B8', fontsize=12, fontweight='bold', ha='center')

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_python_flow_slide8(out_path):
    """Slide 8: 4-block 3D flow of Python logic into action"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=24, azim=-50)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    blocks = [
        ("1. Human Idea\n(Bulb)", "#FEF08A", 0, "#854D0E"),
        ("2. Python Code\n(.py File)", "#38BDF8", 3.2, "#0369A1"),
        ("3. Python Engine\n(Interpreter)", "#F59E0B", 6.4, "#B45309"),
        ("4. Hardware Action\n(Webcam & Screen)", "#10B981", 9.6, "#047857"),
    ]

    for title, col, x, text_col in blocks:
        ax.bar3d(x, 1, 0, 2.2, 2.2, 0.8, color=col, shade=True, edgecolor='#334155', linewidth=1.2)
        ax.text(x + 1.1, 2.1, 1.1, title, color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    for i in range(len(blocks)-1):
        x1 = blocks[i][2] + 2.2
        x2 = blocks[i+1][2]
        ax.plot([x1, x2], [2.1, 2.1], [0.4, 0.4], color='#0284C7', linewidth=4)

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_ai_pipeline_slide12(out_path):
    """Slide 12: 4-step 3D face pipeline"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=22, azim=-52)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    steps = [
        ("Step 1: Pixels\n(Logitech Camera)", "#64748B", 0),
        ("Step 2: Face Box\n(YOLOv8 Detection)", "#0284C7", 3.0),
        ("Step 3: Blink Liveness\n(MediaPipe EAR)", "#F59E0B", 6.0),
        ("Step 4: Vector Match\n(Deep ResNet)", "#10B981", 9.0),
    ]

    for title, col, x in steps:
        ax.bar3d(x, 1, 0, 2.0, 2.0, 0.8, color=col, shade=True, edgecolor='#1E293B', linewidth=1.2)
        ax.text(x + 1.0, 2.0, 1.1, title, color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    for i in range(len(steps)-1):
        x1 = steps[i][2] + 2.0
        x2 = steps[i+1][2]
        ax.plot([x1, x2], [2.0, 2.0], [0.4, 0.4], color='#059669', linewidth=4)

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_ai_training_slide13(out_path):
    """Slide 13: 3D split diagram Training vs Live Testing"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=24, azim=-48)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    # Left: Training Side
    ax.bar3d(0, 1, 0, 4.0, 3.5, 0.4, color='#E0F2FE', shade=True, edgecolor='#0284C7', linewidth=1.2)
    ax.text(2.0, 2.7, 0.7, "TRAINING (Enrollment)\n• 3-5 Multi-Angle Photos\n• Vector Math Extracted Once", 
            color='#0369A1', fontsize=11, fontweight='bold', ha='center')

    # Center: AI Brain
    ax.bar3d(5.0, 1.2, 0.6, 2.4, 3.1, 1.4, color='#10B981', shade=True, edgecolor='#047857', alpha=0.95, linewidth=1.5)
    ax.text(6.2, 2.7, 2.2, "AI Brain\n(128-D Vector Vault)", color='#FFFFFF', fontsize=12, fontweight='bold', ha='center')

    # Right: Testing Side
    ax.bar3d(8.4, 1, 0, 4.0, 3.5, 0.4, color='#FEF3C7', shade=True, edgecolor='#D97706', linewidth=1.2)
    ax.text(10.4, 2.7, 0.7, "TESTING (Live Kiosk)\n• Single Live Camera Glance\n• Match Verified in <0.3s", 
            color='#B45309', fontsize=11, fontweight='bold', ha='center')

    # Connectors
    ax.plot([4.0, 5.0], [2.7, 2.7], [0.4, 1.2], color='#0284C7', linewidth=4)
    ax.plot([7.4, 8.4], [2.7, 2.7], [1.2, 0.4], color='#10B981', linewidth=4)

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_docker_slide16(out_path):
    """Slide 16: Docker container cube snapping onto laptop and server"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=25, azim=-52)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    # Central Docker Box
    ax.bar3d(4.5, 2.5, 2.0, 3.5, 3.0, 2.0, color='#0284C7', shade=True, edgecolor='#0369A1', alpha=0.9, linewidth=1.5)
    ax.text(6.25, 4.0, 4.3, "Sealed Docker Container\n(Python + YOLO + Kiosk App)", 
            color='#FFFFFF', fontsize=12, fontweight='bold', ha='center')

    # Bottom Left: Student Laptop
    ax.bar3d(0.5, 0.5, 0, 4.0, 3.0, 0.5, color='#E2E8F0', shade=True, edgecolor='#475569', linewidth=1.2)
    ax.text(2.5, 2.0, 0.8, "Student Laptop\n(Mac / Windows)", color='#1E293B', fontsize=11, fontweight='bold', ha='center')

    # Bottom Right: Cloud Server
    ax.bar3d(7.5, 0.5, 0, 4.0, 3.0, 0.5, color='#1E293B', shade=True, edgecolor='#0F172A', linewidth=1.2)
    ax.text(9.5, 2.0, 0.8, "AWS Linux Server\n(Ubuntu in Mumbai)", color='#F8FAFC', fontsize=11, fontweight='bold', ha='center')

    # Connectors
    ax.plot([4.8, 2.5], [3.0, 2.0], [2.0, 0.7], color='#0284C7', linewidth=4, linestyle='--')
    ax.plot([7.8, 9.5], [3.0, 2.0], [2.0, 0.7], color='#0284C7', linewidth=4, linestyle='--')

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_jenkins_conveyor_slide18(out_path):
    """Slide 18: Jenkins 3D conveyor belt"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=22, azim=-50)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    stations = [
        ("1. Git Push\n(GitHub)", "#1E293B", 0),
        ("2. Auto Test\n(39/39 Passed)", "#10B981", 3.2),
        ("3. Auto Build\n(Vite Bundle)", "#F59E0B", 6.4),
        ("4. Live Server\n(PM2 Reload)", "#0284C7", 9.6),
    ]

    # Conveyor belt base
    ax.bar3d(-0.5, 1.2, -0.15, 12.8, 1.6, 0.15, color='#CBD5E1', shade=True)

    for title, col, x in stations:
        ax.bar3d(x, 1, 0, 2.0, 2.0, 1.0, color=col, shade=True, edgecolor='#334155', linewidth=1.2)
        ax.text(x + 1.0, 2.0, 1.3, title, color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_aws_cloud_slide20(out_path):
    """Slide 20: 3D floating AWS cloud island"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=24, azim=-48)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    # Cloud base
    ax.bar3d(0, 0, 0, 10, 6, 0.5, color='#F8FAFC', shade=True, edgecolor='#CBD5E1', linewidth=1.5)
    ax.text(5, 0.5, 0.8, "Amazon Web Services (ap-south-1 Mumbai Cloud Island)", 
            color='#64748B', fontsize=11, fontweight='bold', ha='center')

    # 3 Cloud Blocks
    ax.bar3d(1.0, 1.8, 0.5, 2.2, 2.5, 1.2, color='#F59E0B', shade=True, edgecolor='#B45309')
    ax.text(2.1, 3.0, 2.0, "AWS Lambda\n(Smart Worker)", color='#FFFFFF', fontsize=10, fontweight='bold', ha='center')

    ax.bar3d(4.0, 1.8, 0.5, 2.2, 2.5, 1.2, color='#10B981', shade=True, edgecolor='#047857')
    ax.text(5.1, 3.0, 2.0, "Rekognition\n(Face Vectors)", color='#FFFFFF', fontsize=10, fontweight='bold', ha='center')

    ax.bar3d(7.0, 1.8, 0.5, 2.2, 2.5, 1.2, color='#0284C7', shade=True, edgecolor='#0369A1')
    ax.text(8.1, 3.0, 2.0, "DynamoDB\n(Digital Register)", color='#FFFFFF', fontsize=10, fontweight='bold', ha='center')

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_networking_slide22(out_path):
    """Slide 22: Classroom webcam to cloud to dashboard network journey"""
    fig = plt.figure(figsize=(12, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=24, azim=-55)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    # 1. Classroom
    ax.bar3d(0, 1, 0, 3.0, 3.0, 0.6, color='#64748B', shade=True, edgecolor='#334155')
    ax.text(1.5, 2.5, 0.9, "1. Classroom Kiosk\n(Logitech Webcam)", color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    # 2. AWS Cloud in Mumbai
    ax.bar3d(5.0, 1.5, 1.2, 3.5, 3.0, 0.8, color='#D97706', shade=True, edgecolor='#B45309')
    ax.text(6.75, 3.0, 2.3, "2. AWS Cloud (Mumbai)\n(HTTPS Encrypted Packet)", color='#FFFFFF', fontsize=11, fontweight='bold', ha='center')

    # 3. Live Dashboard
    ax.bar3d(10.0, 1, 0, 3.0, 3.0, 0.6, color='#059669', shade=True, edgecolor='#047857')
    ax.text(11.5, 2.5, 0.9, "3. Live Dashboard\n(Green PRESENT Badge)", color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    # Glowing Network Cables
    ax.plot([3.0, 5.0], [2.5, 2.5], [0.3, 1.6], color='#0D9488', linewidth=4)
    ax.plot([8.5, 10.0], [2.5, 2.5], [1.6, 0.3], color='#0D9488', linewidth=4)

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


def generate_3d_panorama_slide23(out_path):
    """Slide 23: Complete industry journey panorama"""
    fig = plt.figure(figsize=(13, 7), dpi=150)
    ax = fig.add_subplot(111, projection='3d')
    ax.view_init(elev=26, azim=-55)
    ax.set_axis_off()
    fig.patch.set_facecolor('#F7F7F5')
    ax.set_facecolor('#F7F7F5')

    steps = [
        ("Linux", "#1E293B", 0, 0),
        ("Python", "#0284C7", 2.2, 0.3),
        ("AI / ML", "#059669", 4.4, 0.6),
        ("Docker", "#2563EB", 6.6, 0.4),
        ("Jenkins", "#DC2626", 8.8, 0.7),
        ("Cloud", "#D97706", 11.0, 0.5),
        ("Live App", "#10B981", 13.2, 0.8),
    ]

    for name, col, x, y in steps:
        ax.bar3d(x, y, 0, 1.5, 1.5, 0.7, color=col, shade=True, edgecolor='#334155', linewidth=1.2)
        ax.text(x + 0.75, y + 0.75, 1.0, name, color='#0F172A', fontsize=11, fontweight='bold', ha='center')

    for i in range(len(steps)-1):
        x1, y1 = steps[i][2] + 1.5, steps[i][3] + 0.75
        x2, y2 = steps[i+1][2], steps[i+1][3] + 0.75
        ax.plot([x1, x2], [y1, y2], [0.35, 0.35], color='#166534', linewidth=4)

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight', facecolor='#F7F7F5', dpi=150)
    plt.close()


# ==============================================================================
# 2. REAL TOOL RECOGNITION COLLAGE GENERATORS (PIL)
# ==============================================================================

def make_terminal_screenshot(out_path):
    """Generates a crisp, zoomed-in terminal window image (Slide 5)"""
    im = Image.new("RGB", (1200, 750), (15, 23, 42)) # Deep slate terminal
    draw = ImageDraw.Draw(im)

    # Title bar with macOS / Linux window dots
    draw.rectangle([0, 0, 1200, 50], fill=(30, 41, 59))
    draw.ellipse([20, 17, 36, 33], fill="#EF4444")
    draw.ellipse([45, 17, 61, 33], fill="#F59E0B")
    draw.ellipse([70, 17, 86, 33], fill="#10B981")
    draw.text((500, 15), "ubuntu@smart-attendance: ~", fill="#94A3B8")

    # Friendly terminal commands
    commands = [
        ("ubuntu@server:~$ whoami", "#38BDF8"),
        ("ubuntu  (You are the administrator of this machine!)", "#10B981"),
        ("", "#FFFFFF"),
        ("ubuntu@server:~$ ls -la", "#38BDF8"),
        ("drwxr-xr-x  attendance-system/   (Our core project folder)", "#F8FAFC"),
        ("-rw-r--r--  yolov8n-face.pt       (Trained AI face model file)", "#F8FAFC"),
        ("-rwxr-xr-x  start_server.sh      (Startup launch script)", "#F8FAFC"),
        ("", "#FFFFFF"),
        ("ubuntu@server:~$ mkdir demo_kiosk && cd demo_kiosk", "#38BDF8"),
        ("Created new directory successfully.", "#10B981"),
        ("", "#FFFFFF"),
        ("ubuntu@server:~/demo_kiosk$ top", "#38BDF8"),
        ("Tasks: 141 total, 1 running, 140 sleeping", "#E2E8F0"),
        ("%Cpu(s):  2.1 us,  0.8 sy,  97.1 id (Server is running ultra smooth!)", "#34D399"),
        ("MiB Mem :  4096.0 total,  2250.4 free,  1845.6 used", "#E2E8F0"),
    ]

    y = 80
    for line, color in commands:
        draw.text((40, y), line, fill=color)
        y += 40

    im.save(out_path)


def make_python_code_screenshot(out_path):
    """Generates an ultra-clean IDE screenshot with 5 lines of camera code (Slide 9)"""
    im = Image.new("RGB", (1200, 750), (24, 24, 27)) # Zinc dark theme
    draw = ImageDraw.Draw(im)

    # Title bar
    draw.rectangle([0, 0, 1200, 50], fill=(39, 39, 42))
    draw.ellipse([20, 17, 36, 33], fill="#EF4444")
    draw.ellipse([45, 17, 61, 33], fill="#F59E0B")
    draw.ellipse([70, 17, 86, 33], fill="#10B981")
    draw.text((480, 15), "main_camera.py — VS Code", fill="#A1A1AA")

    code_lines = [
        ("# 1. Bring in the camera library", "#71717A"),
        ("import cv2", "#38BDF8"),
        ("", "#FFFFFF"),
        ("# 2. Connect to the external Logitech USB webcam (Device 0)", "#71717A"),
        ("camera = cv2.VideoCapture(0)", "#F43F5E"),
        ("", "#FFFFFF"),
        ("# 3. Read a live frame of light from the physical glass lens", "#71717A"),
        ("success, frame = camera.read()", "#F43F5E"),
        ("", "#FFFFFF"),
        ("# 4. If AI finds a student face, verify identity & mark present!", "#71717A"),
        ("if face_detected(frame):", "#FBBF24"),
        ("    mark_attendance_present(student_id='STU101')", "#10B981"),
    ]

    y = 85
    for line, color in code_lines:
        draw.text((50, y), line, fill=color)
        y += 48

    im.save(out_path)


def make_tool_card_collage(out_path, title, items, subtitle=""):
    """
    Creates an authentic modern studio visual card for tool recognition.
    items: list of (label, badge_color, bg_color)
    """
    im = create_base_canvas(1400, 800)
    draw = ImageDraw.Draw(im)

    draw.rounded_rectangle([40, 40, 1360, 760], radius=24, fill=(255, 255, 255), outline=(225, 225, 220), width=2)
    draw.text((80, 70), title, fill=(20, 20, 19))
    if subtitle:
        draw.text((80, 120), subtitle.upper(), fill=(22, 101, 52))

    # Grid layout of tools
    n = len(items)
    cols = 2 if n <= 4 else 3
    box_w = 380 if cols == 3 else 580
    box_h = 240

    for i, it in enumerate(items):
        r = i // cols
        c = i % cols
        bx0 = 80 + c * (box_w + 30)
        by0 = 170 + r * (box_h + 30)
        bx1 = bx0 + box_w
        by1 = by0 + box_h

        draw.rounded_rectangle([bx0, by0, bx1, by1], radius=16, fill=it.get('bg', (248, 250, 252)), outline=(226, 232, 240), width=2)
        draw.text((bx0 + 25, by0 + 30), it['name'], fill=(15, 23, 42))
        draw.text((bx0 + 25, by0 + 75), it.get('desc', ''), fill=(100, 116, 139))
        draw.rounded_rectangle([bx0 + 25, by1 - 50, bx0 + 200, by1 - 20], radius=8, fill=it.get('badge_col', (14, 165, 233)))
        draw.text((bx0 + 35, by1 - 44), it.get('badge_text', 'OFFICIAL TOOL'), fill=(255, 255, 255))

    im.save(out_path)


# Pre-generate visual assets
print("Pre-generating deck assets...")

# Slide 1: 3D Assembly line
f_slide1 = os.path.join(ASSETS_DIR, "slide1_assembly_line.png")
generate_3d_assembly_line_slide1(f_slide1)

# Slide 4: 3D Linux Kernel
f_slide4 = os.path.join(ASSETS_DIR, "slide4_linux_kernel.png")
generate_3d_linux_kernel_slide4(f_slide4)

# Slide 5: Terminal
f_slide5 = os.path.join(ASSETS_DIR, "slide5_terminal.png")
make_terminal_screenshot(f_slide5)

# Slide 8: 3D Python Flow
f_slide8 = os.path.join(ASSETS_DIR, "slide8_python_flow.png")
generate_3d_python_flow_slide8(f_slide8)

# Slide 9: Python Script
f_slide9 = os.path.join(ASSETS_DIR, "slide9_python_code.png")
make_python_code_screenshot(f_slide9)

# Slide 12: 3D AI Pipeline
f_slide12 = os.path.join(ASSETS_DIR, "slide12_ai_pipeline.png")
generate_3d_ai_pipeline_slide12(f_slide12)

# Slide 13: 3D AI Training vs Testing
f_slide13 = os.path.join(ASSETS_DIR, "slide13_ai_training.png")
generate_3d_ai_training_slide13(f_slide13)

# Slide 16: 3D Docker Container
f_slide16 = os.path.join(ASSETS_DIR, "slide16_docker_container.png")
generate_3d_docker_slide16(f_slide16)

# Slide 18: 3D Jenkins Conveyor
f_slide18 = os.path.join(ASSETS_DIR, "slide18_jenkins_conveyor.png")
generate_3d_jenkins_conveyor_slide18(f_slide18)

# Slide 20: 3D AWS Cloud Island
f_slide20 = os.path.join(ASSETS_DIR, "slide20_aws_cloud.png")
generate_3d_aws_cloud_slide20(f_slide20)

# Slide 22: 3D Networking
f_slide22 = os.path.join(ASSETS_DIR, "slide22_networking.png")
generate_3d_networking_slide22(f_slide22)

# Slide 23: 3D Panorama
f_slide23 = os.path.join(ASSETS_DIR, "slide23_panorama.png")
generate_3d_panorama_slide23(f_slide23)

# Slide 3: Linux Tool Recognition Collage
f_slide3 = os.path.join(ASSETS_DIR, "slide3_linux_tools.png")
make_tool_card_collage(
    f_slide3,
    "The Linux Ecosystem: Running the Modern Digital World",
    [
        {"name": "Tux the Penguin", "desc": "Official mascot of the Linux open-source kernel.", "badge_text": "LINUX MASCOT", "badge_col": (30, 41, 59)},
        {"name": "Ubuntu Linux", "desc": "Most popular enterprise Linux OS for servers and cloud.", "badge_text": "SERVER OS", "badge_col": (234, 88, 12)},
        {"name": "Android Mobile", "desc": "3+ billion smartphones run on the Linux kernel.", "badge_text": "MOBILE OS", "badge_col": (16, 185, 129)},
        {"name": "Data Center Racks", "desc": "100% of the world's 500 supercomputers run Linux.", "badge_text": "SUPERCOMPUTERS", "badge_col": (2, 132, 199)},
    ],
    "Stage 1: Tool Recognition"
)

# Slide 7: Python Tool Recognition Collage
f_slide7 = os.path.join(ASSETS_DIR, "slide7_python_tools.png")
make_tool_card_collage(
    f_slide7,
    "Programming & Python: The Language of Innovation",
    [
        {"name": "Python 3.12", "desc": "World's #1 most popular, readable programming language.", "badge_text": "PYTHON LANGUAGE", "badge_col": (2, 132, 199)},
        {"name": "Visual Studio Code", "desc": "Industry standard developer IDE and code editor.", "badge_text": "DEVELOPER IDE", "badge_col": (37, 99, 235)},
        {"name": "JavaScript & React", "desc": "Powers the interactive browser UI of our attendance system.", "badge_text": "WEB FRONTEND", "badge_col": (202, 138, 4)},
        {"name": "Package Ecosystem (Pip)", "desc": "Over 400,000 open-source libraries ready to use.", "badge_text": "LIBRARIES", "badge_col": (13, 148, 136)},
    ],
    "Stage 2: Tool Recognition"
)

# Slide 11: AI Tool Recognition Collage
f_slide11 = os.path.join(ASSETS_DIR, "slide11_ai_tools.png")
make_tool_card_collage(
    f_slide11,
    "Artificial Intelligence & Computer Vision Toolset",
    [
        {"name": "OpenCV", "desc": "Real-time computer vision & camera video processing library.", "badge_text": "IMAGE PROCESSING", "badge_col": (220, 38, 38)},
        {"name": "Ultralytics YOLOv8", "desc": "Deep neural network for sub-20ms face bounding box detection.", "badge_text": "FACE DETECTION", "badge_col": (2, 132, 199)},
        {"name": "Google MediaPipe", "desc": "468-point 3D facial mesh for involuntary eye-blink verification.", "badge_text": "LIVENESS CHECK", "badge_col": (16, 185, 129)},
        {"name": "Deep ResNet 128-D", "desc": "Extracts mathematical facial embedding vectors.", "badge_text": "DEEP LEARNING", "badge_col": (124, 58, 237)},
    ],
    "Stage 3: Tool Recognition"
)

# Slide 15: Docker Tool Recognition Collage
f_slide15 = os.path.join(ASSETS_DIR, "slide15_docker_tools.png")
make_tool_card_collage(
    f_slide15,
    "Docker Containerization: Software Shipping Standard",
    [
        {"name": "Docker Whale & Engine", "desc": "Packs application code and runtime dependencies together.", "badge_text": "CONTAINER RUNTIME", "badge_col": (2, 132, 199)},
        {"name": "Shipping Container Model", "desc": "Eliminates 'it works on my machine' bugs forever.", "badge_text": "GLOBAL PORTABILITY", "badge_col": (234, 88, 12)},
        {"name": "Dockerfile Blueprint", "desc": "Exact recipe specifying OS, Python version, and libraries.", "badge_text": "BUILD RECIPE", "badge_col": (13, 148, 136)},
        {"name": "Docker Hub Registry", "desc": "Cloud repository storing pre-built container images.", "badge_text": "CLOUD REGISTRY", "badge_col": (37, 99, 235)},
    ],
    "Stage 4: Tool Recognition"
)

# Slide 17: Jenkins Tool Recognition Collage
f_slide17 = os.path.join(ASSETS_DIR, "slide17_jenkins_tools.png")
make_tool_card_collage(
    f_slide17,
    "Jenkins & CI/CD: Automated Software Delivery",
    [
        {"name": "Jenkins Butler", "desc": "Open-source automation server executing test & deploy jobs.", "badge_text": "AUTOMATION BUTLER", "badge_col": (220, 38, 38)},
        {"name": "GitHub Webhooks", "desc": "Triggers automated build within seconds of a git push.", "badge_text": "EVENT TRIGGER", "badge_col": (30, 41, 59)},
        {"name": "Automated Pytest (39/39)", "desc": "Validates biometric accuracy and database locks.", "badge_text": "TEST SUITE", "badge_col": (16, 185, 129)},
        {"name": "Zero-Downtime Reload", "desc": "Restarts production services without dropping live users.", "badge_text": "DEPLOYMENT", "badge_col": (2, 132, 199)},
    ],
    "Stage 5: Tool Recognition"
)

# Slide 19: AWS Cloud Tool Recognition Collage
f_slide19 = os.path.join(ASSETS_DIR, "slide19_aws_tools.png")
make_tool_card_collage(
    f_slide19,
    "Amazon Web Services (AWS): On-Demand Cloud Infrastructure",
    [
        {"name": "Amazon EC2 (Ubuntu 24.04)", "desc": "Virtual server instance hosting our 24/7 web application.", "badge_text": "CLOUD COMPUTE", "badge_col": (217, 119, 6)},
        {"name": "Amazon Rekognition", "desc": "Deep facial search engine matching face vectors in <300ms.", "badge_text": "AI BIOMETRICS", "badge_col": (16, 185, 129)},
        {"name": "Amazon DynamoDB", "desc": "Ultra-fast NoSQL table enforcing idempotent attendance locks.", "badge_text": "STATE DATABASE", "badge_col": (2, 132, 199)},
        {"name": "Amazon S3 Vault", "desc": "Secure object storage archiving high-res student photos.", "badge_text": "OBJECT STORAGE", "badge_col": (220, 38, 38)},
    ],
    "Stage 6: Tool Recognition"
)

# Slide 21: Networking Tool Recognition Collage
f_slide21 = os.path.join(ASSETS_DIR, "slide21_networking_tools.png")
make_tool_card_collage(
    f_slide21,
    "Computer Networking: The Postal System of the Internet",
    [
        {"name": "IP Addresses & Routers", "desc": "Digital coordinates directing packets from classroom to cloud.", "badge_text": "IP ROUTING", "badge_col": (13, 148, 136)},
        {"name": "DNS Phonebook", "desc": "Translates friendly names to server IP addresses.", "badge_text": "DOMAIN NAME SYSTEM", "badge_col": (2, 132, 199)},
        {"name": "HTTPS & SSL Lock", "desc": "End-to-end encrypted envelope keeping photos safe in transit.", "badge_text": "ENCRYPTED PROTOCOL", "badge_col": (16, 185, 129)},
        {"name": "Sub-Second Latency", "desc": "Packets cross continents and return verified in milliseconds.", "badge_text": "HIGH SPEED", "badge_col": (217, 119, 6)},
    ],
    "Stage 7: Tool Recognition"
)

print("All visual assets ready!")


# ==============================================================================
# 3. POWERPOINT SLIDE DEFINITIONS (23 SLIDES)
# ==============================================================================

slides_config = [
    # --- OPENING HOOK (2 Slides) ---
    {
        "slide_num": 1,
        "heading": "How the Tech Industry Works",
        "subheading": "From Writing Code on a Laptop to Running Live Apps",
        "visual_path": f_slide1,
        "notes": (
            "Welcome 1st-year students! Today, we're demystifying how real technology companies build, "
            "automate, and deliver software. Every major platform you use daily—Instagram, YouTube, Swiggy, "
            "or ChatGPT—is built and operated through these exact 7 industry layers:\n"
            "1. Linux\n2. Python Programming\n3. AI & Machine Learning\n4. Docker Containerization\n"
            "5. Jenkins CI/CD Automation\n6. AWS Cloud Infrastructure\n7. Global Computer Networking.\n\n"
            "By the end of today's session, you won't just know the buzzwords—you will understand the complete journey "
            "from typing code on a student laptop to serving live users worldwide."
        )
    },
    {
        "slide_num": 2,
        "heading": "Our Live Example: Smart Attendance",
        "subheading": "One Real System Powered by All 7 Industry Layers",
        "visual_path": os.path.join(ASSETS_DIR, "slide2_real_attendance_demo.png"),
        "notes": (
            "To keep this practical and fun, we brought a working enterprise system into the classroom: "
            "our Smart Face Recognition Attendance System.\n"
            "A student walks up to this external Logitech USB webcam, smiles, and within 300 milliseconds, "
            "their face is detected, verified against fake photo spoofing, matched in the cloud, and recorded "
            "live as PRESENT on the web dashboard.\n\n"
            "[Live Demonstration Teaser]: Sir points to the active webcam and web dashboard URL on screen. "
            "Notice the real-time clock and camera feed. Every single one of the 7 industry layers we are covering "
            "powers this exact attendance application. Let's explore the first foundation!"
        )
    },

    # --- STAGE 1: LINUX (4 Slides) ---
    {
        "slide_num": 3,
        "heading": "1. Linux",
        "subheading": "The Invisible Engine Running Almost Every Server",
        "visual_path": f_slide3,
        "notes": (
            "Stage 1: Linux. When you buy a personal laptop, you probably see Windows or macOS. "
            "But in the professional tech world, Linux is the undisputed king.\n\n"
            "Over 96% of the world's top 1 million cloud servers run on Linux. Every single one of the world's "
            "top 500 supercomputers runs on Linux. And if you have an Android phone in your pocket, its operating "
            "system core is Linux!\n\n"
            "Why do tech giants like Google, Amazon, and Netflix choose Linux? Because it is open-source, ultra-fast, "
            "free from bloatware, and can run for years without ever needing a reboot."
        )
    },
    {
        "slide_num": 4,
        "heading": "How Linux Works",
        "subheading": "The Bridge Between Physical Hardware and Your Apps",
        "visual_path": f_slide4,
        "notes": (
            "Think of Linux as the world's greatest translator.\n"
            "At the bottom, you have physical hardware: silicon chips, CPU cores, RAM memory, and our Logitech USB webcam. "
            "Physical hardware only understands electrical signals (high and low voltage).\n"
            "At the top, you have your software: Python scripts, web browsers, and video players.\n\n"
            "The Linux Kernel sits right in the center. It manages who gets memory, schedules CPU tasks thousands of times "
            "per second, and talks to USB camera drivers without slowing down. It provides a stable, predictable foundation "
            "so apps never crash each other."
        )
    },
    {
        "slide_num": 5,
        "heading": "Inside the Linux Terminal",
        "subheading": "Controlling a Computer Directly with Simple Commands",
        "visual_path": os.path.join(ASSETS_DIR, "slide5_real_terminal.png"),
        "notes": (
            "In movies, software engineers always type rapidly on a dark terminal screen without touching a mouse. "
            "That's the Linux Terminal (the Command Line Interface)!\n\n"
            "Instead of clicking through five graphical folders, in Linux you type direct instructions:\n"
            "• 'whoami' tells you your active user account.\n"
            "• 'ls' lists every file in the directory.\n"
            "• 'mkdir demo' creates a brand-new folder instantly.\n"
            "• 'top' shows live CPU and memory usage in real time.\n\n"
            "[Interactive Prompt]: Sir opens a live terminal on the projector. 'Who wants to shout out a command? "
            "Let's see who is logged in!'"
        )
    },
    {
        "slide_num": 6,
        "heading": "Live Demo: Linux Powering Our Server",
        "subheading": "Our Attendance App Running Live on Ubuntu",
        "visual_path": os.path.join(ASSETS_DIR, "slide6_real_ec2_ubuntu.png"),
        "notes": (
            "Take a look at this real terminal screen. This is our live production cloud server in Mumbai.\n"
            "It is running Ubuntu Linux 24.04 LTS. Notice that little green indicator that says 'online'? "
            "That is our Smart Attendance Dashboard running under PM2 on Linux.\n\n"
            "It doesn't have a desktop screen or a mouse attached—it runs purely in the cloud, listening for students "
            "scanning into the webcam 24 hours a day, 7 days a week, rock-solid on Linux."
        )
    },

    # --- STAGE 2: PROGRAMMING & PYTHON (4 Slides) ---
    {
        "slide_num": 7,
        "heading": "2. Programming & Python",
        "subheading": "Giving Clear Step-by-Step Instructions to Computers",
        "visual_path": f_slide7,
        "notes": (
            "Stage 2: Programming. Computers are amazingly fast, but they are completely clueless without human guidance. "
            "A computer cannot think for itself—it only executes exact instructions.\n\n"
            "Programming is just writing a precise recipe for a machine. Among all programming languages, Python is "
            "the world's favorite first language. Why? Because it reads almost like plain English! You don't have to fight "
            "with confusing syntax or memory management. You can write your first real program on day one."
        )
    },
    {
        "slide_num": 8,
        "heading": "How Python Runs Your Idea",
        "subheading": "Turning Human Logic into Real-World Action",
        "visual_path": f_slide8,
        "notes": (
            "Here is the journey of how code comes to life:\n"
            "1. It starts as an idea in your head: 'I want a camera to recognize my classmates.'\n"
            "2. You write the steps in a Python file ending in '.py'.\n"
            "3. The Python Interpreter reads your script line by line and converts your logic into machine instructions.\n"
            "4. The computer takes action: turning on a camera, crunching numbers, or sending a verification signal.\n\n"
            "Anyone in this room can learn Python in just a few weeks. It is your bridge from imagination to real software."
        )
    },
    {
        "slide_num": 9,
        "heading": "Inside a Real Python Script",
        "subheading": "Just 5 Lines of Code to Control a Camera",
        "visual_path": f_slide9,
        "notes": (
            "[Interactive Activity]: Look at this real code editor on screen. There are only five lines of code!\n"
            "Let's read them together:\n"
            "• Line 2: 'import cv2' brings in OpenCV, the camera vision library.\n"
            "• Line 5: 'camera = cv2.VideoCapture(0)' opens connection to our Logitech USB webcam.\n"
            "• Line 8: 'success, frame = camera.read()' grabs one live picture from the lens.\n"
            "• Line 11: 'if face_detected(frame):' asks our AI model if someone is standing there.\n"
            "• Line 12: 'mark_attendance_present()' updates the database!\n\n"
            "That's all it takes! Professional software isn't magic—it is composed of clean, simple logic blocks."
        )
    },
    {
        "slide_num": 10,
        "heading": "Live Demo: Code Meets Hardware",
        "subheading": "Python Turning On Our External Logitech Webcam",
        "visual_path": os.path.join(ASSETS_DIR, "slide10_code_meets_hardware.png"),
        "notes": (
            "[Live Demo Step]: Sir runs the Python camera script directly on the presenter laptop.\n"
            "Watch the projector screen. As soon as the script executes, the physical green LED on the Logitech C270 "
            "webcam lights up, and the live video stream instantly pops up on the screen.\n\n"
            "This is the thrill of computer science: typing plain text into a text editor and watching physical hardware "
            "respond immediately in the real world."
        )
    },

    # --- STAGE 3: AI & MACHINE LEARNING (4 Slides) ---
    {
        "slide_num": 11,
        "heading": "3. AI & Machine Learning",
        "subheading": "Teaching Computers to See and Learn from Examples",
        "visual_path": f_slide11,
        "notes": (
            "Stage 3: Artificial Intelligence and Machine Learning.\n"
            "In traditional programming, you have to write an explicit rule for everything: 'If temperature > 30, turn on fan.'\n"
            "But how would you write a traditional rule for what a human face looks like? Faces have different skin tones, "
            "changing haircuts, smiles, glasses, and varying lighting. It's impossible to write manual rules for all that!\n\n"
            "With Machine Learning, we don't program rules. We show the neural network thousands of photos of faces, "
            "and it learns the mathematical patterns on its own—just like a child learns to recognize their friends."
        )
    },
    {
        "slide_num": 12,
        "heading": "How AI Sees a Face",
        "subheading": "Pixels → Face Box → Blink Check → Identity Match",
        "visual_path": f_slide12,
        "notes": (
            "How does our system recognize a student in under 300 milliseconds? Here is the 4-step pipeline:\n"
            "1. Pixels: The Logitech camera captures a grid of colored pixels.\n"
            "2. Face Box: YOLOv8 (You Only Look Once) sweeps the image and draws a bounding box around every face.\n"
            "3. Liveness Check: Google MediaPipe tracks 468 landmark points and checks for a natural eye blink—stopping "
            "anyone from holding up a printed photo or phone screen!\n"
            "4. Vector Match: Deep neural networks convert the facial structure into 128 numbers and compare them to find "
            "an exact match."
        )
    },
    {
        "slide_num": 13,
        "heading": "Training vs. Live Recognition",
        "subheading": "Learning a Face Once vs. Recognizing It Every Day",
        "visual_path": f_slide13,
        "notes": (
            "Understand the fundamental difference in AI: Training versus Testing (Inference).\n\n"
            "• Training / Enrollment: When a student joins the college, they register once in our Enrollment Studio. "
            "We capture 3 to 5 reference angles (front, left, right). The AI converts those angles into a permanent mathematical vector.\n"
            "• Live Recognition: Every morning, when that student walks past the camera, the system does not re-train. "
            "It simply runs 'inference'—comparing the live glance against the stored mathematical vectors in milliseconds.\n\n"
            "Study once, recognize forever!"
        )
    },
    {
        "slide_num": 14,
        "heading": "Live Activity: Try to Fool the AI",
        "subheading": "Real Student vs. Phone Photo vs. Unregistered Friend",
        "visual_path": os.path.join(IMAGES_DIR, "05_liveness_check_real_vs_photo.png"),
        "notes": (
            "[Classroom Interactive Game]: Sir invites two student volunteers to the front.\n"
            "1. Volunteer A stands in front of the camera: the system flashes GREEN: 'Verified & Marked Present: Rohan (97%)'.\n"
            "2. Now, Volunteer B (unregistered) stands in front: the system immediately flashes RED: 'Unregistered Face - Rejected'.\n"
            "3. Volunteer B holds up a selfie photo of Volunteer A on a smartphone screen: the MediaPipe liveness filter "
            "detects no eye-blink motion and refuses to verify!\n\n"
            "The room watches real-world anti-spoofing in action."
        )
    },

    # --- STAGE 4: DOCKER (2 Slides) ---
    {
        "slide_num": 15,
        "heading": "4. Docker",
        "subheading": "Packing Your App So It Runs the Same Everywhere",
        "visual_path": f_slide15,
        "notes": (
            "Stage 4: Docker. Here is the most famous sentence in college computer science labs:\n"
            "'Sir, I swear it worked on my laptop at home, but it won't run here!'\n\n"
            "Why does that happen? Because home laptops have different Python versions, missing packages, or different OS libraries.\n"
            "In 1956, shipping containers revolutionized world shipping by placing cargo into standard metal boxes that fit any ship, "
            "train, or truck. Docker does the exact same thing for software! It bundles your code, Python runtime, and AI models "
            "into a sealed, portable container box."
        )
    },
    {
        "slide_num": 16,
        "heading": "How Docker Works",
        "subheading": "One Container Box — Identical on Laptop and Server",
        "visual_path": f_slide16,
        "notes": (
            "Look at this 3D model: Inside the blue Docker container box, we have Python 3.12, OpenCV, YOLO, and our app code.\n\n"
            "Once this container is built, it behaves 100% identically whether you run it on:\n"
            "• Your personal Windows or Mac student laptop\n"
            "• A Linux lab machine\n"
            "• An Amazon cloud supercomputer in Mumbai.\n\n"
            "No more 'it works on my machine' excuses. In real companies, everything is deployed in Docker containers."
        )
    },

    # --- STAGE 5: JENKINS (CI/CD) (2 Slides) ---
    {
        "slide_num": 17,
        "heading": "5. Jenkins (CI/CD)",
        "subheading": "The Automation Butler That Tests and Ships Code",
        "visual_path": os.path.join(ASSETS_DIR, "slide17_jenkins_automation.png"),
        "notes": (
            "Stage 5: Jenkins and CI/CD (Continuous Integration & Continuous Delivery).\n\n"
            "In movies and beginner projects, people copy files to a server over FTP or drag and drop files. "
            "In real software companies, developers NEVER manually copy code to production servers. That causes human errors and outages!\n\n"
            "Instead, companies employ an automation butler named Jenkins. The second a developer pushes new code to GitHub, "
            "Jenkins wakes up, pulls the code, runs automated tests, builds the application, and deploys it live—automatically."
        )
    },
    {
        "slide_num": 18,
        "heading": "How Jenkins Automates Delivery",
        "subheading": "Push Code → Auto Test → Auto Build → Live Update",
        "visual_path": f_slide18,
        "notes": (
            "Follow the 3D conveyor belt:\n"
            "1. Push Code: An engineer types 'git push origin main' to GitHub.\n"
            "2. Automated Testing: Jenkins catches the webhook and runs our 39 automated unit tests in under 15 seconds. "
            "If even one test fails, the build stops and alerts the team.\n"
            "3. Automated Build: If all 39 tests pass, Jenkins compiles the Vite frontend bundle.\n"
            "4. Zero-Downtime Deploy: Jenkins tells PM2 on our EC2 server to reload the live website.\n\n"
            "The live system updates in under 60 seconds without a single human logging into the server!"
        )
    },

    # --- STAGE 6: CLOUD COMPUTING / AWS (2 Slides) ---
    {
        "slide_num": 19,
        "heading": "6. Cloud Computing (AWS)",
        "subheading": "Renting Supercomputers on Demand Instead of Buying Them",
        "visual_path": f_slide19,
        "notes": (
            "Stage 6: Cloud Computing with Amazon Web Services (AWS).\n\n"
            "When you want light in your room, you don't build an electricity generator in your backyard—you plug into the wall "
            "and pay the power company for the kilowatt-hours you consume.\n\n"
            "Cloud computing works the exact same way for computing power. Instead of spending ₹5,00,000 on physical server racks, "
            "cooling rooms, and high-speed fiber cables, companies rent servers on-demand from AWS data centers in Mumbai for a few cents an hour."
        )
    },
    {
        "slide_num": 20,
        "heading": "How Our App Runs in the Cloud",
        "subheading": "Smart Worker + Face Matcher + Digital Register",
        "visual_path": f_slide20,
        "notes": (
            "Here is the cloud team powering our Smart Attendance System:\n"
            "• Amazon EC2: The reliable 24/7 Ubuntu host running our web server.\n"
            "• Amazon Rekognition: The high-speed biometric engine that stores facial vectors in collections and matches faces in <300ms.\n"
            "• Amazon DynamoDB: The lightning-fast digital register that uses atomic conditional locks ('attribute_not_exists') "
            "to prevent students from getting marked twice on the same day.\n"
            "• Amazon S3: The cloud photo vault that safely archives audit snapshots."
        )
    },

    # --- STAGE 7: NETWORKING (2 Slides) ---
    {
        "slide_num": 21,
        "heading": "7. Networking",
        "subheading": "How Computers Talk Across the Internet",
        "visual_path": f_slide21,
        "notes": (
            "Stage 7: Computer Networking. None of these amazing tools would work if computers couldn't communicate with each other.\n\n"
            "Networking is the postal system of the digital world:\n"
            "• An IP Address is like your physical street address.\n"
            "• DNS (Domain Name System) is the internet phonebook that translates numbers like '13.126.255.119' into friendly names.\n"
            "• HTTPS with SSL is a tamper-proof, locked envelope that encrypts data so hackers on public Wi-Fi cannot see "
            "or alter photos in transit."
        )
    },
    {
        "slide_num": 22,
        "heading": "How Data Travels Live",
        "subheading": "Classroom Webcam ↔ AWS Cloud ↔ Live Dashboard",
        "visual_path": f_slide22,
        "notes": (
            "Follow the live data journey on screen:\n"
            "1. Right here in this room, our Logitech USB camera captures a face.\n"
            "2. Within 50 milliseconds, our Python code wraps the face crop into an encrypted HTTPS packet.\n"
            "3. The packet travels out our classroom Wi-Fi, across fiber-optic undersea cables, to the AWS data center in Mumbai.\n"
            "4. Amazon Rekognition identifies the student and DynamoDB records the time (e.g., 10:30 AM IST).\n"
            "5. A green verification badge travels back to our live dashboard and flashes on the screen!\n\n"
            "The entire round-trip across India takes less than 350 milliseconds—faster than a human blink."
        )
    },

    # --- GRAND FINALE (1 Slide) ---
    {
        "slide_num": 23,
        "heading": "The Complete Industry Journey",
        "subheading": "Linux → Python → AI/ML → Docker → Jenkins → Cloud → Network",
        "visual_path": os.path.join(ASSETS_DIR, "slide23_complete_journey_with_kiosk.png"),
        "notes": (
            "And that, students, is the complete journey of how the modern tech industry builds, automates, and runs software!\n\n"
            "Look at the full chain:\n"
            "• Linux is your foundation.\n"
            "• Python turns your ideas into logic.\n"
            "• AI gives your application human-like vision.\n"
            "• Docker packages your code to run anywhere.\n"
            "• Jenkins automates testing and deployment.\n"
            "• AWS provides global supercomputing on demand.\n"
            "• Networking connects everything together across the globe.\n\n"
            "[Closing Encouragement]: As 1st-year students, you don't need to master all 7 tools today. Start with curiosity, "
            "install Ubuntu Linux, write your first 10 lines of Python, and you will have the foundation to build anything you can imagine. "
            "Thank you, and let's open the floor for questions!"
        )
    }
]


# ==============================================================================
# 4. PPTX ASSEMBLY SCRIPT (16:9 Widescreen, Strict Text Rules)
# ==============================================================================

def assemble_presentation():
    # Ensure real project slide assets are freshly built
    subprocess.run([sys.executable, os.path.join(BASE_DIR, "scripts", "build_all_real_deck_assets.py")], check=True)
    print(f"Creating 16:9 widescreen presentation with {len(slides_config)} slides...")
    prs = pptx.Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.500)

    # Blank layout
    blank_layout = prs.slide_layouts[6]

    for item in slides_config:
        slide = prs.slides.add_slide(blank_layout)

        # Set clean warm background
        background = slide.background
        fill = background.fill
        fill.solid()
        fill.fore_color.rgb = RGBColor(247, 247, 245) # Clean studio off-white

        # 1. Header Text Frame (Top of slide: ONLY Heading and Subheading, ZERO body text)
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.733), Inches(1.0))
        tf = title_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        # Heading
        p_head = tf.paragraphs[0]
        p_head.text = item["heading"]
        p_head.font.name = "Georgia"
        p_head.font.size = Pt(30)
        p_head.font.bold = True
        p_head.font.color.rgb = RGBColor(20, 20, 19) # Carbon dark charcoal
        p_head.space_after = Pt(4)

        # Subheading
        p_sub = tf.add_paragraph()
        p_sub.text = item["subheading"]
        p_sub.font.name = "Calibri"
        p_sub.font.size = Pt(15)
        p_sub.font.color.rgb = RGBColor(87, 83, 78) # Muted slate

        # 2. Main Visual Canvas Area (80%+ pure visual space)
        # Bounding box: left=0.8 in, top=1.5 in, max_w=11.733 in, max_h=5.6 in
        img_path = item["visual_path"]
        if os.path.exists(img_path):
            with Image.open(img_path) as im:
                iw, ih = im.size
                aspect = iw / ih

            max_w = Inches(11.733)
            max_h = Inches(5.6)

            if (max_w / max_h) > aspect:
                final_h = max_h
                final_w = final_h * aspect
            else:
                final_w = max_w
                final_h = final_w / aspect

            img_left = Inches(0.8) + (max_w - final_w) / 2
            img_top = Inches(1.5) + (max_h - final_h) / 2

            slide.shapes.add_picture(img_path, img_left, img_top, width=final_w, height=final_h)
            print(f"Slide {item['slide_num']}: Added visual {os.path.basename(img_path)}")

        # 3. Speaker Notes (Hidden from projector, conversational explanation for presenter)
        notes_slide = slide.notes_slide
        text_frame = notes_slide.notes_text_frame
        text_frame.text = item["notes"]

    # Save to both target locations
    prs.save(OUTPUT_PPTX_REPO)
    prs.save(OUTPUT_PPTX_ART)
    print("Successfully built and saved 23-slide presentation!")
    print("Repo:", OUTPUT_PPTX_REPO)
    print("Artifact:", OUTPUT_PPTX_ART)


if __name__ == "__main__":
    assemble_presentation()
