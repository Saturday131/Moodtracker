#!/usr/bin/env python3
"""
Backend API Testing for Mood Tracker Notes Feature
Tests the new Notes API endpoints as specified in the review request
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import time

# Backend URL from environment
BACKEND_URL = "https://ai-mood-buddy-2.preview.emergentagent.com/api"

class NotesAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.created_note_id = None
        self.test_results = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "details": details or {}
        }
        self.test_results.append(result)
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_create_note(self):
        """Test POST /api/notes - Create a new note with text content"""
        print("\n=== Testing POST /api/notes ===")
        
        test_data = {
            "title": "Test Note",
            "text_content": "I want to exercise more and finish my project by Friday"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/notes", json=test_data)
            
            if response.status_code == 200:
                data = response.json()
                
                # Store note ID for later tests
                self.created_note_id = data.get("id")
                
                # Verify required fields
                required_fields = ["id", "title", "text_content", "created_at"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Create Note", False, f"Missing required fields: {missing_fields}", data)
                    return False
                
                # Check AI analysis fields
                ai_fields = ["ai_summary", "ai_keywords", "ai_suggested_reminder"]
                ai_present = [field for field in ai_fields if data.get(field)]
                
                self.log_result("Create Note", True, 
                              f"Note created successfully with AI analysis: {ai_present}", 
                              {"note_id": self.created_note_id, "ai_fields": ai_present})
                return True
            else:
                self.log_result("Create Note", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Create Note", False, f"Request failed: {str(e)}")
            return False
    
    def test_notes_library(self):
        """Test GET /api/notes/library?period=all - Get notes library"""
        print("\n=== Testing GET /api/notes/library ===")
        
        try:
            response = self.session.get(f"{self.base_url}/notes/library?period=all")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields
                required_fields = ["total", "notes", "all_tags", "period"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Notes Library", False, f"Missing required fields: {missing_fields}", data)
                    return False
                
                # Verify structure
                if not isinstance(data["notes"], list):
                    self.log_result("Notes Library", False, "Notes field is not a list", data)
                    return False
                
                if not isinstance(data["all_tags"], list):
                    self.log_result("Notes Library", False, "all_tags field is not a list", data)
                    return False
                
                self.log_result("Notes Library", True, 
                              f"Library returned {data['total']} notes with {len(data['all_tags'])} tags", 
                              {"total": data["total"], "tags_count": len(data["all_tags"])})
                return True
            else:
                self.log_result("Notes Library", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Notes Library", False, f"Request failed: {str(e)}")
            return False
    
    def test_daily_summary(self):
        """Test GET /api/daily-summary - Get daily AI summary"""
        print("\n=== Testing GET /api/daily-summary ===")
        
        try:
            response = self.session.get(f"{self.base_url}/daily-summary")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields
                if "summary" not in data:
                    self.log_result("Daily Summary", False, "Missing summary field", data)
                    return False
                
                summary_text = data["summary"]
                if not isinstance(summary_text, str) or len(summary_text) == 0:
                    self.log_result("Daily Summary", False, "Summary is empty or not a string", data)
                    return False
                
                self.log_result("Daily Summary", True, 
                              f"Daily summary generated ({len(summary_text)} characters)", 
                              {"summary_length": len(summary_text)})
                return True
            else:
                self.log_result("Daily Summary", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Daily Summary", False, f"Request failed: {str(e)}")
            return False
    
    def test_weekly_summary(self):
        """Test GET /api/weekly-summary - Get weekly AI summary"""
        print("\n=== Testing GET /api/weekly-summary ===")
        
        try:
            response = self.session.get(f"{self.base_url}/weekly-summary")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields
                if "summary" not in data:
                    self.log_result("Weekly Summary", False, "Missing summary field", data)
                    return False
                
                summary_text = data["summary"]
                if not isinstance(summary_text, str) or len(summary_text) == 0:
                    self.log_result("Weekly Summary", False, "Summary is empty or not a string", data)
                    return False
                
                self.log_result("Weekly Summary", True, 
                              f"Weekly summary generated ({len(summary_text)} characters)", 
                              {"summary_length": len(summary_text)})
                return True
            else:
                self.log_result("Weekly Summary", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Weekly Summary", False, f"Request failed: {str(e)}")
            return False
    
    def test_pending_reminders(self):
        """Test GET /api/notes/reminders/pending - Get pending reminders"""
        print("\n=== Testing GET /api/notes/reminders/pending ===")
        
        try:
            response = self.session.get(f"{self.base_url}/notes/reminders/pending")
            
            if response.status_code == 200:
                data = response.json()
                
                # Should return a list
                if not isinstance(data, list):
                    self.log_result("Pending Reminders", False, "Response is not a list", data)
                    return False
                
                # Check if any reminders have the expected structure
                for reminder in data:
                    if not isinstance(reminder, dict):
                        self.log_result("Pending Reminders", False, "Reminder item is not a dict", reminder)
                        return False
                    
                    # Should have reminder_date and reminder_sent fields
                    if "reminder_date" not in reminder:
                        self.log_result("Pending Reminders", False, "Missing reminder_date field", reminder)
                        return False
                
                self.log_result("Pending Reminders", True, 
                              f"Found {len(data)} pending reminders", 
                              {"count": len(data)})
                return True
            else:
                self.log_result("Pending Reminders", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Pending Reminders", False, f"Request failed: {str(e)}")
            return False
    
    def test_accept_reminder_suggestion(self):
        """Test PUT /api/notes/{note_id}/reminder?accept_suggestion=true - Accept AI suggested reminder"""
        print("\n=== Testing PUT /api/notes/{note_id}/reminder ===")
        
        if not self.created_note_id:
            self.log_result("Accept Reminder", False, "No note ID available from previous test")
            return False
        
        try:
            response = self.session.put(f"{self.base_url}/notes/{self.created_note_id}/reminder?accept_suggestion=true")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify the note was updated
                if "id" not in data or data["id"] != self.created_note_id:
                    self.log_result("Accept Reminder", False, "Note ID mismatch in response", data)
                    return False
                
                # Check if reminder_date was set
                reminder_date = data.get("reminder_date")
                if reminder_date:
                    self.log_result("Accept Reminder", True, 
                                  f"Reminder accepted and set to {reminder_date}", 
                                  {"reminder_date": reminder_date})
                else:
                    self.log_result("Accept Reminder", True, 
                                  "Reminder endpoint working (no AI suggestion to accept)", 
                                  {"note_id": self.created_note_id})
                return True
            else:
                self.log_result("Accept Reminder", False, 
                              f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Accept Reminder", False, f"Request failed: {str(e)}")
            return False
    
    def test_api_root(self):
        """Test API root endpoint to verify connectivity"""
        print("\n=== Testing API Connectivity ===")
        
        try:
            response = self.session.get(f"{self.base_url}/")
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("API Connectivity", True, f"API accessible: {data.get('message', 'OK')}")
                return True
            else:
                self.log_result("API Connectivity", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("API Connectivity", False, f"Connection failed: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🧪 Starting Notes API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test API connectivity first
        if not self.test_api_root():
            print("\n❌ API connectivity failed - stopping tests")
            return False
        
        # Run all tests
        tests = [
            self.test_create_note,
            self.test_notes_library,
            self.test_daily_summary,
            self.test_weekly_summary,
            self.test_pending_reminders,
            self.test_accept_reminder_suggestion
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            time.sleep(0.5)  # Small delay between tests
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {total - passed} tests failed")
            return False
    
    def print_detailed_results(self):
        """Print detailed test results"""
        print("\n" + "=" * 60)
        print("📋 DETAILED TEST RESULTS")
        print("=" * 60)
        
        for result in self.test_results:
            print(f"\n{result['status']}: {result['test']}")
            print(f"   Message: {result['message']}")
            if result['details']:
                print(f"   Details: {json.dumps(result['details'], indent=2)}")

def main():
    """Main test runner"""
    tester = NotesAPITester()
    
    success = tester.run_all_tests()
    tester.print_detailed_results()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()