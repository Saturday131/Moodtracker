#!/usr/bin/env python3
"""
Backend API Testing Script for Expo Mood Tracker App
Tests task scheduling feature endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://ai-mood-buddy-2.preview.emergentagent.com/api"
TEST_USER = {
    "email": "backend_test@test.pl",
    "password": "Test1234!",
    "name": "Backend Test"
}

# Global variables
auth_token = None
test_task_id = None
recurring_daily_task_id = None
recurring_custom_task_id = None

def print_test(test_name):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(success, message, response=None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if response:
        print(f"Response: {json.dumps(response, indent=2, ensure_ascii=False)}")
    return success

def test_register():
    """Test 1: Register a new user"""
    global auth_token
    print_test("User Registration - POST /api/auth/register")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json=TEST_USER,
            timeout=10
        )
        
        if response.status_code == 400 and "już zarejestrowany" in response.text:
            print("ℹ️  User already exists, will try login instead")
            return test_login()
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                auth_token = data["token"]
                return print_result(True, f"User registered successfully: {data['user']['email']}", data)
            else:
                return print_result(False, "Missing token or user in response", data)
        else:
            return print_result(False, f"Registration failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception during registration: {str(e)}")

def test_login():
    """Test 2: Login existing user"""
    global auth_token
    print_test("User Login - POST /api/auth/login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": TEST_USER["email"], "password": TEST_USER["password"]},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                auth_token = data["token"]
                return print_result(True, f"User logged in successfully: {data['user']['email']}", data)
            else:
                return print_result(False, "Missing token or user in response", data)
        else:
            return print_result(False, f"Login failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception during login: {str(e)}")

def get_headers():
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }

def test_create_scheduled_task():
    """Test 3: Create a task with scheduled date and time"""
    global test_task_id
    print_test("Create Scheduled Task - POST /api/notes")
    
    task_data = {
        "title": "Wizyta u lekarza",
        "text_content": "Dentist appointment",
        "category": "zadania",
        "scheduled_date": "2026-05-20",
        "scheduled_time": "09:30",
        "is_recurring": False
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=task_data,
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            test_task_id = data.get("id")
            
            # Verify required fields
            checks = [
                ("id" in data, "Has ID"),
                (data.get("scheduled_date") == "2026-05-20", "Scheduled date is 2026-05-20"),
                (data.get("scheduled_time") == "09:30", "Scheduled time is 09:30"),
                (data.get("category") == "zadania", "Category is zadania"),
                (data.get("title") == "Wizyta u lekarza", "Title matches"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"Task created successfully with all fields\n{details}", data)
            else:
                return print_result(False, f"Task created but some fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_recurring_daily_task():
    """Test 4: Create a recurring daily task"""
    global recurring_daily_task_id
    print_test("Create Recurring Daily Task - POST /api/notes")
    
    task_data = {
        "title": "Weź leki",
        "text_content": "Codzienne leki",
        "category": "zadania",
        "is_recurring": True,
        "recurrence_pattern": "daily",
        "scheduled_time": "08:00"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=task_data,
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            recurring_daily_task_id = data.get("id")
            
            checks = [
                ("id" in data, "Has ID"),
                (data.get("is_recurring") == True, "is_recurring is True"),
                (data.get("recurrence_pattern") == "daily", "recurrence_pattern is daily"),
                (data.get("scheduled_time") == "08:00", "scheduled_time is 08:00"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"Recurring daily task created successfully\n{details}", data)
            else:
                return print_result(False, f"Task created but some fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_recurring_custom_task():
    """Test 5: Create a custom recurring task"""
    global recurring_custom_task_id
    print_test("Create Custom Recurring Task - POST /api/notes")
    
    task_data = {
        "title": "Trening",
        "text_content": "Siłownia",
        "category": "zadania",
        "is_recurring": True,
        "recurrence_pattern": "custom",
        "recurrence_days": [0, 2, 4],  # Monday, Wednesday, Friday
        "scheduled_time": "17:00",
        "recurrence_end_date": "2026-06-30"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=task_data,
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            recurring_custom_task_id = data.get("id")
            
            checks = [
                ("id" in data, "Has ID"),
                (data.get("is_recurring") == True, "is_recurring is True"),
                (data.get("recurrence_pattern") == "custom", "recurrence_pattern is custom"),
                (data.get("recurrence_days") == [0, 2, 4], "recurrence_days is [0,2,4]"),
                (data.get("scheduled_time") == "17:00", "scheduled_time is 17:00"),
                (data.get("recurrence_end_date") == "2026-06-30", "recurrence_end_date is 2026-06-30"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"Custom recurring task created successfully\n{details}", data)
            else:
                return print_result(False, f"Task created but some fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_tasks_for_date():
    """Test 6: Get tasks for specific date"""
    print_test("Get Tasks for Date - GET /api/tasks/for-date/2026-05-20")
    
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/for-date/2026-05-20",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check if "Wizyta u lekarza" task appears
            found_task = False
            for task in data:
                if task.get("title") == "Wizyta u lekarza":
                    found_task = True
                    break
            
            if found_task:
                return print_result(True, f"Found 'Wizyta u lekarza' task in results. Total tasks: {len(data)}", {"total_tasks": len(data), "task_found": True})
            else:
                return print_result(False, f"'Wizyta u lekarza' task not found. Total tasks: {len(data)}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_notes_library():
    """Test 7: Get notes library"""
    print_test("Get Notes Library - GET /api/notes/library?period=all&category=zadania")
    
    try:
        response = requests.get(
            f"{BASE_URL}/notes/library?period=all&category=zadania",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            checks = [
                ("total" in data, "Has total count"),
                ("notes" in data, "Has notes array"),
                ("all_tags" in data, "Has all_tags"),
                (len(data.get("notes", [])) >= 3, "Has at least 3 tasks (our created tasks)"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            summary = {
                "total": data.get("total"),
                "notes_count": len(data.get("notes", [])),
                "tags_count": len(data.get("all_tags", []))
            }
            
            if all_passed:
                return print_result(True, f"Notes library retrieved successfully\n{details}", summary)
            else:
                return print_result(False, f"Notes library incomplete\n{details}", summary)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_complete_task():
    """Test 8: Complete a task"""
    print_test(f"Complete Task - PUT /api/tasks/{test_task_id}/complete")
    
    if not test_task_id:
        return print_result(False, "No test_task_id available (previous test may have failed)")
    
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{test_task_id}/complete",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            checks = [
                (data.get("is_completed") == True, "is_completed is True"),
                (data.get("completed_at") is not None, "completed_at is set"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"Task completed successfully\n{details}", {"is_completed": data.get("is_completed"), "completed_at": data.get("completed_at")})
            else:
                return print_result(False, f"Task completion incomplete\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_uncomplete_task():
    """Test 9: Uncomplete a task"""
    print_test(f"Uncomplete Task - PUT /api/tasks/{test_task_id}/uncomplete")
    
    if not test_task_id:
        return print_result(False, "No test_task_id available (previous test may have failed)")
    
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{test_task_id}/uncomplete",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            checks = [
                (data.get("is_completed") == False, "is_completed is False"),
                (data.get("completed_at") is None, "completed_at is None"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"Task uncompleted successfully\n{details}", {"is_completed": data.get("is_completed"), "completed_at": data.get("completed_at")})
            else:
                return print_result(False, f"Task uncompletion incomplete\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_delete_task():
    """Test 10: Delete a task"""
    print_test(f"Delete Task - DELETE /api/notes/{test_task_id}")
    
    if not test_task_id:
        return print_result(False, "No test_task_id available (previous test may have failed)")
    
    try:
        response = requests.delete(
            f"{BASE_URL}/notes/{test_task_id}",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "message" in data:
                return print_result(True, f"Task deleted successfully: {data['message']}", data)
            else:
                return print_result(True, "Task deleted successfully", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_semantic_search():
    """Test 11: Semantic search"""
    print_test("Semantic Search - GET /api/notes/search?q=siłownia")
    
    try:
        response = requests.get(
            f"{BASE_URL}/notes/search?q=siłownia",
            headers=get_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check if results contain the training note
            found_training = False
            results = data.get("results", [])
            
            for result in results:
                if "Trening" in result.get("title", "") or "Siłownia" in result.get("text_content", ""):
                    found_training = True
                    break
            
            if found_training:
                return print_result(True, f"Semantic search found training note. Total results: {len(results)}", {"results_count": len(results), "training_found": True})
            else:
                return print_result(False, f"Training note not found in search results. Total results: {len(results)}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("EXPO MOOD TRACKER - BACKEND API TESTING")
    print("Task Scheduling Feature")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test User: {TEST_USER['email']}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    results = []
    
    # Authentication tests
    results.append(("User Registration/Login", test_register()))
    
    if not auth_token:
        print("\n❌ CRITICAL: Authentication failed. Cannot proceed with other tests.")
        sys.exit(1)
    
    # Task creation tests
    results.append(("Create Scheduled Task", test_create_scheduled_task()))
    results.append(("Create Recurring Daily Task", test_create_recurring_daily_task()))
    results.append(("Create Custom Recurring Task", test_create_recurring_custom_task()))
    
    # Task retrieval tests
    results.append(("Get Tasks for Date", test_get_tasks_for_date()))
    results.append(("Get Notes Library", test_get_notes_library()))
    
    # Task operations tests
    results.append(("Complete Task", test_complete_task()))
    results.append(("Uncomplete Task", test_uncomplete_task()))
    results.append(("Delete Task", test_delete_task()))
    
    # Search test
    results.append(("Semantic Search", test_semantic_search()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print(f"{'='*80}\n")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
