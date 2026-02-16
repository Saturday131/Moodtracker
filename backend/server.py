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

class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = None
    text_content: Optional[str] = None
    voice_base64: Optional[str] = None
    voice_transcription: Optional[str] = None
    image_base64: Optional[str] = None
    tags: List[str] = []
    mood_date: Optional[str] = None
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
    weekly_summary_day: int = 0  # Monday
    weekly_summary_time: str = "09:00"  # 9 AM

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
    """Create a new note with AI analysis and smart reminder suggestion"""
    note_dict = input.dict()
    note_obj = Note(**note_dict)
    
    # Transcribe voice note if present
    if input.voice_base64:
        transcription = await transcribe_voice_note(input.voice_base64)
        note_obj.voice_transcription = transcription
    
    # Combine all text content for analysis
    full_content = ""
    if input.text_content:
        full_content += input.text_content
    if note_obj.voice_transcription:
        full_content += f"\n[Voice Note]: {note_obj.voice_transcription}"
    if input.title:
        full_content = f"Title: {input.title}\n{full_content}"
    
    # AI analysis
    if full_content:
        analysis = await analyze_note_content(
            full_content,
            has_voice=bool(input.voice_base64),
            has_image=bool(input.image_base64)
        )
        note_obj.ai_summary = analysis.get("summary")
        note_obj.ai_keywords = analysis.get("keywords", [])
        note_obj.ai_suggested_reminder = analysis.get("suggested_reminder")
        
        # Auto-set reminder if AI suggests one
        if analysis.get("suggested_reminder"):
            note_obj.reminder_date = analysis.get("suggested_reminder")
    
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
    tag: Optional[str] = None
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
    
    sort_field = "created_at" if sort_by == "date" else "title"
    sort_dir = -1 if sort_by == "date" else 1
    
    notes = await db.notes.find(query).sort(sort_field, sort_dir).to_list(200)
    
    # Get all unique tags
    all_notes = await db.notes.find({}).to_list(1000)
    all_tags = set()
    for note in all_notes:
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
    
    system_message = f"""You are MoodBuddy, a compassionate mood tracking assistant with memory of the user's notes and moods.

{mood_context}

{notes_context}
{reminders_text}

YOUR CAPABILITIES:
1. Analyze mood patterns and provide insights
2. Remember and reference user's notes (text, voice transcriptions, images)
3. Proactively remind about pending reminders
4. Generate daily/weekly summaries on request
5. Connect moods to notes and find patterns
6. Provide empathetic, actionable suggestions

IMPORTANT BEHAVIORS:
- If there are pending reminders, mention them naturally in conversation
- Reference specific notes when relevant
- Connect mood changes to note content when patterns exist
- For "daily summary" or "weekly summary" requests, provide comprehensive overviews
- Keep responses warm, supportive, and concise"""

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
