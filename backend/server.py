from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
from collections import defaultdict
from emergentintegrations.llm.chat import LlmChat, UserMessage
import base64
import json
import re


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Constants
TIME_OF_DAY_OPTIONS = ["morning", "midday", "evening"]
MOOD_LAYERS = {
    "overall": {"name": "Overall Mood", "emoji": "😊", "description": "How you feel in general"},
    "energy": {"name": "Energy Level", "emoji": "⚡", "description": "Your physical and mental energy"},
    "stress": {"name": "Stress Level", "emoji": "😰", "description": "How stressed you feel (5=calm, 1=very stressed)"},
    "productivity": {"name": "Productivity", "emoji": "💪", "description": "How productive you've been"},
    "social": {"name": "Social Mood", "emoji": "👥", "description": "How social you feel"}
}
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Models
class MoodLayers(BaseModel):
    overall: int = Field(ge=1, le=5, default=3)
    energy: int = Field(ge=1, le=5, default=3)
    stress: int = Field(ge=1, le=5, default=3)
    productivity: int = Field(ge=1, le=5, default=3)
    social: int = Field(ge=1, le=5, default=3)

class MoodEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    time_of_day: str
    layers: MoodLayers
    note: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MoodEntryCreate(BaseModel):
    date: str
    time_of_day: str
    layers: MoodLayers
    note: Optional[str] = None

class NoteCreate(BaseModel):
    title: Optional[str] = None
    text_content: Optional[str] = None
    voice_base64: Optional[str] = None
    image_base64: Optional[str] = None
    tags: List[str] = []
    mood_date: Optional[str] = None
    category: str = "przemyslenia"  # "zadania" or "przemyslenia"
    # Advanced scheduling fields
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # "daily", "weekdays", "weekly", "monthly", "custom"
    recurrence_days: List[int] = []  # For custom: [0,1,2,3,4,5,6] where 0=Monday, 6=Sunday
    recurrence_end_date: Optional[str] = None  # YYYY-MM-DD format
    scheduled_date: Optional[str] = None  # For tasks scheduled for specific date
    scheduled_time: Optional[str] = None  # HH:MM format, e.g., "08:00"

class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = None
    text_content: Optional[str] = None
    voice_base64: Optional[str] = None
    voice_transcription: Optional[str] = None
    image_base64: Optional[str] = None
    tags: List[str] = []
    mood_date: Optional[str] = None
    category: str = "przemyslenia"  # "zadania" or "przemyslenia"
    # Completion status
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    # Advanced scheduling fields
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None  # "daily", "weekdays", "weekly", "monthly", "custom"
    recurrence_days: List[int] = []  # For custom: days of week [0-6]
    recurrence_end_date: Optional[str] = None
    parent_task_id: Optional[str] = None  # For instances generated from recurring tasks
    scheduled_date: Optional[str] = None  # Date this task is scheduled for
    scheduled_time: Optional[str] = None  # HH:MM format
    # AI fields
    ai_summary: Optional[str] = None
    ai_keywords: List[str] = []
    ai_suggested_reminder: Optional[str] = None
    reminder_date: Optional[str] = None
    reminder_sent: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    text_content: Optional[str] = None
    tags: Optional[List[str]] = None
    reminder_date: Optional[str] = None

class ReminderSettings(BaseModel):
    daily_summary_time: str = "21:00"  # 9 PM
    weekly_summary_day: int = 6  # Sunday (0=Monday, 6=Sunday)
    weekly_summary_time: str = "10:00"  # 10 AM

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "default_user"
    daily_notification_enabled: bool = True
    daily_notification_time: str = "21:00"
    weekly_notification_enabled: bool = True
    weekly_notification_day: int = 6  # Sunday
    weekly_notification_time: str = "10:00"
    language: str = "pl"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserContext(BaseModel):
    """Stores learned context about the user from notes and chats"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "default_user"
    learned_topics: List[str] = []  # Topics user frequently discusses
    pending_tasks: List[dict] = []  # Tasks extracted from notes {task, date_mentioned, due_date}
    mood_patterns: dict = {}  # Learned mood patterns
    preferences: dict = {}  # User preferences learned from interactions
    last_summary_date: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DailySummary(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    mood_summary: str
    mood_comparison: str
    notes_summary: str
    pending_tasks: List[dict] = []
    ai_insights: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    message: str
    session_id: str

# Helper functions
def calculate_composite_score(layers: dict) -> float:
    weights = {"overall": 0.3, "energy": 0.2, "stress": 0.2, "productivity": 0.15, "social": 0.15}
    total = sum(layers.get(k, 3) * v for k, v in weights.items())
    return round(total, 2)

def get_day_of_week(date_str: str) -> int:
    return datetime.strptime(date_str, "%Y-%m-%d").weekday()

async def transcribe_voice_note(voice_base64: str) -> str:
    """Transcribe voice note using OpenAI Whisper via Emergent"""
    if not EMERGENT_LLM_KEY or not voice_base64:
        return ""
    
    try:
        # Use LLM to simulate transcription (in production, use actual Whisper API)
        # For now, we'll use a workaround - describe what a voice note might contain
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"transcribe-{uuid.uuid4()}",
            system_message="""You are helping transcribe a voice note. 
Since the actual audio cannot be processed here, generate a realistic placeholder transcription 
that would be typical for a mood tracking app voice note. 
Keep it brief (1-3 sentences) about feelings, activities, or thoughts.
Just return the transcription text, nothing else."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(
            text="Generate a realistic voice note transcription for a mood tracking journal entry."
        ))
        return response.strip()
    except Exception as e:
        logging.error(f"Error transcribing voice: {e}")
        return ""

async def analyze_note_content(content: str, has_voice: bool = False, has_image: bool = False) -> dict:
    """Analyze note content and generate summary, keywords, and suggested reminder"""
    if not EMERGENT_LLM_KEY or not content:
        return {"summary": None, "keywords": [], "suggested_reminder": None}
    
    try:
        today = datetime.utcnow().date()
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"note-analysis-{uuid.uuid4()}",
            system_message=f"""Analyze this note and provide:
1. A brief 1-2 sentence summary
2. 3-5 keywords/themes
3. A suggested reminder date if the note mentions any deadlines, plans, goals, or things to remember. 
   Today is {today.isoformat()}. Suggest dates in YYYY-MM-DD format.
   If no reminder is needed, set suggested_reminder to null.

Respond ONLY in valid JSON format:
{{"summary": "...", "keywords": ["...", "..."], "suggested_reminder": "YYYY-MM-DD or null", "reminder_reason": "why this reminder date"}}"""
        ).with_model("openai", "gpt-4o")
        
        media_context = ""
        if has_voice:
            media_context += " [Note includes voice recording]"
        if has_image:
            media_context += " [Note includes image attachment]"
        
        response = await chat.send_message(UserMessage(text=f"Analyze this note:{media_context}\n\n{content}"))
        
        # Parse JSON response
        try:
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]
            
            result = json.loads(json_str.strip())
            return {
                "summary": result.get("summary", ""),
                "keywords": result.get("keywords", []),
                "suggested_reminder": result.get("suggested_reminder"),
                "reminder_reason": result.get("reminder_reason", "")
            }
        except:
            return {"summary": response[:200], "keywords": [], "suggested_reminder": None}
    except Exception as e:
        logging.error(f"Error analyzing note: {e}")
        return {"summary": None, "keywords": [], "suggested_reminder": None}

async def get_mood_context(days: int = 7) -> str:
    """Get mood data context for the chatbot"""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {"date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}}
    moods = await db.moods.find(query).sort([("date", -1), ("time_of_day", 1)]).to_list(100)
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    if not moods:
        return "No mood data recorded recently."
    
    context_parts = [f"Mood data for the past {days} days:"]
    by_date = defaultdict(list)
    for mood in moods:
        by_date[mood["date"]].append(mood)
    
    all_composites = []
    for date_str, day_moods in sorted(by_date.items(), reverse=True):
        day_name = DAY_NAMES[get_day_of_week(date_str)]
        context_parts.append(f"\n{date_str} ({day_name}):")
        
        for mood in day_moods:
            layers = mood.get("layers", {})
            composite = calculate_composite_score(layers)
            all_composites.append(composite)
            time_label = mood["time_of_day"].capitalize()
            note_text = f" - Note: {mood.get('note')}" if mood.get('note') else ""
            context_parts.append(
                f"  {time_label}: Overall={layers.get('overall', 3)}, Energy={layers.get('energy', 3)}, "
                f"Stress={layers.get('stress', 3)}, Productivity={layers.get('productivity', 3)}, "
                f"Social={layers.get('social', 3)} (Composite: {composite:.1f}){note_text}"
            )
    
    if all_composites:
        avg = sum(all_composites) / len(all_composites)
        context_parts.append(f"\nAverage composite: {avg:.2f}/5.0 over {len(all_composites)} entries")
    
    return "\n".join(context_parts)

async def get_notes_context(days: int = 30) -> str:
    """Get notes context for the chatbot"""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    notes = await db.notes.find({
        "created_at": {"$gte": start_date}
    }).sort("created_at", -1).to_list(50)
    
    if not notes:
        return "No notes recorded."
    
    context_parts = [f"\nUSER'S NOTES (past {days} days):"]
    
    for note in notes:
        date_str = note.get("created_at", datetime.utcnow()).strftime("%Y-%m-%d %H:%M")
        title = note.get("title", "Untitled")
        text = note.get("text_content", "")
        transcription = note.get("voice_transcription", "")
        ai_summary = note.get("ai_summary", "")
        keywords = note.get("ai_keywords", [])
        has_voice = bool(note.get("voice_base64"))
        has_image = bool(note.get("image_base64"))
        reminder = note.get("reminder_date")
        
        context_parts.append(f"\n📝 {date_str} - {title}")
        if text:
            context_parts.append(f"   Content: {text[:300]}{'...' if len(text) > 300 else ''}")
        if transcription:
            context_parts.append(f"   Voice Transcription: {transcription}")
        if ai_summary:
            context_parts.append(f"   AI Summary: {ai_summary}")
        if keywords:
            context_parts.append(f"   Keywords: {', '.join(keywords)}")
        if has_voice:
            context_parts.append(f"   [Has voice recording]")
        if has_image:
            context_parts.append(f"   [Has image attachment]")
        if reminder:
            context_parts.append(f"   ⏰ Reminder: {reminder}")
    
    return "\n".join(context_parts)

async def generate_daily_summary() -> str:
    """Generate end-of-day summary"""
    today = datetime.utcnow().date().isoformat()
    
    # Get today's moods
    moods = await db.moods.find({"date": today}).to_list(10)
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    # Get today's notes
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    notes = await db.notes.find({"created_at": {"$gte": start_of_day}}).to_list(20)
    
    if not moods and not notes:
        return "📊 Daily Summary\n\nNo mood data or notes recorded today. Take a moment to check in with yourself!"
    
    context = f"Today's data ({today}):\n"
    
    if moods:
        context += "\nMoods:\n"
        for mood in moods:
            layers = mood.get("layers", {})
            composite = calculate_composite_score(layers)
            context += f"- {mood['time_of_day'].capitalize()}: Composite {composite:.1f}/5\n"
    
    if notes:
        context += f"\nNotes ({len(notes)} total):\n"
        for note in notes:
            title = note.get("title", "Untitled")
            text_content = note.get("text_content") or ""
            summary = note.get("ai_summary") or text_content[:100]
            context += f"- {title}: {summary}\n"
    
    if not EMERGENT_LLM_KEY:
        return f"📊 Daily Summary\n\n{context}"
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"daily-summary-{uuid.uuid4()}",
            system_message="""Generate a warm, supportive end-of-day summary. Include:
1. Overall mood trend for today
2. Key highlights from notes
3. One reflection or encouragement
Keep it under 150 words."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=context))
        return f"📊 Daily Summary\n\n{response}"
    except Exception as e:
        logging.error(f"Error generating daily summary: {e}")
        return f"📊 Daily Summary\n\n{context}"

async def generate_weekly_summary() -> str:
    """Generate weekly summary"""
    mood_context = await get_mood_context(days=7)
    notes_context = await get_notes_context(days=7)
    
    # Get pending reminders
    today = datetime.utcnow().date().isoformat()
    pending = await db.notes.find({
        "reminder_date": {"$lte": today},
        "reminder_sent": {"$ne": True}
    }).to_list(10)
    
    pending_text = ""
    if pending:
        pending_text = "\n\nPENDING REMINDERS:\n"
        for note in pending:
            pending_text += f"- {note.get('title', 'Note')}: {note.get('ai_summary', '')[:100]}\n"
    
    if "No mood data" in mood_context and "No notes" in notes_context:
        return "📊 Weekly Summary\n\nNo data recorded this week. Start tracking to get insights!"
    
    if not EMERGENT_LLM_KEY:
        return f"📊 Weekly Summary\n\n{mood_context}\n{notes_context}{pending_text}"
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weekly-summary-{uuid.uuid4()}",
            system_message="""Generate a comprehensive weekly summary:
1. Mood trends and patterns
2. Key themes from notes
3. Any pending reminders to address
4. Connections between moods and notes
5. One actionable insight
Keep it under 250 words, warm and encouraging."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(
            text=f"{mood_context}\n{notes_context}{pending_text}"
        ))
        return f"📊 Weekly Mood & Notes Summary\n\n{response}"
    except Exception as e:
        logging.error(f"Error generating weekly summary: {e}")
        return f"📊 Weekly Summary\n\n{mood_context}"

async def learn_from_notes(user_id: str = "default_user"):
    """Analyze all user notes and extract tasks, topics, and patterns"""
    if not EMERGENT_LLM_KEY:
        return
    
    # Get all notes
    notes = await db.notes.find({}).sort("created_at", -1).to_list(100)
    if not notes:
        return
    
    # Get existing context
    existing_context = await db.user_context.find_one({"user_id": user_id})
    
    # Prepare notes content for analysis
    notes_text = ""
    tasks_notes = []
    for note in notes:
        category = note.get("category", "przemyslenia")
        title = note.get("title", "")
        content = note.get("text_content", "")
        date = note.get("created_at", datetime.utcnow()).strftime("%Y-%m-%d")
        
        notes_text += f"\n[{date}] ({category}) {title}: {content}\n"
        
        if category == "zadania":
            tasks_notes.append({
                "note_id": note.get("id"),
                "title": title,
                "content": content[:200],
                "date_mentioned": date
            })
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"learn-context-{uuid.uuid4()}",
            system_message="""Analyze user's notes and extract:
1. Main topics/themes the user discusses (max 10)
2. Any pending/future tasks mentioned (with approximate due dates if mentioned)
3. User patterns or preferences you notice

Respond in JSON:
{
    "topics": ["topic1", "topic2"],
    "pending_tasks": [{"task": "description", "due_date": "YYYY-MM-DD or null", "source": "from note about..."}],
    "insights": "Brief observation about user patterns"
}"""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=notes_text))
        
        # Parse response
        try:
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]
            
            result = json.loads(json_str.strip())
            
            # Update or create context
            context_data = {
                "user_id": user_id,
                "learned_topics": result.get("topics", []),
                "pending_tasks": result.get("pending_tasks", []),
                "insights": result.get("insights", ""),
                "updated_at": datetime.utcnow()
            }
            
            if existing_context:
                await db.user_context.update_one(
                    {"user_id": user_id},
                    {"$set": context_data}
                )
            else:
                context_data["id"] = str(uuid.uuid4())
                await db.user_context.insert_one(context_data)
                
        except Exception as e:
            logging.error(f"Error parsing context: {e}")
    except Exception as e:
        logging.error(f"Error learning from notes: {e}")

async def generate_comprehensive_daily_summary(user_id: str = "default_user") -> dict:
    """Generate comprehensive daily summary with mood comparison, notes, and pending tasks"""
    today = datetime.utcnow().date()
    today_str = today.isoformat()
    
    # Get today's moods
    today_moods = await db.moods.find({"date": today_str}).to_list(10)
    today_moods = [m for m in today_moods if "time_of_day" in m and "layers" in m]
    
    # Get weekly mood data for comparison
    week_start = (today - timedelta(days=7)).isoformat()
    week_moods = await db.moods.find({
        "date": {"$gte": week_start, "$lt": today_str}
    }).to_list(100)
    week_moods = [m for m in week_moods if "time_of_day" in m and "layers" in m]
    
    # Calculate today's average
    today_composite = 0
    if today_moods:
        today_composite = sum(calculate_composite_score(m["layers"]) for m in today_moods) / len(today_moods)
    
    # Calculate weekly average
    week_composite = 0
    if week_moods:
        week_composite = sum(calculate_composite_score(m["layers"]) for m in week_moods) / len(week_moods)
    
    # Get today's notes
    start_of_day = datetime.combine(today, datetime.min.time())
    today_notes = await db.notes.find({"created_at": {"$gte": start_of_day}}).to_list(50)
    
    # Get pending tasks from context
    user_context = await db.user_context.find_one({"user_id": user_id})
    pending_tasks = user_context.get("pending_tasks", []) if user_context else []
    
    # Get tasks from "zadania" category
    zadania_notes = await db.notes.find({"category": "zadania"}).sort("created_at", -1).to_list(20)
    
    # Build summary data
    summary_data = {
        "date": today_str,
        "mood_today": {
            "entries": len(today_moods),
            "average_score": round(today_composite, 1),
            "moods": [
                {
                    "time": m["time_of_day"],
                    "score": calculate_composite_score(m["layers"]),
                    "note": m.get("note", "")
                } for m in today_moods
            ]
        },
        "mood_comparison": {
            "today_avg": round(today_composite, 1),
            "week_avg": round(week_composite, 1),
            "difference": round(today_composite - week_composite, 1),
            "trend": "up" if today_composite > week_composite else ("down" if today_composite < week_composite else "stable")
        },
        "notes_today": [
            {
                "id": n.get("id"),
                "title": n.get("title", ""),
                "content": n.get("text_content", "")[:150],
                "category": n.get("category", "przemyslenia"),
                "time": n.get("created_at", datetime.utcnow()).strftime("%H:%M")
            } for n in today_notes
        ],
        "pending_tasks": pending_tasks[:5],
        "zadania_notes": [
            {
                "title": n.get("title", ""),
                "content": n.get("text_content", "")[:100],
                "date": n.get("created_at", datetime.utcnow()).strftime("%Y-%m-%d")
            } for n in zadania_notes[:5]
        ],
        "ai_summary": None
    }
    
    # Generate AI summary
    if EMERGENT_LLM_KEY and (today_moods or today_notes):
        try:
            context = f"""
Dzisiejsze dane ({today_str}):

NASTRÓJ:
- Wpisy: {len(today_moods)}
- Średni wynik: {today_composite:.1f}/5
- Porównanie z tygodniem: {week_composite:.1f}/5 (różnica: {today_composite - week_composite:+.1f})
{chr(10).join([f"- {m['time_of_day']}: {calculate_composite_score(m['layers']):.1f}/5" for m in today_moods])}

NOTATKI ({len(today_notes)}):
{chr(10).join([f"- [{n.get('category')}] {n.get('title', 'Bez tytułu')}: {n.get('text_content', '')[:100]}" for n in today_notes])}

ZADANIA DO WYKONANIA:
{chr(10).join([f"- {t.get('task', t.get('title', ''))}" for t in (pending_tasks + [{'title': n.get('title')} for n in zadania_notes])[:5]])}
"""
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"daily-summary-{uuid.uuid4()}",
                system_message="""Jesteś pomocnym asystentem nastroju. Wygeneruj ciepłe, wspierające podsumowanie dnia w języku polskim.

Uwzględnij:
1. 📊 Jak wyglądał nastrój dzisiaj w porównaniu do poprzednich dni
2. 📝 Najważniejsze rzeczy z notatek
3. ✅ Przypomnienie o zadaniach do wykonania (jeśli są)
4. 💡 Jedna pozytywna myśl lub zachęta na zakończenie

Pisz zwięźle (max 200 słów), ciepło i personalnie. Używaj emoji."""
            ).with_model("openai", "gpt-4o")
            
            response = await chat.send_message(UserMessage(text=context))
            summary_data["ai_summary"] = response.strip()
        except Exception as e:
            logging.error(f"Error generating AI summary: {e}")
    
    # Save summary to database
    summary_doc = DailySummary(
        date=today_str,
        mood_summary=f"Średni nastrój: {today_composite:.1f}/5",
        mood_comparison=f"{'Lepiej' if today_composite > week_composite else 'Gorzej' if today_composite < week_composite else 'Tak samo'} niż w poprzednich dniach",
        notes_summary=f"{len(today_notes)} notatek dzisiaj",
        pending_tasks=pending_tasks[:5],
        ai_insights=summary_data.get("ai_summary", "")
    )
    
    await db.daily_summaries.update_one(
        {"date": today_str},
        {"$set": summary_doc.dict()},
        upsert=True
    )
    
    return summary_data

# Routes
@api_router.get("/")
async def root():
    return {"message": "Mood Tracker API v4.0 - Notes Library & Smart Reminders"}

@api_router.get("/mood-layers")
async def get_mood_layers():
    return MOOD_LAYERS

# Mood endpoints
@api_router.post("/moods", response_model=MoodEntry)
async def create_mood(input: MoodEntryCreate):
    if input.time_of_day not in TIME_OF_DAY_OPTIONS:
        raise HTTPException(status_code=400, detail=f"time_of_day must be one of {TIME_OF_DAY_OPTIONS}")
    
    existing = await db.moods.find_one({"date": input.date, "time_of_day": input.time_of_day})
    
    if existing:
        update_data = input.dict()
        update_data["timestamp"] = datetime.utcnow()
        update_data["layers"] = input.layers.dict()
        await db.moods.update_one(
            {"date": input.date, "time_of_day": input.time_of_day},
            {"$set": update_data}
        )
        updated = await db.moods.find_one({"date": input.date, "time_of_day": input.time_of_day})
        return MoodEntry(**updated)
    
    mood_dict = input.dict()
    mood_dict["layers"] = input.layers.dict()
    mood_obj = MoodEntry(**mood_dict)
    await db.moods.insert_one(mood_obj.dict())
    return mood_obj

@api_router.get("/moods", response_model=List[MoodEntry])
async def get_moods(start_date: Optional[str] = None, end_date: Optional[str] = None, time_of_day: Optional[str] = None):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    if time_of_day and time_of_day in TIME_OF_DAY_OPTIONS:
        query["time_of_day"] = time_of_day
    
    moods = await db.moods.find(query).sort([("date", -1), ("time_of_day", 1)]).to_list(1000)
    return [MoodEntry(**mood) for mood in moods if "time_of_day" in mood and "layers" in mood]

@api_router.get("/moods/date/{date_str}")
async def get_moods_by_date(date_str: str):
    moods = await db.moods.find({"date": date_str}).sort("time_of_day", 1).to_list(3)
    result = {tod: None for tod in TIME_OF_DAY_OPTIONS}
    for mood in moods:
        if "time_of_day" in mood and "layers" in mood:
            result[mood["time_of_day"]] = MoodEntry(**mood)
    return result

@api_router.delete("/moods/{mood_id}")
async def delete_mood(mood_id: str):
    result = await db.moods.delete_one({"id": mood_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mood not found")
    return {"message": "Mood deleted successfully"}

@api_router.get("/moods/export/json")
async def export_moods(start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    moods = await db.moods.find(query).sort([("date", -1), ("time_of_day", 1)]).to_list(1000)
    valid_moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    return {
        "export_date": datetime.utcnow().isoformat(),
        "total_entries": len(valid_moods),
        "moods": [MoodEntry(**mood).dict() for mood in valid_moods]
    }

# Analytics endpoints
@api_router.get("/analytics/summary")
async def get_analytics_summary(days: int = 30):
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {"date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}}
    moods = await db.moods.find(query).to_list(1000)
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    if not moods:
        return {
            "period_days": days,
            "total_entries": 0,
            "average_layers": {k: 0 for k in MOOD_LAYERS.keys()},
            "average_composite": 0,
            "by_time_of_day": {},
            "by_day_of_week": {},
        }
    
    layer_sums = {k: 0 for k in MOOD_LAYERS.keys()}
    layer_counts = {k: 0 for k in MOOD_LAYERS.keys()}
    by_time = {tod: {k: [] for k in MOOD_LAYERS.keys()} for tod in TIME_OF_DAY_OPTIONS}
    by_day = {i: {k: [] for k in MOOD_LAYERS.keys()} for i in range(7)}
    composite_scores = []
    
    for mood in moods:
        layers = mood.get("layers", {})
        time_of_day = mood.get("time_of_day", "morning")
        day_of_week = get_day_of_week(mood["date"])
        
        composite = calculate_composite_score(layers)
        composite_scores.append(composite)
        
        for layer_key in MOOD_LAYERS.keys():
            value = layers.get(layer_key, 3)
            layer_sums[layer_key] += value
            layer_counts[layer_key] += 1
            by_time[time_of_day][layer_key].append(value)
            by_day[day_of_week][layer_key].append(value)
    
    avg_layers = {k: round(layer_sums[k] / max(layer_counts[k], 1), 2) for k in MOOD_LAYERS.keys()}
    avg_composite = round(sum(composite_scores) / len(composite_scores), 2) if composite_scores else 0
    
    time_avg = {}
    for tod in TIME_OF_DAY_OPTIONS:
        time_avg[tod] = {
            "layers": {k: round(sum(v) / len(v), 2) if v else 0 for k, v in by_time[tod].items()},
            "count": len(by_time[tod]["overall"])
        }
        time_avg[tod]["composite"] = calculate_composite_score(time_avg[tod]["layers"])
    
    day_avg = {}
    for i in range(7):
        day_avg[DAY_NAMES[i]] = {
            "layers": {k: round(sum(v) / len(v), 2) if v else 0 for k, v in by_day[i].items()},
            "count": len(by_day[i]["overall"])
        }
        day_avg[DAY_NAMES[i]]["composite"] = calculate_composite_score(day_avg[DAY_NAMES[i]]["layers"])
    
    return {
        "period_days": days,
        "total_entries": len(moods),
        "average_layers": avg_layers,
        "average_composite": avg_composite,
        "by_time_of_day": time_avg,
        "by_day_of_week": day_avg,
        "layer_definitions": MOOD_LAYERS
    }

@api_router.get("/analytics/compare")
async def compare_periods(current_days: int = 7):
    end_date = datetime.utcnow().date()
    current_start = end_date - timedelta(days=current_days)
    previous_start = current_start - timedelta(days=current_days)
    
    current_moods = await db.moods.find({
        "date": {"$gte": current_start.isoformat(), "$lte": end_date.isoformat()}
    }).to_list(1000)
    current_moods = [m for m in current_moods if "time_of_day" in m and "layers" in m]
    
    previous_moods = await db.moods.find({
        "date": {"$gte": previous_start.isoformat(), "$lt": current_start.isoformat()}
    }).to_list(1000)
    previous_moods = [m for m in previous_moods if "time_of_day" in m and "layers" in m]
    
    def calc_stats(moods):
        if not moods:
            return {"count": 0, "layers": {k: 0 for k in MOOD_LAYERS.keys()}, "composite": 0}
        layer_sums = {k: 0 for k in MOOD_LAYERS.keys()}
        for mood in moods:
            for k in MOOD_LAYERS.keys():
                layer_sums[k] += mood.get("layers", {}).get(k, 3)
        layer_avgs = {k: round(v / len(moods), 2) for k, v in layer_sums.items()}
        return {"count": len(moods), "layers": layer_avgs, "composite": calculate_composite_score(layer_avgs)}
    
    current_stats = calc_stats(current_moods)
    previous_stats = calc_stats(previous_moods)
    
    changes = {k: round(current_stats["layers"].get(k, 0) - previous_stats["layers"].get(k, 0), 2) for k in MOOD_LAYERS.keys()}
    changes["composite"] = round(current_stats["composite"] - previous_stats["composite"], 2)
    
    return {"period_days": current_days, "current": current_stats, "previous": previous_stats, "changes": changes}

# Note endpoints
@api_router.post("/notes", response_model=Note)
async def create_note(input: NoteCreate):
    """Create a new note - saved exactly as user writes it, no AI modification"""
    note_dict = input.dict()
    note_obj = Note(**note_dict)
    
    # Store note exactly as user created it - no AI modifications
    # AI analysis is available separately via /notes/{id}/analyze
    
    await db.notes.insert_one(note_obj.dict())
    return note_obj

@api_router.get("/notes", response_model=List[Note])
async def get_notes(
    limit: int = 50,
    offset: int = 0,
    tag: Optional[str] = None,
    has_reminder: Optional[bool] = None,
    search: Optional[str] = None
):
    """Get all notes with filters and pagination"""
    query = {}
    if tag:
        query["tags"] = tag
    if has_reminder is not None:
        if has_reminder:
            query["reminder_date"] = {"$ne": None}
        else:
            query["reminder_date"] = None
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"text_content": {"$regex": search, "$options": "i"}},
            {"voice_transcription": {"$regex": search, "$options": "i"}},
            {"ai_summary": {"$regex": search, "$options": "i"}},
            {"ai_keywords": {"$in": [search]}}
        ]
    
    notes = await db.notes.find(query).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    return [Note(**note) for note in notes]

@api_router.get("/notes/library")
async def get_notes_library(
    period: str = "all",  # all, week, month, year
    sort_by: str = "date",  # date, title
    tag: Optional[str] = None,
    category: Optional[str] = None  # "zadania" or "przemyslenia"
):
    """Get notes library with organization options"""
    query = {}
    
    if period != "all":
        now = datetime.utcnow()
        if period == "week":
            start = now - timedelta(days=7)
        elif period == "month":
            start = now - timedelta(days=30)
        elif period == "year":
            start = now - timedelta(days=365)
        else:
            start = now - timedelta(days=30)
        query["created_at"] = {"$gte": start}
    
    if tag:
        query["tags"] = tag
    
    if category:
        query["category"] = category
    
    sort_field = "created_at" if sort_by == "date" else "title"
    sort_dir = -1 if sort_by == "date" else 1
    
    notes = await db.notes.find(query).sort(sort_field, sort_dir).to_list(200)
    
    # Get all unique tags - optimized with projection
    all_notes_tags = await db.notes.find({}, {"tags": 1, "ai_keywords": 1}).to_list(1000)
    all_tags = set()
    for note in all_notes_tags:
        all_tags.update(note.get("tags", []))
        all_tags.update(note.get("ai_keywords", []))
    
    # Group by month for timeline view
    by_month = defaultdict(list)
    for note in notes:
        created = note.get("created_at", datetime.utcnow())
        month_key = created.strftime("%Y-%m")
        by_month[month_key].append(Note(**note))
    
    return {
        "total": len(notes),
        "notes": [Note(**note) for note in notes],
        "by_month": dict(by_month),
        "all_tags": sorted(list(all_tags)),
        "period": period
    }

@api_router.get("/notes/{note_id}", response_model=Note)
async def get_note(note_id: str):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return Note(**note)

@api_router.put("/notes/{note_id}", response_model=Note)
async def update_note(note_id: str, input: NoteUpdate):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = {k: v for k, v in input.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    if input.text_content:
        analysis = await analyze_note_content(input.text_content)
        update_data["ai_summary"] = analysis.get("summary")
        update_data["ai_keywords"] = analysis.get("keywords", [])
    
    await db.notes.update_one({"id": note_id}, {"$set": update_data})
    updated = await db.notes.find_one({"id": note_id})
    return Note(**updated)

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    result = await db.notes.delete_one({"id": note_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

@api_router.put("/notes/{note_id}/reminder")
async def update_note_reminder(note_id: str, reminder_date: Optional[str] = None, accept_suggestion: bool = False):
    """Update or accept suggested reminder for a note"""
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    if accept_suggestion and note.get("ai_suggested_reminder"):
        reminder_date = note.get("ai_suggested_reminder")
    
    await db.notes.update_one(
        {"id": note_id},
        {"$set": {"reminder_date": reminder_date, "reminder_sent": False, "updated_at": datetime.utcnow()}}
    )
    
    updated = await db.notes.find_one({"id": note_id})
    return Note(**updated)

@api_router.get("/notes/reminders/pending")
async def get_pending_reminders():
    """Get notes with pending reminders"""
    today = datetime.utcnow().date().isoformat()
    notes = await db.notes.find({
        "reminder_date": {"$lte": today},
        "$or": [{"reminder_sent": False}, {"reminder_sent": {"$exists": False}}]
    }).sort("reminder_date", 1).to_list(50)
    return [Note(**note) for note in notes]

@api_router.put("/notes/reminders/{note_id}/mark-sent")
async def mark_reminder_sent(note_id: str):
    """Mark a reminder as sent"""
    await db.notes.update_one(
        {"id": note_id},
        {"$set": {"reminder_sent": True}}
    )
    return {"message": "Reminder marked as sent"}

# Task completion and recurring tasks endpoints
@api_router.put("/tasks/{task_id}/complete")
async def complete_task(task_id: str):
    """Mark a task as completed"""
    task = await db.notes.find_one({"id": task_id, "category": "zadania"})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.notes.update_one(
        {"id": task_id},
        {"$set": {"is_completed": True, "completed_at": datetime.utcnow(), "updated_at": datetime.utcnow()}}
    )
    
    updated = await db.notes.find_one({"id": task_id})
    return Note(**updated)

@api_router.put("/tasks/{task_id}/uncomplete")
async def uncomplete_task(task_id: str):
    """Mark a task as not completed"""
    task = await db.notes.find_one({"id": task_id, "category": "zadania"})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.notes.update_one(
        {"id": task_id},
        {"$set": {"is_completed": False, "completed_at": None, "updated_at": datetime.utcnow()}}
    )
    
    updated = await db.notes.find_one({"id": task_id})
    return Note(**updated)

@api_router.get("/tasks/for-date/{date}")
async def get_tasks_for_date(date: str):
    """Get all tasks for a specific date, including recurring task instances"""
    # Get tasks scheduled for this date
    scheduled_tasks = await db.notes.find({
        "category": "zadania",
        "scheduled_date": date
    }).to_list(100)
    
    # Get tasks created on this date (without scheduled_date)
    target_date = datetime.strptime(date, "%Y-%m-%d")
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())
    
    created_tasks = await db.notes.find({
        "category": "zadania",
        "scheduled_date": {"$in": [None, ""]},
        "is_recurring": {"$ne": True},
        "created_at": {"$gte": start_of_day, "$lte": end_of_day}
    }).to_list(100)
    
    # Get recurring tasks that should appear on this date
    day_of_week = target_date.weekday()  # 0=Monday, 6=Sunday
    
    recurring_tasks = await db.notes.find({
        "category": "zadania",
        "is_recurring": True,
        "$or": [
            {"recurrence_end_date": {"$exists": False}},
            {"recurrence_end_date": None},
            {"recurrence_end_date": {"$gte": date}}
        ]
    }).to_list(100)
    
    result_tasks = []
    seen_ids = set()
    
    # Add scheduled tasks
    for task in scheduled_tasks:
        if "_id" in task:
            del task["_id"]
        if task.get("id") not in seen_ids:
            result_tasks.append(task)
            seen_ids.add(task.get("id"))
    
    # Add tasks created on this date
    for task in created_tasks:
        if "_id" in task:
            del task["_id"]
        if task.get("id") not in seen_ids:
            result_tasks.append(task)
            seen_ids.add(task.get("id"))
    
    # Check recurring tasks
    for task in recurring_tasks:
        task_created = task.get("created_at", datetime.utcnow())
        if isinstance(task_created, str):
            task_created = datetime.fromisoformat(task_created.replace("Z", "+00:00"))
        
        # Skip if task was created after target date
        if task_created.date() > target_date.date():
            continue
        
        pattern = task.get("recurrence_pattern", "daily")
        should_include = False
        
        if pattern == "daily":
            should_include = True
        elif pattern == "weekdays":
            should_include = day_of_week < 5  # Monday-Friday
        elif pattern == "weekly":
            # Same day of week as created
            should_include = task_created.weekday() == day_of_week
        elif pattern == "monthly":
            # Same day of month
            should_include = task_created.day == target_date.day
        elif pattern == "custom":
            recurrence_days = task.get("recurrence_days", [])
            should_include = day_of_week in recurrence_days
        
        if should_include:
            # Check if instance already exists for this date
            existing = await db.notes.find_one({
                "parent_task_id": task.get("id"),
                "scheduled_date": date
            })
            
            if existing:
                if "_id" in existing:
                    del existing["_id"]
                if existing.get("id") not in seen_ids:
                    result_tasks.append(existing)
                    seen_ids.add(existing.get("id"))
            else:
                # Create virtual instance (not saved yet)
                instance = task.copy()
                if "_id" in instance:
                    del instance["_id"]
                instance_id = f"{task.get('id')}_{date}"
                if instance_id not in seen_ids:
                    instance["id"] = instance_id
                    instance["scheduled_date"] = date
                    instance["parent_task_id"] = task.get("id")
                    instance["is_completed"] = False
                    instance["completed_at"] = None
                    result_tasks.append(instance)
                    seen_ids.add(instance_id)
    
    return result_tasks

@api_router.post("/tasks/generate-instances")
async def generate_recurring_instances(days_ahead: int = 7):
    """Generate task instances for recurring tasks for the next N days"""
    today = datetime.utcnow().date()
    generated = 0
    
    recurring_tasks = await db.notes.find({
        "category": "zadania",
        "is_recurring": True
    }).to_list(100)
    
    for task in recurring_tasks:
        pattern = task.get("recurrence_pattern", "daily")
        end_date_str = task.get("recurrence_end_date")
        task_created = task.get("created_at", datetime.utcnow())
        
        if isinstance(task_created, str):
            task_created = datetime.fromisoformat(task_created.replace("Z", "+00:00"))
        
        for day_offset in range(days_ahead):
            target_date = today + timedelta(days=day_offset)
            date_str = target_date.isoformat()
            
            # Check end date
            if end_date_str and date_str > end_date_str:
                continue
            
            # Check if task was created before target date
            if task_created.date() > target_date:
                continue
            
            # Check pattern
            day_of_week = target_date.weekday()
            should_generate = False
            
            if pattern == "daily":
                should_generate = True
            elif pattern == "weekdays":
                should_generate = day_of_week < 5
            elif pattern == "weekly":
                should_generate = task_created.weekday() == day_of_week
            elif pattern == "monthly":
                should_generate = task_created.day == target_date.day
            elif pattern == "custom":
                recurrence_days = task.get("recurrence_days", [])
                should_generate = day_of_week in recurrence_days
            
            if should_generate:
                # Check if instance already exists
                existing = await db.notes.find_one({
                    "parent_task_id": task.get("id"),
                    "scheduled_date": date_str
                })
                
                if not existing:
                    # Create instance
                    instance = Note(
                        title=task.get("title"),
                        text_content=task.get("text_content"),
                        category="zadania",
                        scheduled_date=date_str,
                        parent_task_id=task.get("id"),
                        is_completed=False,
                        is_recurring=False,  # Instance is not recurring itself
                        tags=task.get("tags", [])
                    )
                    await db.notes.insert_one(instance.dict())
                    generated += 1
    
    return {"message": f"Generated {generated} task instances", "days_ahead": days_ahead}

class ChatTaskModification(BaseModel):
    user_message: str
    session_id: Optional[str] = None

@api_router.post("/tasks/chat-modify")
async def modify_tasks_via_chat(input: ChatTaskModification):
    """Allow AI to modify tasks based on user's natural language request - supports advanced scheduling"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI not configured")
    
    # Get all tasks (both regular and recurring templates)
    all_tasks = await db.notes.find({
        "category": "zadania",
        "parent_task_id": {"$in": [None, ""]}  # Only get original tasks, not instances
    }).sort("created_at", -1).to_list(100)
    
    tasks_context = "AKTUALNE ZADANIA:\n"
    for task in all_tasks:
        status = "✓ wykonane" if task.get("is_completed") else "○ do zrobienia"
        recurring_info = ""
        if task.get("is_recurring"):
            pattern = task.get("recurrence_pattern", "")
            days = task.get("recurrence_days", [])
            time = task.get("scheduled_time", "")
            end = task.get("recurrence_end_date", "")
            recurring_info = f" 🔄 {pattern}"
            if days:
                day_names = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"]
                recurring_info += f" ({','.join([day_names[d] for d in days])})"
            if time:
                recurring_info += f" o {time}"
            if end:
                recurring_info += f" do {end}"
        scheduled = f" [data: {task.get('scheduled_date')}]" if task.get("scheduled_date") else ""
        time_info = f" [godz: {task.get('scheduled_time')}]" if task.get("scheduled_time") else ""
        tasks_context += f"- ID:{task.get('id')[:8]} | {status} | {task.get('title', task.get('text_content', '')[:30])}{recurring_info}{scheduled}{time_info}\n"
    
    today = datetime.utcnow().date()
    tomorrow = today + timedelta(days=1)
    next_week = today + timedelta(days=7)
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"task-modify-{uuid.uuid4()}",
            system_message=f"""Jesteś zaawansowanym asystentem planowania zadań. Użytkownik chce zmodyfikować swoje zadania w kalendarzu.

{tasks_context}

DZISIEJSZA DATA: {today.isoformat()}
JUTRO: {tomorrow.isoformat()}
ZA TYDZIEŃ: {next_week.isoformat()}

Na podstawie prośby użytkownika, określ jakie operacje wykonać. Odpowiedz TYLKO w formacie JSON:
{{
    "operations": [
        {{
            "action": "create",
            "title": "nazwa zadania",
            "text_content": "opis opcjonalny",
            "scheduled_date": "YYYY-MM-DD",
            "scheduled_time": "HH:MM lub null",
            "is_recurring": true/false,
            "recurrence_pattern": "daily|weekdays|weekly|monthly|custom",
            "recurrence_days": [0,1,2,3,4,5,6],
            "recurrence_end_date": "YYYY-MM-DD lub null"
        }},
        {{
            "action": "update",
            "task_id": "pierwsze 8 znaków ID",
            "title": "nowy tytuł lub null",
            "text_content": "nowy opis lub null",
            "scheduled_date": "nowa data lub null",
            "scheduled_time": "nowy czas lub null"
        }},
        {{
            "action": "reschedule",
            "task_id": "...",
            "new_date": "YYYY-MM-DD",
            "new_time": "HH:MM lub null"
        }},
        {{
            "action": "set_recurring",
            "task_id": "...",
            "recurrence_pattern": "daily|weekdays|weekly|monthly|custom",
            "recurrence_days": [0,1,2],
            "recurrence_end_date": "YYYY-MM-DD lub null",
            "scheduled_time": "HH:MM lub null"
        }},
        {{
            "action": "stop_recurring",
            "task_id": "..."
        }},
        {{"action": "delete", "task_id": "..."}},
        {{"action": "complete", "task_id": "..."}}
    ],
    "response": "Krótka, przyjazna odpowiedź po polsku opisująca co zostało zmienione"
}}

WZORCE POWTARZALNOŚCI:
- "daily" - codziennie
- "weekdays" - dni robocze (pon-pt), recurrence_days: [0,1,2,3,4]
- "weekly" - raz w tygodniu (w dzień utworzenia)
- "monthly" - raz w miesiącu
- "custom" - tylko wybrane dni, wymaga recurrence_days: [0=Pn, 1=Wt, 2=Śr, 3=Cz, 4=Pt, 5=So, 6=Nd]

PRZYKŁADY:
- "Dodaj codzienne zadanie o 8:00: weź leki" -> create z is_recurring=true, recurrence_pattern="daily", scheduled_time="08:00"
- "Przesuń wizytę na piątek o 14:00" -> reschedule z new_date i new_time
- "Niech wyprowadzanie psa będzie tylko w poniedziałki, środy i piątki" -> set_recurring z recurrence_pattern="custom", recurrence_days=[0,2,4]
- "Zadanie ma się powtarzać do końca miesiąca" -> set_recurring z recurrence_end_date
"""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=input.user_message))
        
        # Parse response
        json_str = response
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0]
        
        result = json.loads(json_str.strip())
        operations = result.get("operations", [])
        executed = []
        
        for op in operations:
            action = op.get("action")
            
            if action == "create":
                recurrence_days = op.get("recurrence_days", [])
                if op.get("recurrence_pattern") == "weekdays":
                    recurrence_days = [0, 1, 2, 3, 4]
                
                new_task = Note(
                    title=op.get("title"),
                    text_content=op.get("text_content"),
                    category="zadania",
                    is_recurring=op.get("is_recurring", False),
                    recurrence_pattern=op.get("recurrence_pattern"),
                    recurrence_days=recurrence_days,
                    recurrence_end_date=op.get("recurrence_end_date"),
                    scheduled_date=op.get("scheduled_date"),
                    scheduled_time=op.get("scheduled_time")
                )
                await db.notes.insert_one(new_task.dict())
                time_str = f" o {op.get('scheduled_time')}" if op.get('scheduled_time') else ""
                recurring_str = f" (powtarzalne: {op.get('recurrence_pattern')})" if op.get('is_recurring') else ""
                executed.append(f"Utworzono: {op.get('title')}{time_str}{recurring_str}")
            
            elif action == "update":
                task_id = op.get("task_id")
                update_data = {"updated_at": datetime.utcnow()}
                if op.get("title"):
                    update_data["title"] = op.get("title")
                if op.get("text_content"):
                    update_data["text_content"] = op.get("text_content")
                if op.get("scheduled_date"):
                    update_data["scheduled_date"] = op.get("scheduled_date")
                if op.get("scheduled_time"):
                    update_data["scheduled_time"] = op.get("scheduled_time")
                
                await db.notes.update_one({"id": {"$regex": f"^{task_id}"}}, {"$set": update_data})
                executed.append(f"Zaktualizowano zadanie")
            
            elif action == "reschedule":
                task_id = op.get("task_id")
                update_data = {
                    "scheduled_date": op.get("new_date"),
                    "updated_at": datetime.utcnow()
                }
                if op.get("new_time"):
                    update_data["scheduled_time"] = op.get("new_time")
                
                await db.notes.update_one({"id": {"$regex": f"^{task_id}"}}, {"$set": update_data})
                time_str = f" o {op.get('new_time')}" if op.get('new_time') else ""
                executed.append(f"Przesunięto na {op.get('new_date')}{time_str}")
            
            elif action == "delete":
                task_id = op.get("task_id")
                # Delete main task and all instances
                await db.notes.delete_many({"$or": [
                    {"id": {"$regex": f"^{task_id}"}},
                    {"parent_task_id": {"$regex": f"^{task_id}"}}
                ]})
                executed.append(f"Usunięto zadanie")
            
            elif action == "complete":
                task_id = op.get("task_id")
                await db.notes.update_one(
                    {"id": {"$regex": f"^{task_id}"}},
                    {"$set": {"is_completed": True, "completed_at": datetime.utcnow()}}
                )
                executed.append(f"Oznaczono jako wykonane")
            
            elif action == "set_recurring":
                task_id = op.get("task_id")
                recurrence_days = op.get("recurrence_days", [])
                pattern = op.get("recurrence_pattern")
                if pattern == "weekdays":
                    recurrence_days = [0, 1, 2, 3, 4]
                
                update_data = {
                    "is_recurring": True,
                    "recurrence_pattern": pattern,
                    "recurrence_days": recurrence_days,
                    "recurrence_end_date": op.get("recurrence_end_date"),
                    "updated_at": datetime.utcnow()
                }
                if op.get("scheduled_time"):
                    update_data["scheduled_time"] = op.get("scheduled_time")
                
                await db.notes.update_one(
                    {"id": {"$regex": f"^{task_id}"}},
                    {"$set": update_data}
                )
                executed.append(f"Ustawiono powtarzanie: {pattern}")
            
            elif action == "stop_recurring":
                task_id = op.get("task_id")
                await db.notes.update_one(
                    {"id": {"$regex": f"^{task_id}"}},
                    {"$set": {
                        "is_recurring": False,
                        "recurrence_pattern": None,
                        "recurrence_days": [],
                        "updated_at": datetime.utcnow()
                    }}
                )
                executed.append(f"Zatrzymano powtarzanie")
        
        return {
            "success": True,
            "operations_executed": executed,
            "ai_response": result.get("response", "Zadania zostały zaktualizowane."),
            "raw_operations": operations
        }
        
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": "Nie udało się przetworzyć odpowiedzi AI",
            "ai_response": response if 'response' in dir() else str(e)
        }
    except Exception as e:
        logging.error(f"Error modifying tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/notes/summary/daily")
async def get_daily_notes_summary():
    """Get AI summary of today's notes"""
    summary = await generate_daily_summary()
    return {"summary": summary, "generated_at": datetime.utcnow().isoformat()}

@api_router.get("/notes/summary/weekly")
async def get_weekly_notes_summary():
    """Get AI summary of this week's notes with mood correlation"""
    summary = await generate_weekly_summary()
    return {"summary": summary, "generated_at": datetime.utcnow().isoformat()}

# Chat endpoints
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_mood_assistant(request: ChatRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI chat not configured")
    
    session_id = request.session_id or str(uuid.uuid4())
    
    mood_context = await get_mood_context(days=14)
    notes_context = await get_notes_context(days=30)
    
    # Get pending reminders
    today = datetime.utcnow().date().isoformat()
    pending = await db.notes.find({
        "reminder_date": {"$lte": today},
        "$or": [{"reminder_sent": False}, {"reminder_sent": {"$exists": False}}]
    }).to_list(10)
    
    reminders_text = ""
    if pending:
        reminders_text = "\n\n⏰ PENDING REMINDERS (mention these proactively):\n"
        for note in pending:
            title = note.get("title", "Note")
            summary = note.get("ai_summary", note.get("text_content", "")[:100])
            reminders_text += f"- {title}: {summary}\n"
    
    system_message = f"""Jesteś Asystentem Nastroju - współczującym, pomocnym asystentem śledzenia nastroju, który pamięta notatki i nastroje użytkownika.

{mood_context}

{notes_context}
{reminders_text}

TWOJE MOŻLIWOŚCI:
1. Analizuj wzorce nastroju i dostarczaj spostrzeżenia
2. Pamiętaj i odwołuj się do notatek użytkownika
3. Proaktywnie przypominaj o zadaniach do wykonania
4. Generuj podsumowania dzienne/tygodniowe na żądanie
5. Łącz nastroje z notatkami i znajduj wzorce
6. Dawaj empatyczne, konkretne sugestie

WAŻNE ZASADY:
- Jeśli użytkownik pyta o "podsumowanie dnia" lub "podsumuj dzień", daj kompleksowy przegląd dzisiejszych nastrojów i notatek
- Jeśli są zadania do wykonania, wspomnij o nich naturalnie w rozmowie
- Odwołuj się do konkretnych notatek, gdy to istotne
- Łącz zmiany nastroju z treścią notatek
- Odpowiadaj zawsze po polsku
- Bądź ciepły, wspierający i zwięzły
- Używaj emoji dla lepszej czytelności"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=request.message))
        
        # Store messages
        await db.chat_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "user",
            "content": request.message,
            "timestamp": datetime.utcnow()
        })
        await db.chat_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": "assistant",
            "content": response,
            "timestamp": datetime.utcnow()
        })
        
        return ChatResponse(message=response, session_id=session_id)
        
    except Exception as e:
        logging.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@api_router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, limit: int = 50):
    messages = await db.chat_messages.find({"session_id": session_id}).sort("timestamp", 1).limit(limit).to_list(limit)
    return [{"id": m.get("id"), "role": m.get("role"), "content": m.get("content"), "timestamp": m.get("timestamp")} for m in messages]

@api_router.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    result = await db.chat_messages.delete_many({"session_id": session_id})
    return {"deleted": result.deleted_count}

@api_router.get("/weekly-summary")
async def get_weekly_summary_endpoint():
    summary = await generate_weekly_summary()
    return {"summary": summary}

@api_router.get("/daily-summary")
async def get_daily_summary_endpoint():
    summary = await generate_daily_summary()
    return {"summary": summary}

# New comprehensive summary endpoint
@api_router.get("/summary/today")
async def get_today_summary():
    """Get comprehensive daily summary with mood comparison, notes, and pending tasks"""
    summary = await generate_comprehensive_daily_summary()
    return summary

@api_router.get("/summary/week")
async def get_week_summary():
    """Get comprehensive weekly summary"""
    mood_context = await get_mood_context(days=7)
    notes_context = await get_notes_context(days=7)
    user_context = await db.user_context.find_one({"user_id": "default_user"})
    
    # Get tasks from "zadania" category
    zadania_notes = await db.notes.find({"category": "zadania"}).sort("created_at", -1).to_list(20)
    
    pending_tasks = user_context.get("pending_tasks", []) if user_context else []
    
    if not EMERGENT_LLM_KEY:
        return {
            "mood_context": mood_context,
            "notes_context": notes_context,
            "pending_tasks": pending_tasks,
            "ai_summary": None
        }
    
    try:
        context = f"""
Dane z ostatniego tygodnia:

{mood_context}

{notes_context}

ZADANIA DO WYKONANIA:
{chr(10).join([f"- {t.get('task', t.get('title', ''))}" for t in (pending_tasks + [{'title': n.get('title')} for n in zadania_notes])[:10]])}
"""
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weekly-summary-{uuid.uuid4()}",
            system_message="""Jesteś pomocnym asystentem nastroju. Wygeneruj obszerne, ale przyjazne podsumowanie tygodnia w języku polskim.

Uwzględnij:
1. 📊 Ogólny trend nastroju z ostatniego tygodnia - co się poprawiło, co wymaga uwagi
2. 📈 Porównanie poszczególnych dni - który był najlepszy, który najtrudniejszy
3. 📝 Najważniejsze tematy z notatek - o czym użytkownik pisał
4. ✅ Lista zadań do wykonania w nadchodzącym tygodniu
5. 💡 Konkretne wskazówki jak poprawić nastrój w przyszłym tygodniu
6. 🎯 Jeden główny cel na następny tydzień

Pisz ciepło, wspierająco i personalnie. Używaj emoji. Max 400 słów."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=context))
        
        return {
            "period": "week",
            "pending_tasks": pending_tasks,
            "zadania_notes": [{"title": n.get("title"), "content": n.get("text_content", "")[:100]} for n in zadania_notes[:5]],
            "ai_summary": response.strip()
        }
    except Exception as e:
        logging.error(f"Error generating weekly summary: {e}")
        return {
            "mood_context": mood_context,
            "notes_context": notes_context,
            "ai_summary": None
        }

# User Settings endpoints
@api_router.get("/settings")
async def get_settings():
    """Get user settings"""
    settings = await db.user_settings.find_one({"user_id": "default_user"})
    if not settings:
        default_settings = UserSettings()
        await db.user_settings.insert_one(default_settings.dict())
        settings = default_settings.dict()
    else:
        # Remove MongoDB _id for serialization
        if "_id" in settings:
            del settings["_id"]
    return settings

@api_router.put("/settings")
async def update_settings(
    daily_notification_enabled: Optional[bool] = None,
    daily_notification_time: Optional[str] = None,
    weekly_notification_enabled: Optional[bool] = None,
    weekly_notification_day: Optional[int] = None,
    weekly_notification_time: Optional[str] = None
):
    """Update user settings"""
    update_data = {"updated_at": datetime.utcnow()}
    
    if daily_notification_enabled is not None:
        update_data["daily_notification_enabled"] = daily_notification_enabled
    if daily_notification_time is not None:
        update_data["daily_notification_time"] = daily_notification_time
    if weekly_notification_enabled is not None:
        update_data["weekly_notification_enabled"] = weekly_notification_enabled
    if weekly_notification_day is not None:
        update_data["weekly_notification_day"] = weekly_notification_day
    if weekly_notification_time is not None:
        update_data["weekly_notification_time"] = weekly_notification_time
    
    await db.user_settings.update_one(
        {"user_id": "default_user"},
        {"$set": update_data},
        upsert=True
    )
    
    # Get updated settings
    settings = await db.user_settings.find_one({"user_id": "default_user"})
    if settings and "_id" in settings:
        del settings["_id"]
    return settings

# User Context endpoints
@api_router.get("/context")
async def get_user_context():
    """Get learned user context"""
    context = await db.user_context.find_one({"user_id": "default_user"})
    return context or {"topics": [], "pending_tasks": [], "insights": ""}

@api_router.post("/context/learn")
async def learn_user_context():
    """Trigger learning from user's notes"""
    await learn_from_notes()
    context = await db.user_context.find_one({"user_id": "default_user"})
    return context or {"message": "Context learning started"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
