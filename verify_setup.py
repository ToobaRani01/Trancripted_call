#!/usr/bin/env python
"""
Setup verification script for Call Summary application
Checks all requirements and configurations
"""

import os
import sys
from pathlib import Path

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_status(message, status='INFO'):
    """Print colored status message"""
    if status == 'SUCCESS':
        print(f"{GREEN}✓{RESET} {message}")
    elif status == 'ERROR':
        print(f"{RED}✗{RESET} {message}")
    elif status == 'WARNING':
        print(f"{YELLOW}⚠{RESET} {message}")
    else:
        print(f"{BLUE}ℹ{RESET} {message}")

def check_file_exists(filepath):
    """Check if file exists"""
    return os.path.exists(filepath)

def verify_setup():
    """Verify project setup"""
    print(f"\n{BLUE}{'='*50}{RESET}")
    print(f"{BLUE}  Call Summary - Setup Verification{RESET}")
    print(f"{BLUE}{'='*50}{RESET}\n")
    
    project_root = os.path.dirname(os.path.abspath(__file__))
    issues = []
    
    # 1. Check Python version
    print("1. Checking Python version...")
    if sys.version_info >= (3, 8):
        print_status(f"Python {sys.version_info.major}.{sys.version_info.minor} ✓", 'SUCCESS')
    else:
        print_status("Python 3.8+ required", 'ERROR')
        issues.append("Python version is too old")
    
    # 2. Check required files
    print("\n2. Checking project files...")
    required_files = [
        'app.py',
        'config.py',
        'models.py',
        'utils.py',
        'requirements.txt',
        '.env',
        'README.md',
        'static/css/style.css',
        'static/js/main.js',
        'static/js/webrtc.js',
        'tempelates/index.html'  # Note: keeping original folder name
    ]
    
    for file in required_files:
        filepath = os.path.join(project_root, file)
        if check_file_exists(filepath):
            print_status(f"Found: {file}", 'SUCCESS')
        else:
            print_status(f"Missing: {file}", 'ERROR')
            issues.append(f"Missing file: {file}")
    
    # 3. Check dependencies
    print("\n3. Checking installed packages...")
    required_packages = [
        'flask',
        'flask_sqlalchemy',
        'flask_socketio',
        'dotenv'
    ]
    
    try:
        for package in required_packages:
            try:
                __import__(package)
                print_status(f"Installed: {package}", 'SUCCESS')
            except ImportError:
                print_status(f"Missing: {package}", 'WARNING')
                issues.append(f"Missing package: {package}")
    except Exception as e:
        print_status(f"Error checking packages: {e}", 'ERROR')
    
    # 4. Check .env configuration
    print("\n4. Checking environment configuration...")
    env_path = os.path.join(project_root, '.env')
    if check_file_exists(env_path):
        with open(env_path, 'r') as f:
            content = f.read()
            if 'your-secret-key-here' in content:
                print_status("SECRET_KEY is default (change in production)", 'WARNING')
            else:
                print_status("SECRET_KEY configured", 'SUCCESS')
    else:
        print_status(".env file not found", 'ERROR')
        issues.append(".env file not found")
    
    # 5. Check database
    print("\n5. Checking database...")
    db_path = os.path.join(project_root, 'callsummary.db')
    if check_file_exists(db_path):
        print_status("Database exists", 'SUCCESS')
    else:
        print_status("Database will be created on first run", 'INFO')
    
    # Summary
    print(f"\n{BLUE}{'='*50}{RESET}")
    if not issues:
        print_status("✓ All checks passed! Ready to run.", 'SUCCESS')
        print(f"\n{GREEN}Next steps:{RESET}")
        print("1. Ensure SECRET_KEY is set in .env")
        print("2. Run: python app.py")
        print("3. Open: http://localhost:5000")
    else:
        print_status(f"✗ Found {len(issues)} issue(s)", 'ERROR')
        print(f"\n{YELLOW}Issues to fix:{RESET}")
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
        print(f"\n{YELLOW}To fix:{RESET}")
        print("1. Install dependencies: pip install -r requirements.txt")
        print("2. Configure SECRET_KEY in .env")
        print("3. Verify all files are in place")
    print(f"\n{BLUE}{'='*50}{RESET}\n")
    
    return len(issues) == 0

if __name__ == '__main__':
    success = verify_setup()
    sys.exit(0 if success else 1)
