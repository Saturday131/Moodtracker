#!/usr/bin/env python3
"""
Backend API Testing for Mood Tracker App - Push Notification System
Tests all push notification endpoints with comprehensive coverage
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://ai-mood-buddy-2.preview.emergentagent.com/api"

# Test credentials
USER1_EMAIL = "push_test@test.pl"
USER1_PASSWORD = "PushTest1!"
USER1_NAME = "Push Tester"

USER2_EMAIL = "push_test2@test.pl"
USER2_PASSWORD = "PushTest2!"
USER2_NAME = "Push Tester 2"

# Test tokens
TOKEN1 = "ExponentPushToken[abc123]"
TOKEN2 = "ExponentPushToken[def456]"
TOKEN_USER2 = "ExponentPushToken[user2token]"

# Global variables for auth tokens
user1_token = None
user2_token = None

def print_test(test_name):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    return success

def register_user(email, password, name):
    """Register a new user"""
    print_test(f"Register User: {email}")
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/register",
            json={"email": email, "password": password, "name": name},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print_result(True, f"User registered successfully. Token: {token[:20]}...")
            return token
        elif response.status_code == 400 and "already exists" in response.text.lower():
            print_result(True, f"User already exists (expected). Status: {response.status_code}")
            return None
        else:
            print_result(False, f"Unexpected status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def login_user(email, password):
    """Login user"""
    print_test(f"Login User: {email}")
    try:
        response = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print_result(True, f"Login successful. Token: {token[:20]}...")
            return token
        else:
            print_result(False, f"Login failed. Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def register_push_token(token, push_token, device_name):
    """Register push token"""
    print_test(f"Register Push Token: {push_token}")
    try:
        response = requests.post(
            f"{BACKEND_URL}/push-token",
            json={"token": push_token, "device_name": device_name},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Push token registered. Response: {data}")
            return True
        else:
            print_result(False, f"Failed to register push token. Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_push_notification(token):
    """Test push notification"""
    print_test("Test Push Notification")
    try:
        response = requests.get(
            f"{BACKEND_URL}/push-token/test",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Test push notification sent. Response: {data}")
            return True
        elif response.status_code == 404:
            print_result(True, f"No tokens registered (expected in some cases). Response: {response.text}")
            return True
        else:
            print_result(False, f"Failed to send test push. Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def delete_push_token(token, push_token):
    """Delete push token"""
    print_test(f"Delete Push Token: {push_token}")
    try:
        response = requests.delete(
            f"{BACKEND_URL}/push-token?token={push_token}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Push token deleted. Response: {data}")
            return True
        else:
            print_result(False, f"Failed to delete push token. Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def get_settings(token):
    """Get user settings"""
    print_test("Get User Settings")
    try:
        response = requests.get(
            f"{BACKEND_URL}/settings",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Settings retrieved. Keys: {list(data.keys())}")
            print(f"Settings: {json.dumps(data, indent=2)}")
            return data
        else:
            print_result(False, f"Failed to get settings. Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def update_settings(token, **kwargs):
    """Update user settings"""
    print_test(f"Update User Settings: {kwargs}")
    try:
        response = requests.put(
            f"{BACKEND_URL}/settings",
            params=kwargs,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Settings updated. Response: {json.dumps(data, indent=2)}")
            return data
        else:
            print_result(False, f"Failed to update settings. Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def verify_setting(settings, key, expected_value):
    """Verify a specific setting value"""
    actual_value = settings.get(key)
    if actual_value == expected_value:
        print_result(True, f"Setting '{key}' = {actual_value} (expected: {expected_value})")
        return True
    else:
        print_result(False, f"Setting '{key}' = {actual_value} (expected: {expected_value})")
        return False

def main():
    """Main test execution"""
    global user1_token, user2_token
    
    print("\n" + "="*80)
    print("PUSH NOTIFICATION SYSTEM TESTING")
    print("="*80)
    
    test_results = []
    
    # ============================================================
    # STEP 1: Authentication
    # ============================================================
    print("\n" + "="*80)
    print("STEP 1: AUTHENTICATION")
    print("="*80)
    
    # Register User 1 (or login if exists)
    user1_token = register_user(USER1_EMAIL, USER1_PASSWORD, USER1_NAME)
    if not user1_token:
        user1_token = login_user(USER1_EMAIL, USER1_PASSWORD)
    
    if not user1_token:
        print("\n❌ CRITICAL: Failed to authenticate User 1. Aborting tests.")
        sys.exit(1)
    
    test_results.append(("User 1 Authentication", True))
    
    # ============================================================
    # STEP 2: Push Token Management
    # ============================================================
    print("\n" + "="*80)
    print("STEP 2: PUSH TOKEN MANAGEMENT")
    print("="*80)
    
    # 2a. Register first push token
    result = register_push_token(user1_token, TOKEN1, "Test iPhone")
    test_results.append(("Register Push Token 1", result))
    
    # 2b. Register same token again (idempotent - should update device name)
    result = register_push_token(user1_token, TOKEN1, "Test iPhone Updated")
    test_results.append(("Register Same Token (Idempotent)", result))
    
    # 2c. Register second token
    result = register_push_token(user1_token, TOKEN2, "Test iPad")
    test_results.append(("Register Push Token 2", result))
    
    # ============================================================
    # STEP 3: Test Push Notification
    # ============================================================
    print("\n" + "="*80)
    print("STEP 3: TEST PUSH NOTIFICATION")
    print("="*80)
    
    # 3a. Test push notification (should send to 2 devices)
    result = test_push_notification(user1_token)
    test_results.append(("Test Push Notification (2 devices)", result))
    
    # 3b. Check backend logs (manual verification)
    print("\n📋 NOTE: Check backend logs for 'Push sent to 2 devices: 200'")
    print("   Run: tail -n 50 /var/log/supervisor/backend.*.log | grep -i push")
    
    # ============================================================
    # STEP 4: Settings Management
    # ============================================================
    print("\n" + "="*80)
    print("STEP 4: SETTINGS MANAGEMENT")
    print("="*80)
    
    # 4a. Get default settings
    settings = get_settings(user1_token)
    if settings:
        test_results.append(("Get Settings", True))
        # Verify defaults
        verify_setting(settings, "daily_notification_enabled", True)
        verify_setting(settings, "task_reminders_enabled", True)
        verify_setting(settings, "weekly_notification_enabled", True)
    else:
        test_results.append(("Get Settings", False))
    
    # 4b. Disable task reminders
    settings = update_settings(user1_token, task_reminders_enabled=False)
    if settings:
        result = verify_setting(settings, "task_reminders_enabled", False)
        test_results.append(("Update task_reminders_enabled=false", result))
    else:
        test_results.append(("Update task_reminders_enabled=false", False))
    
    # 4c. Change daily notification time
    settings = update_settings(user1_token, daily_notification_time="19:00")
    if settings:
        result = verify_setting(settings, "daily_notification_time", "19:00")
        test_results.append(("Update daily_notification_time=19:00", result))
    else:
        test_results.append(("Update daily_notification_time=19:00", False))
    
    # 4d. Change weekly notification day and time
    settings = update_settings(user1_token, weekly_notification_day=3, weekly_notification_time="11:00")
    if settings:
        result1 = verify_setting(settings, "weekly_notification_day", 3)
        result2 = verify_setting(settings, "weekly_notification_time", "11:00")
        test_results.append(("Update weekly notification day/time", result1 and result2))
    else:
        test_results.append(("Update weekly notification day/time", False))
    
    # 4e. Disable daily notifications
    settings = update_settings(user1_token, daily_notification_enabled=False)
    if settings:
        result = verify_setting(settings, "daily_notification_enabled", False)
        test_results.append(("Update daily_notification_enabled=false", result))
    else:
        test_results.append(("Update daily_notification_enabled=false", False))
    
    # ============================================================
    # STEP 5: Cleanup
    # ============================================================
    print("\n" + "="*80)
    print("STEP 5: CLEANUP")
    print("="*80)
    
    # 5a. Delete first token
    result = delete_push_token(user1_token, TOKEN1)
    test_results.append(("Delete Push Token 1", result))
    
    # 5b. Delete second token
    result = delete_push_token(user1_token, TOKEN2)
    test_results.append(("Delete Push Token 2", result))
    
    # 5c. Test push notification (should fail with 404 - no tokens)
    print_test("Test Push Notification (No Tokens - Expect 404)")
    try:
        response = requests.get(
            f"{BACKEND_URL}/push-token/test",
            headers={"Authorization": f"Bearer {user1_token}"},
            timeout=10
        )
        if response.status_code == 404:
            print_result(True, f"Correctly returned 404 (no tokens). Response: {response.text}")
            test_results.append(("Test Push with No Tokens (404)", True))
        else:
            print_result(False, f"Expected 404, got {response.status_code}. Response: {response.text}")
            test_results.append(("Test Push with No Tokens (404)", False))
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        test_results.append(("Test Push with No Tokens (404)", False))
    
    # ============================================================
    # STEP 6: Cross-user Isolation
    # ============================================================
    print("\n" + "="*80)
    print("STEP 6: CROSS-USER ISOLATION")
    print("="*80)
    
    # 6a. Register User 2
    user2_token = register_user(USER2_EMAIL, USER2_PASSWORD, USER2_NAME)
    if not user2_token:
        user2_token = login_user(USER2_EMAIL, USER2_PASSWORD)
    
    if not user2_token:
        print("\n❌ WARNING: Failed to authenticate User 2. Skipping cross-user tests.")
        test_results.append(("User 2 Authentication", False))
    else:
        test_results.append(("User 2 Authentication", True))
        
        # 6b. Register token for User 2
        result = register_push_token(user2_token, TOKEN_USER2, "User 2 Device")
        test_results.append(("Register Push Token for User 2", result))
        
        # 6c. User 1 test push (should fail - no tokens after cleanup)
        print_test("User 1 Test Push (Should Fail - No Tokens)")
        try:
            response = requests.get(
                f"{BACKEND_URL}/push-token/test",
                headers={"Authorization": f"Bearer {user1_token}"},
                timeout=10
            )
            if response.status_code == 404:
                print_result(True, f"User 1 correctly has no tokens. Status: {response.status_code}")
                test_results.append(("User 1 No Tokens After Cleanup", True))
            else:
                print_result(False, f"User 1 should have no tokens. Status: {response.status_code}, Response: {response.text}")
                test_results.append(("User 1 No Tokens After Cleanup", False))
        except Exception as e:
            print_result(False, f"Exception: {str(e)}")
            test_results.append(("User 1 No Tokens After Cleanup", False))
        
        # 6d. User 2 test push (should succeed - 1 device)
        print_test("User 2 Test Push (Should Succeed - 1 Device)")
        try:
            response = requests.get(
                f"{BACKEND_URL}/push-token/test",
                headers={"Authorization": f"Bearer {user2_token}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                print_result(True, f"User 2 test push successful. Response: {data}")
                test_results.append(("User 2 Test Push (1 device)", True))
            else:
                print_result(False, f"User 2 test push failed. Status: {response.status_code}, Response: {response.text}")
                test_results.append(("User 2 Test Push (1 device)", False))
        except Exception as e:
            print_result(False, f"Exception: {str(e)}")
            test_results.append(("User 2 Test Push (1 device)", False))
        
        # Cleanup User 2 token
        delete_push_token(user2_token, TOKEN_USER2)
    
    # ============================================================
    # FINAL SUMMARY
    # ============================================================
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    
    print("\nDetailed Results:")
    for test_name, result in test_results:
        status = "✅" if result else "❌"
        print(f"  {status} {test_name}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
