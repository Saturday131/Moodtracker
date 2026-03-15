#!/usr/bin/env python3
"""
Advanced Task Scheduling Backend Testing for Mood Tracker App
Tests all task scheduling APIs with complex recurrence patterns
"""

import asyncio
import aiohttp
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List
import sys

# API Base URL - using production URL from .env
API_BASE = "https://ai-mood-buddy-2.preview.emergentagent.com/api"

class TaskSchedulingTester:
    def __init__(self):
        self.session = None
        self.created_task_ids = []  # Track created tasks for cleanup
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.session.close()
    
    def log_result(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.test_results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {json.dumps(response_data, indent=2)}")
    
    async def make_request(self, method: str, endpoint: str, data: Dict = None) -> tuple[bool, Dict]:
        """Make HTTP request and return (success, response_data)"""
        url = f"{API_BASE}{endpoint}"
        try:
            async with self.session.request(method, url, json=data) as response:
                response_data = await response.json()
                return response.status < 400, response_data
        except Exception as e:
            return False, {"error": str(e)}
    
    async def test_1_create_task_with_advanced_scheduling(self):
        """Test creating task with all advanced scheduling fields"""
        test_data = {
            "title": "Morning Run",
            "text_content": "Run 5km",
            "category": "zadania",
            "is_recurring": True,
            "recurrence_pattern": "custom",
            "recurrence_days": [0, 2, 4],  # Monday, Wednesday, Friday
            "scheduled_time": "06:00",
            "recurrence_end_date": "2026-04-30",
            "scheduled_date": "2026-03-16"
        }
        
        success, response = await self.make_request("POST", "/notes", test_data)
        
        if success:
            task_id = response.get("id")
            if task_id:
                self.created_task_ids.append(task_id)
            
            # Verify all fields are correctly saved
            expected_fields = ["is_recurring", "recurrence_pattern", "recurrence_days", 
                             "scheduled_time", "recurrence_end_date", "scheduled_date"]
            missing_fields = [field for field in expected_fields if field not in response]
            
            if missing_fields:
                self.log_result(
                    "Create Advanced Task", False,
                    f"Missing fields in response: {missing_fields}", response
                )
            else:
                # Verify values match
                matches = all([
                    response.get("is_recurring") == True,
                    response.get("recurrence_pattern") == "custom",
                    response.get("recurrence_days") == [0, 2, 4],
                    response.get("scheduled_time") == "06:00",
                    response.get("recurrence_end_date") == "2026-04-30",
                    response.get("scheduled_date") == "2026-03-16"
                ])
                
                if matches:
                    self.log_result(
                        "Create Advanced Task", True,
                        f"Task created with ID: {task_id[:8]}..., all scheduling fields correct"
                    )
                else:
                    self.log_result(
                        "Create Advanced Task", False,
                        "Some scheduling field values don't match", response
                    )
        else:
            self.log_result("Create Advanced Task", False, "Failed to create task", response)
    
    async def test_2_create_daily_recurring_task(self):
        """Test creating task with simple daily recurrence"""
        test_data = {
            "title": "Daily Vitamins",
            "text_content": "Take vitamins",
            "category": "zadania",
            "is_recurring": True,
            "recurrence_pattern": "daily",
            "scheduled_time": "09:00"
        }
        
        success, response = await self.make_request("POST", "/notes", test_data)
        
        if success:
            task_id = response.get("id")
            if task_id:
                self.created_task_ids.append(task_id)
            
            if (response.get("is_recurring") == True and 
                response.get("recurrence_pattern") == "daily" and
                response.get("scheduled_time") == "09:00"):
                self.log_result(
                    "Create Daily Task", True,
                    f"Daily recurring task created with ID: {task_id[:8]}..."
                )
            else:
                self.log_result("Create Daily Task", False, "Incorrect daily task fields", response)
        else:
            self.log_result("Create Daily Task", False, "Failed to create daily task", response)
    
    async def test_3_create_weekdays_recurring_task(self):
        """Test creating task with weekdays recurrence pattern"""
        test_data = {
            "title": "Stand-up meeting",
            "text_content": "Daily standup",
            "category": "zadania",
            "is_recurring": True,
            "recurrence_pattern": "weekdays",
            "scheduled_time": "10:00"
        }
        
        success, response = await self.make_request("POST", "/notes", test_data)
        
        if success:
            task_id = response.get("id")
            if task_id:
                self.created_task_ids.append(task_id)
            
            if (response.get("is_recurring") == True and 
                response.get("recurrence_pattern") == "weekdays" and
                response.get("scheduled_time") == "10:00"):
                self.log_result(
                    "Create Weekdays Task", True,
                    f"Weekdays recurring task created with ID: {task_id[:8]}..."
                )
            else:
                self.log_result("Create Weekdays Task", False, "Incorrect weekdays task fields", response)
        else:
            self.log_result("Create Weekdays Task", False, "Failed to create weekdays task", response)
    
    async def test_4_get_tasks_for_dates(self):
        """Test getting tasks for specific dates with different recurrence patterns"""
        dates_to_test = [
            ("2026-03-16", "Monday", "should include daily + custom (Mon/Wed/Fri) tasks"),
            ("2026-03-17", "Tuesday", "should include daily + weekdays but NOT custom Mon/Wed/Fri"),
            ("2026-03-18", "Wednesday", "should include daily + weekdays + custom tasks"),
            ("2026-03-21", "Saturday", "should include daily but NOT weekdays and NOT custom")
        ]
        
        for date, day_name, expected in dates_to_test:
            success, response = await self.make_request("GET", f"/tasks/for-date/{date}")
            
            if success:
                tasks = response if isinstance(response, list) else []
                
                # Count different types of tasks
                daily_tasks = [t for t in tasks if t.get("recurrence_pattern") == "daily"]
                weekdays_tasks = [t for t in tasks if t.get("recurrence_pattern") == "weekdays"]
                custom_tasks = [t for t in tasks if t.get("recurrence_pattern") == "custom"]
                
                # Analyze based on day
                day_of_week = datetime.strptime(date, "%Y-%m-%d").weekday()
                
                details = f"{day_name} ({date}): {len(tasks)} total tasks - "
                details += f"Daily: {len(daily_tasks)}, Weekdays: {len(weekdays_tasks)}, Custom: {len(custom_tasks)}"
                
                # Verify expectations
                correct = True
                if day_of_week < 5:  # Monday-Friday
                    if len(weekdays_tasks) == 0:
                        correct = False
                        details += " | ERROR: Missing weekdays tasks on business day"
                else:  # Weekend
                    if len(weekdays_tasks) > 0:
                        correct = False
                        details += " | ERROR: Weekdays tasks appearing on weekend"
                
                # Check custom pattern (Mon=0, Wed=2, Fri=4)
                if day_of_week in [0, 2, 4]:  # Mon, Wed, Fri
                    if len(custom_tasks) == 0:
                        details += " | WARNING: Expected custom tasks on Mon/Wed/Fri"
                else:
                    if len(custom_tasks) > 0:
                        details += " | WARNING: Custom tasks appearing on non-Mon/Wed/Fri"
                
                self.log_result(f"Tasks for {day_name}", correct, details)
            else:
                self.log_result(f"Tasks for {day_name}", False, f"Failed to get tasks for {date}", response)
    
    async def test_5_chat_based_task_modification(self):
        """Test AI-powered chat-based task modification"""
        test_message = {
            "user_message": "Dodaj zadanie 'Wizyta u dentysty' na piątek 2026-03-20 o 14:30"
        }
        
        success, response = await self.make_request("POST", "/tasks/chat-modify", test_message)
        
        if success:
            operations = response.get("operations_executed", [])
            ai_response = response.get("ai_response", "")
            
            if operations and any("Utworzono" in op for op in operations):
                self.log_result(
                    "Chat Task Modification", True,
                    f"Successfully executed: {operations[0]}, AI response: {ai_response[:50]}..."
                )
                
                # Try to find the created task to add to cleanup list
                if "raw_operations" in response:
                    for op in response["raw_operations"]:
                        if op.get("action") == "create":
                            # The task should be created, try to find it by title
                            find_success, find_response = await self.make_request("GET", "/notes/library?category=zadania")
                            if find_success:
                                notes = find_response.get("notes", [])
                                dental_task = next((n for n in notes if "dentysty" in n.get("title", "").lower()), None)
                                if dental_task:
                                    self.created_task_ids.append(dental_task.get("id"))
            else:
                self.log_result(
                    "Chat Task Modification", False,
                    f"No creation operation found. Response: {response}"
                )
        else:
            self.log_result("Chat Task Modification", False, "Failed to modify tasks via chat", response)
    
    async def test_6_task_completion_toggle(self):
        """Test task completion and uncompletion"""
        if not self.created_task_ids:
            self.log_result("Task Completion Toggle", False, "No tasks available to test completion")
            return
        
        task_id = self.created_task_ids[0]
        
        # Test complete task
        success, response = await self.make_request("PUT", f"/tasks/{task_id}/complete")
        if success and response.get("is_completed") == True:
            self.log_result("Task Complete", True, f"Task {task_id[:8]}... marked as completed")
            
            # Test uncomplete task
            success, response = await self.make_request("PUT", f"/tasks/{task_id}/uncomplete")
            if success and response.get("is_completed") == False:
                self.log_result("Task Uncomplete", True, f"Task {task_id[:8]}... marked as not completed")
            else:
                self.log_result("Task Uncomplete", False, "Failed to uncomplete task", response)
        else:
            self.log_result("Task Complete", False, "Failed to complete task", response)
    
    async def test_7_notes_library_with_tasks(self):
        """Test notes library endpoint specifically for tasks (zadania category)"""
        success, response = await self.make_request("GET", "/notes/library?category=zadania")
        
        if success:
            total = response.get("total", 0)
            notes = response.get("notes", [])
            all_tags = response.get("all_tags", [])
            
            # Verify all returned notes are tasks (zadania category)
            task_notes = [n for n in notes if n.get("category") == "zadania"]
            
            # Check for scheduling fields in tasks
            tasks_with_scheduling = [
                n for n in task_notes 
                if any([n.get("recurrence_days"), n.get("scheduled_time"), n.get("recurrence_end_date")])
            ]
            
            details = f"Total: {total}, Tasks: {len(task_notes)}, With scheduling: {len(tasks_with_scheduling)}, Tags: {len(all_tags)}"
            
            if len(task_notes) == len(notes):  # All notes are tasks
                self.log_result("Notes Library Tasks", True, details)
            else:
                self.log_result(
                    "Notes Library Tasks", False, 
                    f"Expected only tasks but found mixed categories. {details}"
                )
        else:
            self.log_result("Notes Library Tasks", False, "Failed to get notes library", response)
    
    async def test_8_create_non_task_note(self):
        """Test creating a non-task note (przemyslenia category)"""
        test_data = {
            "title": "My thoughts",
            "text_content": "Feeling good today",
            "category": "przemyslenia"
        }
        
        success, response = await self.make_request("POST", "/notes", test_data)
        
        if success:
            note_id = response.get("id")
            if note_id:
                self.created_task_ids.append(note_id)  # For cleanup
            
            # Verify is_recurring defaults to false and category is correct
            if (response.get("category") == "przemyslenia" and 
                response.get("is_recurring") == False):
                self.log_result(
                    "Create Non-Task Note", True,
                    f"Note created with ID: {note_id[:8]}..., category: przemyslenia, not recurring"
                )
            else:
                self.log_result("Create Non-Task Note", False, "Incorrect non-task note properties", response)
        else:
            self.log_result("Create Non-Task Note", False, "Failed to create non-task note", response)
    
    async def test_9_delete_task(self):
        """Test deleting a task"""
        if not self.created_task_ids:
            self.log_result("Delete Task", False, "No tasks available to delete")
            return
        
        task_id = self.created_task_ids[-1]  # Delete the last created task
        
        success, response = await self.make_request("DELETE", f"/notes/{task_id}")
        
        if success:
            # Verify task is actually deleted by trying to get it
            get_success, get_response = await self.make_request("GET", f"/notes/{task_id}")
            
            if not get_success and get_response.get("detail") == "Note not found":
                self.log_result("Delete Task", True, f"Task {task_id[:8]}... successfully deleted")
                self.created_task_ids.remove(task_id)  # Remove from cleanup list
            else:
                self.log_result("Delete Task", False, "Task still exists after deletion", get_response)
        else:
            self.log_result("Delete Task", False, "Failed to delete task", response)
    
    async def cleanup_created_tasks(self):
        """Clean up any tasks created during testing"""
        print("\n🧹 Cleaning up created tasks...")
        for task_id in self.created_task_ids:
            try:
                success, _ = await self.make_request("DELETE", f"/notes/{task_id}")
                if success:
                    print(f"   ✅ Deleted task {task_id[:8]}...")
                else:
                    print(f"   ❌ Failed to delete task {task_id[:8]}...")
            except Exception as e:
                print(f"   ⚠️ Error deleting task {task_id[:8]}...: {e}")
    
    async def run_all_tests(self):
        """Run all task scheduling tests in sequence"""
        print("🧪 Starting Advanced Task Scheduling Backend Tests")
        print(f"📡 API Base URL: {API_BASE}")
        print("=" * 60)
        
        # Run all tests
        await self.test_1_create_task_with_advanced_scheduling()
        await self.test_2_create_daily_recurring_task()
        await self.test_3_create_weekdays_recurring_task()
        await self.test_4_get_tasks_for_dates()
        await self.test_5_chat_based_task_modification()
        await self.test_6_task_completion_toggle()
        await self.test_7_notes_library_with_tasks()
        await self.test_8_create_non_task_note()
        await self.test_9_delete_task()
        
        # Cleanup
        await self.cleanup_created_tasks()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {total - passed} ❌")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test['details']}")
        
        return passed == total

async def main():
    """Main test runner"""
    try:
        async with TaskSchedulingTester() as tester:
            success = await tester.run_all_tests()
            return 0 if success else 1
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)