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


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Time of day options
TIME_OF_DAY_OPTIONS = ["morning", "midday", "evening"]

# Mood layer definitions
MOOD_LAYERS = {
    "overall": {"name": "Overall Mood", "emoji": "😊", "description": "How you feel in general"},
    "energy": {"name": "Energy Level", "emoji": "⚡", "description": "Your physical and mental energy"},
    "stress": {"name": "Stress Level", "emoji": "😰", "description": "How stressed you feel (5=calm, 1=very stressed)"},
    "productivity": {"name": "Productivity", "emoji": "💪", "description": "How productive you've been"},
    "social": {"name": "Social Mood", "emoji": "👥", "description": "How social you feel"}
}

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Define Models
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

# Note Models
class NoteCreate(BaseModel):
    title: Optional[str] = None
    text_content: Optional[str] = None
    voice_base64: Optional[str] = None  # Base64 encoded audio
    image_base64: Optional[str] = None  # Base64 encoded image
    tags: List[str] = []
    mood_date: Optional[str] = None  # Link to specific mood date
    reminder_date: Optional[str] = None  # When to remind

class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = None
    text_content: Optional[str] = None
    voice_base64: Optional[str] = None
    image_base64: Optional[str] = None
    tags: List[str] = []
    mood_date: Optional[str] = None
    reminder_date: Optional[str] = None
    ai_summary: Optional[str] = None  # AI-generated summary
    ai_keywords: List[str] = []  # AI-extracted keywords
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    text_content: Optional[str] = None
    tags: Optional[List[str]] = None
    reminder_date: Optional[str] = None

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

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

async def analyze_note_with_ai(note_content: str) -> dict:
    """Use AI to analyze note and extract summary/keywords"""
    if not EMERGENT_LLM_KEY or not note_content:
        return {"summary": None, "keywords": []}
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"note-analysis-{uuid.uuid4()}",
            system_message="""Analyze this note and provide:
1. A brief 1-2 sentence summary
2. 3-5 keywords/themes

Respond in JSON format:
{"summary": "...", "keywords": ["...", "..."]}"""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=f"Analyze this note:\n\n{note_content}"))
        
        # Parse JSON response
        import json
        try:
            # Try to extract JSON from response
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]
            
            result = json.loads(json_str.strip())
            return {
                "summary": result.get("summary", ""),
                "keywords": result.get("keywords", [])
            }
        except:
            return {"summary": response[:200], "keywords": []}
    except Exception as e:
        logging.error(f"Error analyzing note: {e}")
        return {"summary": None, "keywords": []}

async def get_mood_context(days: int = 7) -> str:
    """Get mood data context for the chatbot"""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    
    moods = await db.moods.find(query).sort([("date", -1), ("time_of_day", 1)]).to_list(100)
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    if not moods:
        return "No mood data recorded in the past week."
    
    context_parts = [f"Mood data for the past {days} days:"]
    
    by_date = defaultdict(list)
    for mood in moods:
        by_date[mood["date"]].append(mood)
    
    all_composites = []
    layer_totals = {k: [] for k in MOOD_LAYERS.keys()}
    time_composites = {t: [] for t in TIME_OF_DAY_OPTIONS}
    day_composites = {i: [] for i in range(7)}
    
    for date_str, day_moods in sorted(by_date.items(), reverse=True):
        day_name = DAY_NAMES[get_day_of_week(date_str)]
        context_parts.append(f"\n{date_str} ({day_name}):")
        
        for mood in day_moods:
            layers = mood.get("layers", {})
            composite = calculate_composite_score(layers)
            all_composites.append(composite)
            time_composites[mood["time_of_day"]].append(composite)
            day_composites[get_day_of_week(date_str)].append(composite)
            
            for k in MOOD_LAYERS.keys():
                layer_totals[k].append(layers.get(k, 3))
            
            time_label = mood["time_of_day"].capitalize()
            note_text = f" - Note: {mood.get('note')}" if mood.get('note') else ""
            context_parts.append(
                f"  {time_label}: Overall={layers.get('overall', 3)}, Energy={layers.get('energy', 3)}, "
                f"Stress={layers.get('stress', 3)}, Productivity={layers.get('productivity', 3)}, "
                f"Social={layers.get('social', 3)} (Composite: {composite:.1f}){note_text}"
            )
    
    if all_composites:
        avg_composite = sum(all_composites) / len(all_composites)
        context_parts.append(f"\n\nSUMMARY STATISTICS:")
        context_parts.append(f"- Total entries: {len(moods)}")
        context_parts.append(f"- Days with data: {len(by_date)}")
        context_parts.append(f"- Average composite score: {avg_composite:.2f}/5.0")
        
        context_parts.append("\nLayer Averages:")
        for k, values in layer_totals.items():
            if values:
                avg = sum(values) / len(values)
                context_parts.append(f"  - {k.capitalize()}: {avg:.2f}")
        
        context_parts.append("\nBy Time of Day:")
        for t in TIME_OF_DAY_OPTIONS:
            if time_composites[t]:
                avg = sum(time_composites[t]) / len(time_composites[t])
                context_parts.append(f"  - {t.capitalize()}: {avg:.2f} avg ({len(time_composites[t])} entries)")
        
        context_parts.append("\nBy Day of Week:")
        for i, values in day_composites.items():
            if values:
                avg = sum(values) / len(values)
                context_parts.append(f"  - {DAY_NAMES[i]}: {avg:.2f} avg ({len(values)} entries)")
    
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
        ai_summary = note.get("ai_summary", "")
        keywords = note.get("ai_keywords", [])
        tags = note.get("tags", [])
        has_voice = bool(note.get("voice_base64"))
        has_image = bool(note.get("image_base64"))
        reminder = note.get("reminder_date")
        
        context_parts.append(f"\n📝 {date_str} - {title}")
        if text:
            context_parts.append(f"   Content: {text[:300]}{'...' if len(text) > 300 else ''}")
        if ai_summary:
            context_parts.append(f"   AI Summary: {ai_summary}")
        if keywords:
            context_parts.append(f"   Keywords: {', '.join(keywords)}")
        if tags:
            context_parts.append(f"   Tags: {', '.join(tags)}")
        if has_voice:
            context_parts.append(f"   [Has voice recording]")
        if has_image:
            context_parts.append(f"   [Has image attachment]")
        if reminder:
            context_parts.append(f"   ⏰ Reminder set for: {reminder}")
    
    return "\n".join(context_parts)

async def get_pending_reminders() -> List[dict]:
    """Get notes with pending reminders"""
    today = datetime.utcnow().date().isoformat()
    
    notes = await db.notes.find({
        "reminder_date": {"$lte": today}
    }).to_list(20)
    
    return notes

async def generate_weekly_summary() -> str:
    """Generate a weekly summary for notifications"""
    mood_context = await get_mood_context(days=7)
    notes_context = await get_notes_context(days=7)
    
    if "No mood data" in mood_context and "No notes" in notes_context:
        return "📊 Weekly Mood Summary\n\nNo mood data or notes recorded this week. Start tracking to get personalized insights!"
    
    if not EMERGENT_LLM_KEY:
        return "📊 Weekly Summary\n\n" + mood_context + "\n\n" + notes_context
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weekly-summary-{datetime.utcnow().isoformat()}",
            system_message="""You are a compassionate mood analysis assistant. Generate a weekly summary that:
1. Summarizes mood trends
2. Highlights key notes and their themes
3. Connects notes to mood patterns if relevant
4. Reminds about any important notes
5. Provides one actionable suggestion

Keep it under 200 words, warm and supportive tone. Use emojis sparingly."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(
            text=f"Generate a weekly summary:\n\n{mood_context}\n\n{notes_context}"
        ))
        
        return f"📊 Weekly Mood & Notes Summary\n\n{response}"
    except Exception as e:
        logging.error(f"Error generating weekly summary: {e}")
        return "📊 Weekly Summary\n\n" + mood_context

# Routes
@api_router.get("/")
async def root():
    return {"message": "Mood Tracker API v3.0 with Notes & AI"}

@api_router.get("/mood-layers")
async def get_mood_layers():
    return MOOD_LAYERS

# Mood endpoints
@api_router.post("/moods", response_model=MoodEntry)
async def create_mood(input: MoodEntryCreate):
    if input.time_of_day not in TIME_OF_DAY_OPTIONS:
        raise HTTPException(status_code=400, detail=f"time_of_day must be one of {TIME_OF_DAY_OPTIONS}")
    
    existing = await db.moods.find_one({
        "date": input.date,
        "time_of_day": input.time_of_day
    })
    
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
async def get_moods(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    time_of_day: Optional[str] = None
):
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
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
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
    
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    
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
    
    def calculate_period_stats(moods):
        if not moods:
            return {"count": 0, "layers": {k: 0 for k in MOOD_LAYERS.keys()}, "composite": 0}
        
        layer_sums = {k: 0 for k in MOOD_LAYERS.keys()}
        for mood in moods:
            layers = mood.get("layers", {})
            for k in MOOD_LAYERS.keys():
                layer_sums[k] += layers.get(k, 3)
        
        layer_avgs = {k: round(v / len(moods), 2) for k, v in layer_sums.items()}
        return {
            "count": len(moods),
            "layers": layer_avgs,
            "composite": calculate_composite_score(layer_avgs)
        }
    
    current_stats = calculate_period_stats(current_moods)
    previous_stats = calculate_period_stats(previous_moods)
    
    changes = {}
    for k in MOOD_LAYERS.keys():
        changes[k] = round(current_stats["layers"].get(k, 0) - previous_stats["layers"].get(k, 0), 2)
    changes["composite"] = round(current_stats["composite"] - previous_stats["composite"], 2)
    
    return {
        "period_days": current_days,
        "current": current_stats,
        "previous": previous_stats,
        "changes": changes
    }

# Note endpoints
@api_router.post("/notes", response_model=Note)
async def create_note(input: NoteCreate):
    """Create a new note with optional AI analysis"""
    note_dict = input.dict()
    note_obj = Note(**note_dict)
    
    # AI analysis for text content
    if input.text_content:
        analysis = await analyze_note_with_ai(input.text_content)
        note_obj.ai_summary = analysis.get("summary")
        note_obj.ai_keywords = analysis.get("keywords", [])
    
    await db.notes.insert_one(note_obj.dict())
    return note_obj

@api_router.get("/notes", response_model=List[Note])
async def get_notes(
    limit: int = 50,
    tag: Optional[str] = None,
    has_reminder: Optional[bool] = None
):
    """Get all notes with optional filters"""
    query = {}
    if tag:
        query["tags"] = tag
    if has_reminder is not None:
        if has_reminder:
            query["reminder_date"] = {"$ne": None}
        else:
            query["reminder_date"] = None
    
    notes = await db.notes.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [Note(**note) for note in notes]

@api_router.get("/notes/{note_id}", response_model=Note)
async def get_note(note_id: str):
    """Get a specific note"""
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return Note(**note)

@api_router.put("/notes/{note_id}", response_model=Note)
async def update_note(note_id: str, input: NoteUpdate):
    """Update a note"""
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = {k: v for k, v in input.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    # Re-analyze if text content changed
    if input.text_content:
        analysis = await analyze_note_with_ai(input.text_content)
        update_data["ai_summary"] = analysis.get("summary")
        update_data["ai_keywords"] = analysis.get("keywords", [])
    
    await db.notes.update_one({"id": note_id}, {"$set": update_data})
    updated = await db.notes.find_one({"id": note_id})
    return Note(**updated)

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    """Delete a note"""
    result = await db.notes.delete_one({"id": note_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

@api_router.get("/notes/reminders/pending")
async def get_pending_note_reminders():
    """Get notes with pending reminders"""
    today = datetime.utcnow().date().isoformat()
    notes = await db.notes.find({
        "reminder_date": {"$lte": today}
    }).to_list(20)
    return [Note(**note) for note in notes]

@api_router.get("/notes/summary")
async def get_notes_summary():
    """Get AI-generated summary of all notes"""
    notes_context = await get_notes_context(days=30)
    
    if "No notes" in notes_context:
        return {"summary": "No notes recorded yet."}
    
    if not EMERGENT_LLM_KEY:
        return {"summary": notes_context}
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"notes-summary-{uuid.uuid4()}",
            system_message="""Summarize the user's notes. Include:
1. Main themes and topics
2. Any important reminders
3. Patterns or recurring thoughts
Keep it concise and organized."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=f"Summarize these notes:\n\n{notes_context}"))
        return {"summary": response}
    except Exception as e:
        logging.error(f"Error generating notes summary: {e}")
        return {"summary": notes_context}

# Chat endpoints
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_mood_assistant(request: ChatRequest):
    """Chat with the AI mood assistant"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI chat not configured")
    
    session_id = request.session_id or str(uuid.uuid4())
    
    # Get contexts
    mood_context = await get_mood_context(days=14)
    notes_context = await get_notes_context(days=30)
    pending_reminders = await get_pending_reminders()
    
    reminders_text = ""
    if pending_reminders:
        reminders_text = "\n\nPENDING REMINDERS:\n"
        for note in pending_reminders:
            reminders_text += f"- {note.get('title', 'Note')}: {note.get('ai_summary', note.get('text_content', '')[:100])}\n"
    
    system_message = f"""You are MoodBuddy, a compassionate mood tracking assistant. You help users understand their mood patterns AND remember important notes they've saved.

CURRENT USER'S MOOD DATA:
{mood_context}

{notes_context}
{reminders_text}

YOUR ROLE:
1. Analyze mood data and provide insights
2. Remember and reference the user's notes when relevant
3. Remind them about notes with pending reminders
4. Connect notes to mood patterns when applicable
5. Provide empathetic and actionable suggestions
6. Help them reflect on their thoughts and feelings

GUIDELINES:
- Be warm, friendly, and conversational
- Reference specific notes when relevant to the conversation
- Proactively remind about pending reminders
- Connect mood patterns to note content when possible
- Keep responses concise but helpful
- Never replace professional mental health advice"""

    try:
        user_msg = ChatMessage(role="user", content=request.message)
        await db.chat_messages.insert_one({
            **user_msg.dict(),
            "session_id": session_id
        })
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(text=request.message))
        
        assistant_msg = ChatMessage(role="assistant", content=response)
        await db.chat_messages.insert_one({
            **assistant_msg.dict(),
            "session_id": session_id
        })
        
        return ChatResponse(message=response, session_id=session_id)
        
    except Exception as e:
        logging.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@api_router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, limit: int = 50):
    messages = await db.chat_messages.find(
        {"session_id": session_id}
    ).sort("timestamp", 1).limit(limit).to_list(limit)
    
    return [
        {
            "id": msg.get("id"),
            "role": msg.get("role"),
            "content": msg.get("content"),
            "timestamp": msg.get("timestamp")
        }
        for msg in messages
    ]

@api_router.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    result = await db.chat_messages.delete_many({"session_id": session_id})
    return {"deleted": result.deleted_count}

@api_router.get("/weekly-summary")
async def get_weekly_summary():
    summary = await generate_weekly_summary()
    return {"summary": summary}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
