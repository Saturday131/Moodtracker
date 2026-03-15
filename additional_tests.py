#!/usr/bin/env python3
"""
Additional edge case testing for Notes API
"""

import requests
import json

BACKEND_URL = "https://ai-mood-buddy-2.preview.emergentagent.com/api"

def test_edge_cases():
    """Test edge cases and error conditions"""
    session = requests.Session()
    
    print("🔍 Testing Edge Cases and Error Conditions")
    print("=" * 50)
    
    # Test 1: Create note with minimal data
    print("\n1. Testing minimal note creation...")
    try:
        response = session.post(f"{BACKEND_URL}/notes", json={"text_content": "Short note"})
        if response.status_code == 200:
            print("✅ Minimal note creation works")
        else:
            print(f"❌ Minimal note creation failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 2: Create note with empty content
    print("\n2. Testing empty note creation...")
    try:
        response = session.post(f"{BACKEND_URL}/notes", json={})
        if response.status_code == 200:
            print("✅ Empty note creation works")
        else:
            print(f"❌ Empty note creation failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 3: Test invalid note ID for reminder
    print("\n3. Testing invalid note ID for reminder...")
    try:
        response = session.put(f"{BACKEND_URL}/notes/invalid-id/reminder?accept_suggestion=true")
        if response.status_code == 404:
            print("✅ Properly handles invalid note ID (404)")
        else:
            print(f"❌ Unexpected response for invalid ID: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 4: Test library with different periods
    print("\n4. Testing library with different periods...")
    periods = ["week", "month", "year"]
    for period in periods:
        try:
            response = session.get(f"{BACKEND_URL}/notes/library?period={period}")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Period '{period}': {data.get('total', 0)} notes")
            else:
                print(f"❌ Period '{period}' failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Error for period '{period}': {e}")
    
    # Test 5: Test AI analysis with complex content
    print("\n5. Testing AI analysis with complex content...")
    complex_note = {
        "title": "Project Planning Session",
        "text_content": "Had a great meeting today about the new mobile app project. We discussed the timeline - need to finish the MVP by March 15th. Also planning to have a team dinner next Friday to celebrate the milestone. Don't forget to book the restaurant and send calendar invites to everyone. The budget approval should come through by Wednesday."
    }
    try:
        response = session.post(f"{BACKEND_URL}/notes", json=complex_note)
        if response.status_code == 200:
            data = response.json()
            ai_summary = data.get("ai_summary", "")
            ai_keywords = data.get("ai_keywords", [])
            suggested_reminder = data.get("ai_suggested_reminder")
            
            print(f"✅ Complex note created with AI analysis:")
            print(f"   Summary: {ai_summary[:100]}...")
            print(f"   Keywords: {ai_keywords}")
            print(f"   Suggested reminder: {suggested_reminder}")
        else:
            print(f"❌ Complex note creation failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_edge_cases()