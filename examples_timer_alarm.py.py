# ============================================================================
# File: examples_timer_alarm.py
# Project: Web Image Processing
# Description: Examples using Timer & Alarm features
# ============================================================================

from web_image_processor import WebImageProcessor, AlarmConfig, PageResult
import time


# ============================================================================
# Example 1: Basic Monitoring with Sound Alarm
# ============================================================================

def example_basic_monitoring():
    """Monitor a URL every 5 seconds with sound alarm"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    # Configure alarm - play sound when anything detected
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        popup_enabled=False,
        min_detections=1
    )
    
    url = "https://www.google.com"
    
    print("🔄 Starting monitoring (Press Ctrl+C to stop)")
    print(f"URL: {url}")
    print(f"Interval: 5 seconds\n")
    
    try:
        run_count = 0
        while True:
            run_count += 1
            print(f"[Run #{run_count}] Checking...")
            
            result = processor.process_page(url, confidence=0.5)
            
            if result:
                print(f"✅ Found {result.detection_count} objects")
                if result.detection_count > 0:
                    classes = set(d.class_name for d in result.detections)
                    print(f"   Classes: {', '.join(classes)}")
            
            print(f"⏰ Waiting 5 seconds...\n")
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped")
    finally:
        processor.close()


# ============================================================================
# Example 2: Monitor Specific Objects (e.g., detect persons only)
# ============================================================================

def example_monitor_specific_class():
    """Monitor for specific object class"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    # Alarm only when 'person' is detected
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=1,
        target_classes=['person']  # Only trigger for person
    )
    
    url = "https://www.wikipedia.org"
    
    print("🔍 Monitoring for 'person' detection")
    print(f"URL: {url}\n")
    
    try:
        for i in range(10):  # Run 10 times
            print(f"[Check {i+1}/10]")
            result = processor.process_page(url, confidence=0.5)
            
            if result:
                persons = [d for d in result.detections if d.class_name == 'person']
                if persons:
                    print(f"🚨 ALERT: {len(persons)} person(s) detected!")
                else:
                    print(f"✅ {result.detection_count} objects (no persons)")
            
            time.sleep(3)
            
    finally:
        processor.close()


# ============================================================================
# Example 3: Telegram Notification
# ============================================================================

def example_telegram_notification():
    """Send Telegram message when object detected"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    # Configure Telegram
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=False,
        telegram_enabled=True,
        telegram_token='YOUR_BOT_TOKEN',  # Replace with your token
        telegram_chat_id='YOUR_CHAT_ID',  # Replace with your chat ID
        min_detections=2  # Trigger when 2+ objects detected
    )
    
    url = "https://github.com"
    
    print("📱 Monitoring with Telegram notifications")
    print("Will send message when 2+ objects detected\n")
    
    try:
        for i in range(5):
            print(f"[Check {i+1}/5]")
            result = processor.process_page(url, confidence=0.5)
            
            if result and result.detection_count >= 2:
                print(f"📤 Telegram notification sent: {result.detection_count} objects")
            
            time.sleep(5)
            
    finally:
        processor.close()


# ============================================================================
# Example 4: Custom Callback Function
# ============================================================================

def example_custom_callback():
    """Use custom callback when alarm triggered"""
    
    def my_alarm_handler(result: PageResult):
        """Custom function to handle alarm"""
        print("\n" + "="*60)
        print("🚨 CUSTOM ALARM HANDLER TRIGGERED!")
        print("="*60)
        print(f"URL: {result.url}")
        print(f"Detections: {result.detection_count}")
        print(f"Time: {result.timestamp}")
        
        # Your custom logic here
        # e.g., send email, save to database, etc.
        
        # Save alert to file
        with open('alerts.txt', 'a') as f:
            f.write(f"{result.timestamp} - {result.url} - {result.detection_count} objects\n")
        
        print("✅ Alert logged to alerts.txt")
        print("="*60 + "\n")
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=1,
        callback=my_alarm_handler  # Custom callback
    )
    
    url = "https://www.google.com"
    
    print("🎯 Monitoring with custom callback\n")
    
    try:
        for i in range(5):
            print(f"[Check {i+1}/5]")
            processor.process_page(url, confidence=0.5)
            time.sleep(3)
            
    finally:
        processor.close()


# ============================================================================
# Example 5: Advanced Monitoring with Multiple Conditions
# ============================================================================

def example_advanced_monitoring():
    """Advanced monitoring with multiple conditions"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    # Complex alarm configuration
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        popup_enabled=True,
        telegram_enabled=False,
        min_detections=3,  # At least 3 objects
        target_classes=['person', 'car', 'laptop'],  # Any of these
    )
    
    urls = [
        "https://www.google.com",
        "https://www.wikipedia.org",
        "https://github.com"
    ]
    
    print("🔬 Advanced monitoring configuration:")
    print(f"   Min detections: 3")
    print(f"   Target classes: person, car, laptop")
    print(f"   URLs: {len(urls)}\n")
    
    try:
        cycle = 0
        while cycle < 3:  # 3 cycles
            cycle += 1
            print(f"\n{'='*60}")
            print(f"CYCLE {cycle}/3")
            print(f"{'='*60}\n")
            
            for url in urls:
                print(f"Checking: {url}")
                result = processor.process_page(url, confidence=0.4)
                
                if result:
                    print(f"   Found: {result.detection_count} objects")
                
                time.sleep(2)
            
            print(f"\n⏰ Waiting 10 seconds before next cycle...")
            time.sleep(10)
            
    except KeyboardInterrupt:
        print("\n⏹️ Stopped by user")
    finally:
        processor.close()


# ============================================================================
# Example 6: Email Notification (Advanced)
# ============================================================================

def example_email_notification():
    """Send email when detection occurs"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    # Email configuration
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=False,
        email_enabled=True,
        email_config={
            'smtp_server': 'smtp.gmail.com',
            'smtp_port': 587,
            'from': 'your_email@gmail.com',
            'password': 'your_app_password',  # Use App Password for Gmail
            'to': 'recipient@example.com'
        },
        min_detections=1
    )
    
    url = "https://www.google.com"
    
    print("📧 Monitoring with email notifications\n")
    
    try:
        for i in range(3):
            print(f"[Check {i+1}/3]")
            result = processor.process_page(url, confidence=0.5)
            
            if result and result.detection_count > 0:
                print(f"📤 Email sent: {result.detection_count} objects detected")
            
            time.sleep(5)
            
    finally:
        processor.close()


# ============================================================================
# Example 7: Monitoring with Login
# ============================================================================

def example_monitoring_with_login():
    """Monitor authenticated pages"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=False)
    
    # Login first
    success = processor.login(
        login_url='https://example.com/login',
        username='your_username',
        password='your_password',
        username_selector='input[name="username"]',
        password_selector='input[name="password"]',
        submit_selector='button[type="submit"]'
    )
    
    if not success:
        print("❌ Login failed")
        return
    
    # Configure alarm
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=1
    )
    
    # Monitor dashboard
    dashboard_url = "https://example.com/dashboard"
    
    print(f"🔐 Monitoring authenticated page: {dashboard_url}\n")
    
    try:
        for i in range(5):
            print(f"[Check {i+1}/5]")
            result = processor.process_page(dashboard_url, confidence=0.5)
            
            if result:
                print(f"✅ {result.detection_count} objects")
            
            time.sleep(10)
            
    finally:
        processor.close()


# ============================================================================
# Example 8: Real-time Dashboard Monitoring
# ============================================================================

def example_dashboard_monitoring():
    """Monitor multiple metrics/dashboards"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=1,
        callback=lambda r: print(f"📊 Dashboard update: {r.detection_count} widgets")
    )
    
    dashboards = [
        "https://example.com/dashboard1",
        "https://example.com/dashboard2",
        "https://example.com/dashboard3"
    ]
    
    print("📊 Monitoring multiple dashboards\n")
    
    try:
        iteration = 0
        while True:
            iteration += 1
            print(f"\n[Iteration {iteration}]")
            
            for idx, url in enumerate(dashboards, 1):
                print(f"  Dashboard {idx}...", end=" ")
                result = processor.process_page(url, confidence=0.5)
                print(f"{result.detection_count if result else 0} items")
            
            print("⏰ Next check in 30 seconds")
            time.sleep(30)
            
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped")
    finally:
        processor.close()


# ============================================================================
# Example 9: Conditional Monitoring
# ============================================================================

def example_conditional_monitoring():
    """Monitor only during specific conditions"""
    
    from datetime import datetime
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=2
    )
    
    url = "https://www.google.com"
    
    print("🕐 Conditional monitoring (only between 9 AM - 5 PM)\n")
    
    try:
        while True:
            current_hour = datetime.now().hour
            
            # Only monitor during business hours
            if 9 <= current_hour < 17:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Checking...")
                result = processor.process_page(url, confidence=0.5)
                
                if result:
                    print(f"✅ {result.detection_count} objects")
                
                time.sleep(60)  # Check every minute
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Outside business hours, sleeping...")
                time.sleep(300)  # Sleep 5 minutes
                
    except KeyboardInterrupt:
        print("\n⏹️ Stopped")
    finally:
        processor.close()


# ============================================================================
# Example 10: Smart Monitoring (Adaptive Interval)
# ============================================================================

def example_smart_monitoring():
    """Adaptive monitoring - change interval based on detections"""
    
    processor = WebImageProcessor('yolov8n.pt')
    processor.setup_browser(headless=True)
    
    processor.alarm_config = AlarmConfig(
        enabled=True,
        sound_enabled=True,
        min_detections=1
    )
    
    url = "https://www.google.com"
    base_interval = 10  # Base interval in seconds
    fast_interval = 3   # Fast interval when objects detected
    
    print("🧠 Smart monitoring with adaptive interval\n")
    
    try:
        consecutive_detections = 0
        
        for i in range(20):
            print(f"[Check {i+1}/20]")
            result = processor.process_page(url, confidence=0.5)
            
            if result and result.detection_count > 0:
                consecutive_detections += 1
                interval = fast_interval
                print(f"✅ {result.detection_count} objects - Fast mode")
            else:
                consecutive_detections = 0
                interval = base_interval
                print(f"❌ No objects - Normal mode")
            
            print(f"⏰ Next check in {interval}s\n")
            time.sleep(interval)
            
    finally:
        processor.close()


# ============================================================================
# Main Menu
# ============================================================================

def main():
    """Run examples"""
    
    examples = {
        '1': ('Basic Monitoring', example_basic_monitoring),
        '2': ('Monitor Specific Class', example_monitor_specific_class),
        '3': ('Telegram Notification', example_telegram_notification),
        '4': ('Custom Callback', example_custom_callback),
        '5': ('Advanced Monitoring', example_advanced_monitoring),
        '6': ('Email Notification', example_email_notification),
        '7': ('Monitoring with Login', example_monitoring_with_login),
        '8': ('Dashboard Monitoring', example_dashboard_monitoring),
        '9': ('Conditional Monitoring', example_conditional_monitoring),
        '10': ('Smart Monitoring', example_smart_monitoring),
    }
    
    print("\n" + "="*60)
    print("WEB IMAGE PROCESSING - TIMER & ALARM EXAMPLES")
    print("="*60 + "\n")
    
    for key, (name, _) in examples.items():
        print(f"{key}. {name}")
    
    print("\n0. Exit")
    print("="*60)
    
    choice = input("\nSelect example (1-10): ").strip()
    
    if choice in examples:
        name, func = examples[choice]
        print(f"\n▶️  Running: {name}\n")
        func()
    elif choice == '0':
        print("👋 Goodbye!")
    else:
        print("❌ Invalid choice")


if __name__ == "__main__":
    main()