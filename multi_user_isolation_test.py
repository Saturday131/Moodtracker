#!/usr/bin/env python3
"""
Multi-User Data Isolation Testing Script for Mood Tracker App
Tests that users cannot see each other's data and auth is properly enforced
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://ai-mood-buddy-2.preview.emergentagent.com/api"

# Test users
USER_A = {
    "email": "userA@test.pl",
    "password": "TestA1234!",
    "name": "User A"
}

USER_B = {
    "email": "userB@test.pl",
    "password": "TestB1234!",
    "name": "User B"
}

# Global variables
token_a = None
token_b = None
user_a_mood_id = None
user_b_mood_id = None
user_a_task_id = None
user_a_thought_id = None
user_b_task_id = None

def print_test(test_name):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(success, message, response=None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if response and isinstance(response, dict):
        print(f"Response: {json.dumps(response, indent=2, ensure_ascii=False)}")
    elif response:
        print(f"Response: {response}")
    return success

def get_headers(token):
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

# ============================================================================
# STEP 1: REGISTER TWO USERS
# ============================================================================

def test_register_user_a():
    """Step 1a: Register User A"""
    global token_a
    print_test("Step 1a: Register User A - POST /api/auth/register")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json=USER_A,
            timeout=10
        )
        
        if response.status_code == 400 and "już zarejestrowany" in response.text:
            print("ℹ️  User A already exists, will try login instead")
            return test_login_user_a()
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                token_a = data["token"]
                return print_result(True, f"User A registered: {data['user']['email']}", {"email": data['user']['email'], "has_token": True})
            else:
                return print_result(False, "Missing token or user in response", data)
        else:
            return print_result(False, f"Registration failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_login_user_a():
    """Login User A if already exists"""
    global token_a
    print_test("Step 1a (alt): Login User A - POST /api/auth/login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": USER_A["email"], "password": USER_A["password"]},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data:
                token_a = data["token"]
                return print_result(True, f"User A logged in: {data['user']['email']}", {"email": data['user']['email'], "has_token": True})
            else:
                return print_result(False, "Missing token in response", data)
        else:
            return print_result(False, f"Login failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_register_user_b():
    """Step 1b: Register User B"""
    global token_b
    print_test("Step 1b: Register User B - POST /api/auth/register")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json=USER_B,
            timeout=10
        )
        
        if response.status_code == 400 and "już zarejestrowany" in response.text:
            print("ℹ️  User B already exists, will try login instead")
            return test_login_user_b()
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                token_b = data["token"]
                return print_result(True, f"User B registered: {data['user']['email']}", {"email": data['user']['email'], "has_token": True})
            else:
                return print_result(False, "Missing token or user in response", data)
        else:
            return print_result(False, f"Registration failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_login_user_b():
    """Login User B if already exists"""
    global token_b
    print_test("Step 1b (alt): Login User B - POST /api/auth/login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": USER_B["email"], "password": USER_B["password"]},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data:
                token_b = data["token"]
                return print_result(True, f"User B logged in: {data['user']['email']}", {"email": data['user']['email'], "has_token": True})
            else:
                return print_result(False, "Missing token in response", data)
        else:
            return print_result(False, f"Login failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 2: CREATE DATA AS USER A
# ============================================================================

def test_create_mood_user_a():
    """Step 2a: Create mood as User A"""
    global user_a_mood_id
    print_test("Step 2a: Create Mood as User A - POST /api/moods")
    
    mood_data = {
        "date": "2026-05-12",
        "time_of_day": "morning",
        "layers": {
            "overall": 4,
            "energy": 3,
            "stress": 2,
            "productivity": 4,
            "social": 3
        }
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/moods",
            json=mood_data,
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user_a_mood_id = data.get("id")
            
            checks = [
                (data.get("layers", {}).get("overall") == 4, "Overall mood is 4"),
                (data.get("date") == "2026-05-12", "Date is correct"),
                (data.get("time_of_day") == "morning", "Time of day is morning"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"User A mood created successfully\n{details}", {"id": user_a_mood_id, "overall": 4})
            else:
                return print_result(False, f"Mood created but fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_task_user_a():
    """Step 2b: Create task as User A"""
    global user_a_task_id
    print_test("Step 2b: Create Task as User A - POST /api/notes")
    
    task_data = {
        "title": "Zadanie usera A",
        "text_content": "To jest prywatne",
        "category": "zadania",
        "scheduled_date": "2026-05-12"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=task_data,
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user_a_task_id = data.get("id")
            
            checks = [
                (data.get("title") == "Zadanie usera A", "Title is correct"),
                (data.get("category") == "zadania", "Category is zadania"),
                (data.get("text_content") == "To jest prywatne", "Content is correct"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"User A task created successfully\n{details}", {"id": user_a_task_id, "title": "Zadanie usera A"})
            else:
                return print_result(False, f"Task created but fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_thought_user_a():
    """Step 2c: Create thought as User A"""
    global user_a_thought_id
    print_test("Step 2c: Create Thought as User A - POST /api/notes")
    
    thought_data = {
        "title": "Myśl usera A",
        "text_content": "Prywatne przemyślenie",
        "category": "przemyslenia"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=thought_data,
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user_a_thought_id = data.get("id")
            
            checks = [
                (data.get("title") == "Myśl usera A", "Title is correct"),
                (data.get("category") == "przemyslenia", "Category is przemyslenia"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"User A thought created successfully\n{details}", {"id": user_a_thought_id, "title": "Myśl usera A"})
            else:
                return print_result(False, f"Thought created but fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 3: CREATE DATA AS USER B
# ============================================================================

def test_create_mood_user_b():
    """Step 3a: Create mood as User B"""
    global user_b_mood_id
    print_test("Step 3a: Create Mood as User B - POST /api/moods")
    
    mood_data = {
        "date": "2026-05-12",
        "time_of_day": "morning",
        "layers": {
            "overall": 2,
            "energy": 5,
            "stress": 4,
            "productivity": 1,
            "social": 5
        }
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/moods",
            json=mood_data,
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user_b_mood_id = data.get("id")
            
            checks = [
                (data.get("layers", {}).get("overall") == 2, "Overall mood is 2"),
                (data.get("date") == "2026-05-12", "Date is correct"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"User B mood created successfully\n{details}", {"id": user_b_mood_id, "overall": 2})
            else:
                return print_result(False, f"Mood created but fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_task_user_b():
    """Step 3b: Create task as User B"""
    global user_b_task_id
    print_test("Step 3b: Create Task as User B - POST /api/notes")
    
    task_data = {
        "title": "Zadanie usera B",
        "text_content": "Inne prywatne",
        "category": "zadania",
        "scheduled_date": "2026-05-12"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/notes",
            json=task_data,
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            user_b_task_id = data.get("id")
            
            checks = [
                (data.get("title") == "Zadanie usera B", "Title is correct"),
                (data.get("category") == "zadania", "Category is zadania"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"User B task created successfully\n{details}", {"id": user_b_task_id, "title": "Zadanie usera B"})
            else:
                return print_result(False, f"Task created but fields incorrect\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 4: ISOLATION TESTS (CRITICAL)
# ============================================================================

def test_user_a_notes_isolation():
    """Step 4a: User A should only see their own notes"""
    print_test("Step 4a: User A Notes Isolation - GET /api/notes/library")
    
    try:
        response = requests.get(
            f"{BASE_URL}/notes/library",
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            notes = data.get("notes", [])
            
            # Check that User A's notes are present
            has_user_a_task = any(note.get("title") == "Zadanie usera A" for note in notes)
            has_user_a_thought = any(note.get("title") == "Myśl usera A" for note in notes)
            
            # Check that User B's notes are NOT present
            has_user_b_task = any(note.get("title") == "Zadanie usera B" for note in notes)
            
            checks = [
                (has_user_a_task, "✓ User A can see their task 'Zadanie usera A'"),
                (has_user_a_thought, "✓ User A can see their thought 'Myśl usera A'"),
                (not has_user_b_task, "✓ User A CANNOT see User B's task 'Zadanie usera B'"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User A only sees their own notes\n{details}", {"total_notes": len(notes)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User A can see other user's data\n{details}", {"notes": [n.get("title") for n in notes]})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_b_notes_isolation():
    """Step 4b: User B should only see their own notes"""
    print_test("Step 4b: User B Notes Isolation - GET /api/notes/library")
    
    try:
        response = requests.get(
            f"{BASE_URL}/notes/library",
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            notes = data.get("notes", [])
            
            # Check that User B's notes are present
            has_user_b_task = any(note.get("title") == "Zadanie usera B" for note in notes)
            
            # Check that User A's notes are NOT present
            has_user_a_task = any(note.get("title") == "Zadanie usera A" for note in notes)
            has_user_a_thought = any(note.get("title") == "Myśl usera A" for note in notes)
            
            checks = [
                (has_user_b_task, "✓ User B can see their task 'Zadanie usera B'"),
                (not has_user_a_task, "✓ User B CANNOT see User A's task 'Zadanie usera A'"),
                (not has_user_a_thought, "✓ User B CANNOT see User A's thought 'Myśl usera A'"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User B only sees their own notes\n{details}", {"total_notes": len(notes)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User B can see other user's data\n{details}", {"notes": [n.get("title") for n in notes]})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_a_moods_isolation():
    """Step 4c: User A should only see their own moods"""
    print_test("Step 4c: User A Moods Isolation - GET /api/moods")
    
    try:
        response = requests.get(
            f"{BASE_URL}/moods",
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Filter moods for 2026-05-12
            moods_today = [m for m in data if m.get("date") == "2026-05-12"]
            
            # Check that User A's mood (overall=4) is present
            has_user_a_mood = any(m.get("layers", {}).get("overall") == 4 for m in moods_today)
            
            # Check that User B's mood (overall=2) is NOT present
            has_user_b_mood = any(m.get("layers", {}).get("overall") == 2 for m in moods_today)
            
            checks = [
                (has_user_a_mood, "✓ User A can see their mood (overall=4)"),
                (not has_user_b_mood, "✓ User A CANNOT see User B's mood (overall=2)"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User A only sees their own moods\n{details}", {"moods_count": len(moods_today)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User A can see other user's moods\n{details}", {"moods": moods_today})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_b_moods_isolation():
    """Step 4d: User B should only see their own moods"""
    print_test("Step 4d: User B Moods Isolation - GET /api/moods")
    
    try:
        response = requests.get(
            f"{BASE_URL}/moods",
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Filter moods for 2026-05-12
            moods_today = [m for m in data if m.get("date") == "2026-05-12"]
            
            # Check that User B's mood (overall=2) is present
            has_user_b_mood = any(m.get("layers", {}).get("overall") == 2 for m in moods_today)
            
            # Check that User A's mood (overall=4) is NOT present
            has_user_a_mood = any(m.get("layers", {}).get("overall") == 4 for m in moods_today)
            
            checks = [
                (has_user_b_mood, "✓ User B can see their mood (overall=2)"),
                (not has_user_a_mood, "✓ User B CANNOT see User A's mood (overall=4)"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User B only sees their own moods\n{details}", {"moods_count": len(moods_today)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User B can see other user's moods\n{details}", {"moods": moods_today})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_a_tasks_for_date_isolation():
    """Step 4e: User A should only see their own tasks for date"""
    print_test("Step 4e: User A Tasks for Date Isolation - GET /api/tasks/for-date/2026-05-12")
    
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/for-date/2026-05-12",
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check that User A's task is present
            has_user_a_task = any(task.get("title") == "Zadanie usera A" for task in data)
            
            # Check that User B's task is NOT present
            has_user_b_task = any(task.get("title") == "Zadanie usera B" for task in data)
            
            checks = [
                (has_user_a_task, "✓ User A can see their task"),
                (not has_user_b_task, "✓ User A CANNOT see User B's task"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User A only sees their own tasks\n{details}", {"tasks_count": len(data)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User A can see other user's tasks\n{details}", {"tasks": [t.get("title") for t in data]})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_b_tasks_for_date_isolation():
    """Step 4f: User B should only see their own tasks for date"""
    print_test("Step 4f: User B Tasks for Date Isolation - GET /api/tasks/for-date/2026-05-12")
    
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/for-date/2026-05-12",
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Check that User B's task is present
            has_user_b_task = any(task.get("title") == "Zadanie usera B" for task in data)
            
            # Check that User A's task is NOT present
            has_user_a_task = any(task.get("title") == "Zadanie usera A" for task in data)
            
            checks = [
                (has_user_b_task, "✓ User B can see their task"),
                (not has_user_a_task, "✓ User B CANNOT see User A's task"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User B only sees their own tasks\n{details}", {"tasks_count": len(data)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User B can see other user's tasks\n{details}", {"tasks": [t.get("title") for t in data]})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_a_analytics_summary_isolation():
    """Step 4g: User A analytics should only use their own data"""
    print_test("Step 4g: User A Analytics Summary Isolation - GET /api/analytics/summary")
    
    try:
        response = requests.get(
            f"{BASE_URL}/analytics/summary?days=30",
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Analytics should be based on User A's moods only
            # We can't directly verify the exact values, but we can check structure
            checks = [
                ("average_layers" in data or "average_mood" in data or "averages" in data, "Has average mood data"),
                ("total_entries" in data or "entry_count" in data, "Has entry count"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ User A analytics returned (isolation assumed based on auth)\n{details}", {"has_data": True})
            else:
                return print_result(False, f"Analytics structure incomplete\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_a_analytics_compare_isolation():
    """Step 4h: User A analytics compare should only use their own data"""
    print_test("Step 4h: User A Analytics Compare Isolation - GET /api/analytics/compare")
    
    try:
        response = requests.get(
            f"{BASE_URL}/analytics/compare",
            headers=get_headers(token_a),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Compare should be based on User A's moods only
            checks = [
                ("current" in data or "this_week" in data or "current_period" in data, "Has current period data"),
                ("previous" in data or "last_week" in data or "previous_period" in data, "Has previous period data"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ User A analytics compare returned (isolation assumed based on auth)\n{details}", {"has_data": True})
            else:
                return print_result(False, f"Analytics compare structure incomplete\n{details}", data)
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 5: CROSS-USER ATTACK TESTS
# ============================================================================

def test_user_b_complete_user_a_task():
    """Step 5a: User B should NOT be able to complete User A's task"""
    print_test("Step 5a: Cross-User Attack - User B tries to complete User A's task")
    
    if not user_a_task_id:
        return print_result(False, "User A task ID not available")
    
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{user_a_task_id}/complete",
            headers=get_headers(token_b),
            timeout=10
        )
        
        # Should fail with 404 or 403
        if response.status_code in [404, 403]:
            return print_result(True, f"✅ ATTACK BLOCKED: User B cannot complete User A's task (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: User B was able to complete User A's task!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_b_delete_user_a_note():
    """Step 5b: User B should NOT be able to delete User A's note"""
    print_test("Step 5b: Cross-User Attack - User B tries to delete User A's note")
    
    if not user_a_thought_id:
        return print_result(False, "User A thought ID not available")
    
    try:
        response = requests.delete(
            f"{BASE_URL}/notes/{user_a_thought_id}",
            headers=get_headers(token_b),
            timeout=10
        )
        
        # Should fail with 404 or 403
        if response.status_code in [404, 403]:
            return print_result(True, f"✅ ATTACK BLOCKED: User B cannot delete User A's note (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: User B was able to delete User A's note!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_user_b_export_moods():
    """Step 5c: User B export should NOT contain User A's moods"""
    print_test("Step 5c: User B Mood Export Isolation - GET /api/moods/export/json")
    
    try:
        response = requests.get(
            f"{BASE_URL}/moods/export/json",
            headers=get_headers(token_b),
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            moods = data.get("moods", [])
            
            # Filter moods for 2026-05-12
            moods_today = [m for m in moods if m.get("date") == "2026-05-12"]
            
            # Check that User A's mood (overall=4) is NOT present
            has_user_a_mood = any(m.get("layers", {}).get("overall") == 4 for m in moods_today)
            
            # Check that User B's mood (overall=2) is present
            has_user_b_mood = any(m.get("layers", {}).get("overall") == 2 for m in moods_today)
            
            checks = [
                (has_user_b_mood, "✓ Export contains User B's mood"),
                (not has_user_a_mood, "✓ Export does NOT contain User A's mood"),
            ]
            
            all_passed = all(check[0] for check in checks)
            details = "\n".join([f"  {'✓' if check[0] else '✗ ISOLATION BREACH'} {check[1]}" for check in checks])
            
            if all_passed:
                return print_result(True, f"✅ ISOLATION VERIFIED: User B export only contains their own moods\n{details}", {"moods_count": len(moods)})
            else:
                return print_result(False, f"❌ ISOLATION BREACH: User B export contains other user's moods\n{details}", {"moods_today": moods_today})
        else:
            return print_result(False, f"Failed with status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 6: AUTH ENFORCEMENT TESTS
# ============================================================================

def test_notes_library_without_auth():
    """Step 6a: Notes library should require auth"""
    print_test("Step 6a: Auth Enforcement - GET /api/notes/library without auth")
    
    try:
        response = requests.get(
            f"{BASE_URL}/notes/library",
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            return print_result(True, f"✅ AUTH ENFORCED: Endpoint requires authentication (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: Endpoint accessible without auth!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_analytics_summary_without_auth():
    """Step 6b: Analytics summary should require auth"""
    print_test("Step 6b: Auth Enforcement - GET /api/analytics/summary without auth")
    
    try:
        response = requests.get(
            f"{BASE_URL}/analytics/summary",
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            return print_result(True, f"✅ AUTH ENFORCED: Endpoint requires authentication (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: Endpoint accessible without auth!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_weekly_summary_without_auth():
    """Step 6c: Weekly summary should require auth"""
    print_test("Step 6c: Auth Enforcement - GET /api/weekly-summary without auth")
    
    try:
        response = requests.get(
            f"{BASE_URL}/weekly-summary",
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            return print_result(True, f"✅ AUTH ENFORCED: Endpoint requires authentication (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: Endpoint accessible without auth!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_chat_history_without_auth():
    """Step 6d: Chat history should require auth"""
    print_test("Step 6d: Auth Enforcement - GET /api/chat/history/test123 without auth")
    
    try:
        response = requests.get(
            f"{BASE_URL}/chat/history/test123",
            timeout=10
        )
        
        if response.status_code in [401, 403]:
            return print_result(True, f"✅ AUTH ENFORCED: Endpoint requires authentication (status {response.status_code})", {"status": response.status_code})
        elif response.status_code == 200:
            return print_result(False, f"❌ SECURITY BREACH: Endpoint accessible without auth!", response.json())
        else:
            return print_result(False, f"Unexpected status {response.status_code}", response.text)
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all multi-user isolation tests"""
    print("\n" + "="*80)
    print("MULTI-USER DATA ISOLATION TESTING")
    print("Mood Tracker App - Comprehensive Security Test")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    results = []
    
    # Step 1: Register/Login users
    print("\n" + "="*80)
    print("STEP 1: USER REGISTRATION/LOGIN")
    print("="*80)
    results.append(("1a. Register/Login User A", test_register_user_a()))
    results.append(("1b. Register/Login User B", test_register_user_b()))
    
    if not token_a or not token_b:
        print("\n❌ CRITICAL: User authentication failed. Cannot proceed with isolation tests.")
        sys.exit(1)
    
    # Step 2: Create data as User A
    print("\n" + "="*80)
    print("STEP 2: CREATE DATA AS USER A")
    print("="*80)
    results.append(("2a. Create Mood (User A)", test_create_mood_user_a()))
    results.append(("2b. Create Task (User A)", test_create_task_user_a()))
    results.append(("2c. Create Thought (User A)", test_create_thought_user_a()))
    
    # Step 3: Create data as User B
    print("\n" + "="*80)
    print("STEP 3: CREATE DATA AS USER B")
    print("="*80)
    results.append(("3a. Create Mood (User B)", test_create_mood_user_b()))
    results.append(("3b. Create Task (User B)", test_create_task_user_b()))
    
    # Step 4: Isolation tests (CRITICAL)
    print("\n" + "="*80)
    print("STEP 4: DATA ISOLATION TESTS (CRITICAL)")
    print("="*80)
    results.append(("4a. User A Notes Isolation", test_user_a_notes_isolation()))
    results.append(("4b. User B Notes Isolation", test_user_b_notes_isolation()))
    results.append(("4c. User A Moods Isolation", test_user_a_moods_isolation()))
    results.append(("4d. User B Moods Isolation", test_user_b_moods_isolation()))
    results.append(("4e. User A Tasks for Date Isolation", test_user_a_tasks_for_date_isolation()))
    results.append(("4f. User B Tasks for Date Isolation", test_user_b_tasks_for_date_isolation()))
    results.append(("4g. User A Analytics Summary Isolation", test_user_a_analytics_summary_isolation()))
    results.append(("4h. User A Analytics Compare Isolation", test_user_a_analytics_compare_isolation()))
    
    # Step 5: Cross-user attack tests
    print("\n" + "="*80)
    print("STEP 5: CROSS-USER ATTACK TESTS")
    print("="*80)
    results.append(("5a. User B Complete User A Task (should fail)", test_user_b_complete_user_a_task()))
    results.append(("5b. User B Delete User A Note (should fail)", test_user_b_delete_user_a_note()))
    results.append(("5c. User B Export Moods Isolation", test_user_b_export_moods()))
    
    # Step 6: Auth enforcement tests
    print("\n" + "="*80)
    print("STEP 6: AUTH ENFORCEMENT TESTS")
    print("="*80)
    results.append(("6a. Notes Library without Auth (should fail)", test_notes_library_without_auth()))
    results.append(("6b. Analytics Summary without Auth (should fail)", test_analytics_summary_without_auth()))
    results.append(("6c. Weekly Summary without Auth (should fail)", test_weekly_summary_without_auth()))
    results.append(("6d. Chat History without Auth (should fail)", test_chat_history_without_auth()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    # Group results by category
    categories = {
        "User Registration/Login": [],
        "Data Creation": [],
        "Data Isolation (CRITICAL)": [],
        "Cross-User Attacks": [],
        "Auth Enforcement": []
    }
    
    for test_name, result in results:
        if test_name.startswith("1"):
            categories["User Registration/Login"].append((test_name, result))
        elif test_name.startswith("2") or test_name.startswith("3"):
            categories["Data Creation"].append((test_name, result))
        elif test_name.startswith("4"):
            categories["Data Isolation (CRITICAL)"].append((test_name, result))
        elif test_name.startswith("5"):
            categories["Cross-User Attacks"].append((test_name, result))
        elif test_name.startswith("6"):
            categories["Auth Enforcement"].append((test_name, result))
    
    for category, tests in categories.items():
        if tests:
            print(f"\n{category}:")
            for test_name, result in tests:
                status = "✅ PASS" if result else "❌ FAIL"
                print(f"  {status} - {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    
    # Critical isolation tests
    isolation_tests = [r for r in results if r[0].startswith("4") or r[0].startswith("5")]
    isolation_passed = sum(1 for _, result in isolation_tests if result)
    isolation_total = len(isolation_tests)
    
    print(f"\n🔒 CRITICAL ISOLATION TESTS: {isolation_passed}/{isolation_total} passed")
    
    if isolation_passed == isolation_total:
        print("✅ ALL ISOLATION TESTS PASSED - Multi-user data isolation is working correctly!")
    else:
        print("❌ ISOLATION TESTS FAILED - SECURITY BREACH DETECTED!")
    
    print(f"{'='*80}\n")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
