#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Mood Tracker App
Tests auth system and semantic search with user isolation
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://ai-mood-buddy-2.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
    
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")
        return self.failed == 0

def test_user_registration():
    """Test user registration endpoint"""
    results = TestResults()
    
    # Generate unique email for this test run
    import time
    timestamp = str(int(time.time()))
    test_email = f"tester1_{timestamp}@app.pl"
    
    # Test 1: Valid registration
    try:
        response = requests.post(f"{API_BASE}/auth/register", json={
            "email": test_email,
            "password": "securepass123",
            "name": "Tester One"
        })
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                user = data["user"]
                if "id" in user and "email" in user and "name" in user:
                    results.log_pass("User registration with valid data")
                    return results, data["token"], user["id"], test_email
                else:
                    results.log_fail("User registration", "Missing user fields in response")
            else:
                results.log_fail("User registration", "Missing token or user in response")
        else:
            results.log_fail("User registration", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User registration", f"Request failed: {e}")
        return results, None, None, None
    
    return results, None, None, None

def test_user_login(test_email):
    """Test user login endpoint"""
    results = TestResults()
    
    # Test login with registered user
    try:
        response = requests.post(f"{API_BASE}/auth/login", json={
            "email": test_email,
            "password": "securepass123"
        })
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                results.log_pass("User login with valid credentials")
                return results, data["token"]
            else:
                results.log_fail("User login", "Missing token or user in response")
        else:
            results.log_fail("User login", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User login", f"Request failed: {e}")
        return results, None
    
    return results, None

def test_duplicate_registration(test_email):
    """Test duplicate email registration"""
    results = TestResults()
    
    try:
        response = requests.post(f"{API_BASE}/auth/register", json={
            "email": test_email,
            "password": "securepass123",
            "name": "Tester One Duplicate"
        })
        
        if response.status_code == 400:
            results.log_pass("Duplicate registration returns 400")
        else:
            results.log_fail("Duplicate registration", f"Expected 400, got {response.status_code}")
    except Exception as e:
        results.log_fail("Duplicate registration", f"Request failed: {e}")
    
    return results

def test_auth_me(token):
    """Test /auth/me endpoint"""
    results = TestResults()
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API_BASE}/auth/me", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "email" in data and "name" in data:
                results.log_pass("Auth me endpoint returns user data")
            else:
                results.log_fail("Auth me", "Missing user fields in response")
        else:
            results.log_fail("Auth me", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("Auth me", f"Request failed: {e}")
    
    return results

def test_protected_endpoints_without_token():
    """Test protected endpoints without authentication"""
    results = TestResults()
    
    # Test notes library endpoint
    try:
        response = requests.get(f"{API_BASE}/notes/library?period=all")
        if response.status_code == 401:
            results.log_pass("Notes library returns 401 without token")
        else:
            results.log_fail("Notes library protection", f"Expected 401, got {response.status_code}")
    except Exception as e:
        results.log_fail("Notes library protection", f"Request failed: {e}")
    
    # Test moods endpoint
    try:
        response = requests.get(f"{API_BASE}/moods")
        if response.status_code == 401:
            results.log_pass("Moods endpoint returns 401 without token")
        else:
            results.log_fail("Moods endpoint protection", f"Expected 401, got {response.status_code}")
    except Exception as e:
        results.log_fail("Moods endpoint protection", f"Request failed: {e}")
    
    return results

def test_data_isolation(test_email):
    """Test data isolation between users"""
    results = TestResults()
    
    # Generate unique email for second user
    import time
    timestamp = str(int(time.time()))
    test_email2 = f"tester2_{timestamp}@app.pl"
    
    # Register second user
    try:
        response = requests.post(f"{API_BASE}/auth/register", json={
            "email": test_email2,
            "password": "securepass123",
            "name": "Tester Two"
        })
        
        if response.status_code != 200:
            results.log_fail("User 2 registration", f"Status {response.status_code}: {response.text}")
            return results
        
        user2_token = response.json()["token"]
        user2_id = response.json()["user"]["id"]
        results.log_pass("Second user registration")
    except Exception as e:
        results.log_fail("User 2 registration", f"Request failed: {e}")
        return results
    
    # Get user 1 token again
    try:
        response = requests.post(f"{API_BASE}/auth/login", json={
            "email": test_email,
            "password": "securepass123"
        })
        user1_token = response.json()["token"]
    except Exception as e:
        results.log_fail("User 1 re-login", f"Request failed: {e}")
        return results
    
    # Create note as User 1
    try:
        headers = {"Authorization": f"Bearer {user1_token}"}
        response = requests.post(f"{API_BASE}/notes", headers=headers, json={
            "title": "Notatka User 1",
            "text_content": "Prywatna treść",
            "category": "przemyslenia"
        })
        
        if response.status_code == 200:
            results.log_pass("User 1 note creation")
        else:
            results.log_fail("User 1 note creation", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 1 note creation", f"Request failed: {e}")
    
    # Create note as User 2
    try:
        headers = {"Authorization": f"Bearer {user2_token}"}
        response = requests.post(f"{API_BASE}/notes", headers=headers, json={
            "title": "Notatka User 2",
            "text_content": "Sekretna treść",
            "category": "przemyslenia"
        })
        
        if response.status_code == 200:
            results.log_pass("User 2 note creation")
        else:
            results.log_fail("User 2 note creation", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 2 note creation", f"Request failed: {e}")
    
    # Check User 1 can only see their notes
    try:
        headers = {"Authorization": f"Bearer {user1_token}"}
        response = requests.get(f"{API_BASE}/notes/library?period=all", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            notes = data.get("notes", [])
            user1_notes = [n for n in notes if "User 1" in n.get("title", "")]
            user2_notes = [n for n in notes if "User 2" in n.get("title", "")]
            
            if len(user1_notes) > 0 and len(user2_notes) == 0:
                results.log_pass("User 1 data isolation - only sees own notes")
            else:
                results.log_fail("User 1 data isolation", f"Found {len(user1_notes)} own notes, {len(user2_notes)} other user notes")
        else:
            results.log_fail("User 1 notes fetch", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 1 notes fetch", f"Request failed: {e}")
    
    # Check User 2 can only see their notes
    try:
        headers = {"Authorization": f"Bearer {user2_token}"}
        response = requests.get(f"{API_BASE}/notes/library?period=all", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            notes = data.get("notes", [])
            user1_notes = [n for n in notes if "User 1" in n.get("title", "")]
            user2_notes = [n for n in notes if "User 2" in n.get("title", "")]
            
            if len(user2_notes) > 0 and len(user1_notes) == 0:
                results.log_pass("User 2 data isolation - only sees own notes")
            else:
                results.log_fail("User 2 data isolation", f"Found {len(user2_notes)} own notes, {len(user1_notes)} other user notes")
        else:
            results.log_fail("User 2 notes fetch", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 2 notes fetch", f"Request failed: {e}")
    
    return results, user1_token, user2_token

def test_semantic_search(user1_token, user2_token):
    """Test semantic search with user isolation"""
    results = TestResults()
    
    # Create specific notes for User 1
    try:
        headers = {"Authorization": f"Bearer {user1_token}"}
        
        # Note about coffee meeting
        response = requests.post(f"{API_BASE}/notes", headers=headers, json={
            "title": "Spotkanie z Karoliną",
            "text_content": "Umówiliśmy się na kawę jutro o 15",
            "category": "przemyslenia"
        })
        
        if response.status_code == 200:
            results.log_pass("User 1 coffee note creation")
        else:
            results.log_fail("User 1 coffee note creation", f"Status {response.status_code}")
        
        # Shopping list note
        response = requests.post(f"{API_BASE}/notes", headers=headers, json={
            "title": "Lista zakupów",
            "text_content": "Kupić mleko, chleb i masło",
            "category": "zadania"
        })
        
        if response.status_code == 200:
            results.log_pass("User 1 shopping note creation")
        else:
            results.log_fail("User 1 shopping note creation", f"Status {response.status_code}")
            
    except Exception as e:
        results.log_fail("User 1 notes for search", f"Request failed: {e}")
        return results
    
    # Wait a moment for ChromaDB indexing
    import time
    time.sleep(2)
    
    # Search as User 1 for "kawa" (coffee)
    try:
        headers = {"Authorization": f"Bearer {user1_token}"}
        response = requests.get(f"{API_BASE}/notes/search?q=kawa", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            search_results = data.get("results", [])
            
            # Check if coffee meeting note is found
            coffee_found = any("Karoliną" in result.get("title", "") for result in search_results)
            
            if coffee_found:
                results.log_pass("User 1 semantic search finds coffee note")
            else:
                results.log_fail("User 1 semantic search", "Coffee note not found in search results")
        else:
            results.log_fail("User 1 semantic search", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 1 semantic search", f"Request failed: {e}")
    
    # Search as User 2 for "kawa" (should only return User 2's notes, not User 1's)
    try:
        headers = {"Authorization": f"Bearer {user2_token}"}
        response = requests.get(f"{API_BASE}/notes/search?q=kawa", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            search_results = data.get("results", [])
            
            # Check that no User 1 notes are returned (proper isolation)
            user1_notes_found = any("User 1" in result.get("title", "") or "Karoliną" in result.get("title", "") for result in search_results)
            
            if not user1_notes_found:
                results.log_pass("User 2 semantic search isolation - no User 1 notes returned")
            else:
                results.log_fail("User 2 semantic search isolation", "Found User 1 notes in User 2's search results")
        else:
            results.log_fail("User 2 semantic search", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("User 2 semantic search", f"Request failed: {e}")
    
    return results

def test_mood_entry_with_auth(token):
    """Test mood entry creation with authentication"""
    results = TestResults()
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{API_BASE}/moods", headers=headers, json={
            "date": "2026-04-19",
            "time_of_day": "morning",
            "layers": {
                "overall": 4,
                "energy": 3,
                "stress": 2,
                "productivity": 4,
                "social": 3
            },
            "notes": "Test nastroju"
        })
        
        if response.status_code == 200:
            results.log_pass("Mood entry creation with auth")
            
            # Test retrieving the mood
            response = requests.get(f"{API_BASE}/moods/date/2026-04-19", headers=headers)
            if response.status_code == 200:
                data = response.json()
                if "morning" in data and data["morning"] is not None:
                    results.log_pass("Mood entry retrieval by date")
                else:
                    results.log_fail("Mood entry retrieval", "Morning mood not found")
            else:
                results.log_fail("Mood entry retrieval", f"Status {response.status_code}")
        else:
            results.log_fail("Mood entry creation", f"Status {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("Mood entry with auth", f"Request failed: {e}")
    
    return results

def test_invalid_token():
    """Test endpoints with invalid token"""
    results = TestResults()
    
    try:
        headers = {"Authorization": "Bearer invalid_token"}
        response = requests.get(f"{API_BASE}/auth/me", headers=headers)
        
        if response.status_code == 401:
            results.log_pass("Invalid token returns 401")
        else:
            results.log_fail("Invalid token handling", f"Expected 401, got {response.status_code}")
    except Exception as e:
        results.log_fail("Invalid token test", f"Request failed: {e}")
    
    return results

def main():
    """Run all authentication and semantic search tests"""
    print("🚀 Starting Comprehensive Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"API Base: {API_BASE}")
    print("="*60)
    
    all_results = TestResults()
    
    # Test 1: User Registration
    print("\n1. Testing User Registration...")
    reg_results, user1_token, user1_id, test_email = test_user_registration()
    all_results.passed += reg_results.passed
    all_results.failed += reg_results.failed
    all_results.errors.extend(reg_results.errors)
    
    if not user1_token:
        print("❌ Cannot continue without valid user token")
        return False
    
    # Test 2: User Login
    print("\n2. Testing User Login...")
    login_results, login_token = test_user_login(test_email)
    all_results.passed += login_results.passed
    all_results.failed += login_results.failed
    all_results.errors.extend(login_results.errors)
    
    # Test 3: Duplicate Registration
    print("\n3. Testing Duplicate Registration...")
    dup_results = test_duplicate_registration(test_email)
    all_results.passed += dup_results.passed
    all_results.failed += dup_results.failed
    all_results.errors.extend(dup_results.errors)
    
    # Test 4: Auth Me
    print("\n4. Testing Auth Me Endpoint...")
    me_results = test_auth_me(user1_token)
    all_results.passed += me_results.passed
    all_results.failed += me_results.failed
    all_results.errors.extend(me_results.errors)
    
    # Test 5: Protected Endpoints
    print("\n5. Testing Protected Endpoints Without Token...")
    protected_results = test_protected_endpoints_without_token()
    all_results.passed += protected_results.passed
    all_results.failed += protected_results.failed
    all_results.errors.extend(protected_results.errors)
    
    # Test 6: Data Isolation
    print("\n6. Testing Data Isolation Between Users...")
    isolation_results, user1_token_new, user2_token = test_data_isolation(test_email)
    all_results.passed += isolation_results.passed
    all_results.failed += isolation_results.failed
    all_results.errors.extend(isolation_results.errors)
    
    if not user2_token:
        print("❌ Cannot test semantic search without second user")
    else:
        # Test 7: Semantic Search
        print("\n7. Testing Semantic Search with User Isolation...")
        search_results = test_semantic_search(user1_token_new or user1_token, user2_token)
        all_results.passed += search_results.passed
        all_results.failed += search_results.failed
        all_results.errors.extend(search_results.errors)
    
    # Test 8: Mood Entry with Auth
    print("\n8. Testing Mood Entry with Authentication...")
    mood_results = test_mood_entry_with_auth(user1_token)
    all_results.passed += mood_results.passed
    all_results.failed += mood_results.failed
    all_results.errors.extend(mood_results.errors)
    
    # Test 9: Invalid Token
    print("\n9. Testing Invalid Token Handling...")
    invalid_results = test_invalid_token()
    all_results.passed += invalid_results.passed
    all_results.failed += invalid_results.failed
    all_results.errors.extend(invalid_results.errors)
    
    # Final Summary
    success = all_results.summary()
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)