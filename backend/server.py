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
    stress: int = Field(ge=1, le=5, default=3)  # 5 = calm, 1 = stressed
    productivity: int = Field(ge=1, le=5, default=3)
    social: int = Field(ge=1, le=5, default=3)

class MoodEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD format
    time_of_day: str  # morning, midday, evening
    layers: MoodLayers
    note: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MoodEntryCreate(BaseModel):
    date: str
    time_of_day: str
    layers: MoodLayers
    note: Optional[str] = None

class MoodEntryUpdate(BaseModel):
    layers: Optional[MoodLayers] = None
    note: Optional[str] = None

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # user or assistant
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
    """Calculate weighted composite score from all layers"""
    weights = {"overall": 0.3, "energy": 0.2, "stress": 0.2, "productivity": 0.15, "social": 0.15}
    total = sum(layers.get(k, 3) * v for k, v in weights.items())
    return round(total, 2)

def get_day_of_week(date_str: str) -> int:
    """Get day of week (0=Monday, 6=Sunday)"""
    return datetime.strptime(date_str, "%Y-%m-%d").weekday()

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
    
    if not moods:
        return "No mood data recorded in the past week."
    
    # Build context string
    context_parts = [f"Mood data for the past {days} days:"]
    
    # Group by date
    by_date = defaultdict(list)
    for mood in moods:
        by_date[mood["date"]].append(mood)
    
    # Calculate overall stats
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
    
    # Summary statistics
    if all_composites:
        avg_composite = sum(all_composites) / len(all_composites)
        context_parts.append(f"\n\nSUMMARY STATISTICS:")
        context_parts.append(f"- Total entries: {len(moods)}")
        context_parts.append(f"- Days with data: {len(by_date)}")
        context_parts.append(f"- Average composite score: {avg_composite:.2f}/5.0")
        
        # Layer averages
        context_parts.append("\nLayer Averages:")
        for k, values in layer_totals.items():
            if values:
                avg = sum(values) / len(values)
                context_parts.append(f"  - {k.capitalize()}: {avg:.2f}")
        
        # Time of day patterns
        context_parts.append("\nBy Time of Day:")
        for t in TIME_OF_DAY_OPTIONS:
            if time_composites[t]:
                avg = sum(time_composites[t]) / len(time_composites[t])
                context_parts.append(f"  - {t.capitalize()}: {avg:.2f} avg ({len(time_composites[t])} entries)")
        
        # Day of week patterns
        context_parts.append("\nBy Day of Week:")
        for i, values in day_composites.items():
            if values:
                avg = sum(values) / len(values)
                context_parts.append(f"  - {DAY_NAMES[i]}: {avg:.2f} avg ({len(values)} entries)")
    
    return "\n".join(context_parts)

async def generate_weekly_summary() -> str:
    """Generate a weekly summary for notifications"""
    context = await get_mood_context(days=7)
    
    if "No mood data" in context:
        return "📊 Weekly Mood Summary\n\nNo mood data recorded this week. Start tracking your mood to get personalized insights!"
    
    # Use LLM to generate summary
    if not EMERGENT_LLM_KEY:
        return "📊 Weekly Summary\n\n" + context
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weekly-summary-{datetime.utcnow().isoformat()}",
            system_message="""You are a compassionate mood analysis assistant. Generate a brief, encouraging weekly mood summary.
Include:
1. Overall mood trend (improving, stable, needs attention)
2. Best and challenging times/days
3. One specific, actionable suggestion
Keep it under 150 words, warm and supportive tone. Use emojis sparingly."""
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(UserMessage(
            text=f"Generate a weekly mood summary based on this data:\n\n{context}"
        ))
        
        return f"📊 Weekly Mood Summary\n\n{response}"
    except Exception as e:
        logging.error(f"Error generating weekly summary: {e}")
        return "📊 Weekly Summary\n\n" + context

# Routes
@api_router.get("/")
async def root():
    return {"message": "Mood Tracker API v2.0 with AI Chat"}

@api_router.get("/mood-layers")
async def get_mood_layers():
    """Get available mood layers and their descriptions"""
    return MOOD_LAYERS

@api_router.post("/moods", response_model=MoodEntry)
async def create_mood(input: MoodEntryCreate):
    if input.time_of_day not in TIME_OF_DAY_OPTIONS:
        raise HTTPException(status_code=400, detail=f"time_of_day must be one of {TIME_OF_DAY_OPTIONS}")
    
    # Check if mood already exists for this date and time
    existing = await db.moods.find_one({
        "date": input.date,
        "time_of_day": input.time_of_day
    })
    
    if existing:
        # Update existing mood
        update_data = input.dict()
        update_data["timestamp"] = datetime.utcnow()
        update_data["layers"] = input.layers.dict()
        await db.moods.update_one(
            {"date": input.date, "time_of_day": input.time_of_day},
            {"$set": update_data}
        )
        updated = await db.moods.find_one({"date": input.date, "time_of_day": input.time_of_day})
        return MoodEntry(**updated)
    
    # Create new mood
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
    return [MoodEntry(**mood) for mood in moods]

@api_router.get("/moods/date/{date_str}")
async def get_moods_by_date(date_str: str):
    """Get all moods for a specific date (morning, midday, evening)"""
    moods = await db.moods.find({"date": date_str}).sort("time_of_day", 1).to_list(3)
    result = {tod: None for tod in TIME_OF_DAY_OPTIONS}
    for mood in moods:
        if "time_of_day" in mood and "layers" in mood:
            result[mood["time_of_day"]] = MoodEntry(**mood)
    return result

@api_router.get("/moods/date/{date_str}/time/{time_of_day}", response_model=Optional[MoodEntry])
async def get_mood_by_date_and_time(date_str: str, time_of_day: str):
    """Get mood for specific date and time of day"""
    if time_of_day not in TIME_OF_DAY_OPTIONS:
        raise HTTPException(status_code=400, detail=f"time_of_day must be one of {TIME_OF_DAY_OPTIONS}")
    
    mood = await db.moods.find_one({"date": date_str, "time_of_day": time_of_day})
    if mood and "layers" in mood:
        return MoodEntry(**mood)
    return None

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
    export_data = {
        "export_date": datetime.utcnow().isoformat(),
        "total_entries": len(valid_moods),
        "moods": [MoodEntry(**mood).dict() for mood in valid_moods]
    }
    return export_data

@api_router.get("/analytics/summary")
async def get_analytics_summary(days: int = 30):
    """Get comprehensive mood analytics"""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    
    moods = await db.moods.find(query).to_list(1000)
    # Filter valid moods
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    if not moods:
        return {
            "period_days": days,
            "total_entries": 0,
            "average_layers": {k: 0 for k in MOOD_LAYERS.keys()},
            "average_composite": 0,
            "by_time_of_day": {},
            "by_day_of_week": {},
            "trends": {}
        }
    
    # Calculate averages for each layer
    layer_sums = {k: 0 for k in MOOD_LAYERS.keys()}
    layer_counts = {k: 0 for k in MOOD_LAYERS.keys()}
    
    # By time of day
    by_time = {tod: {k: [] for k in MOOD_LAYERS.keys()} for tod in TIME_OF_DAY_OPTIONS}
    
    # By day of week
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
    
    # Calculate averages
    avg_layers = {k: round(layer_sums[k] / max(layer_counts[k], 1), 2) for k in MOOD_LAYERS.keys()}
    avg_composite = round(sum(composite_scores) / len(composite_scores), 2) if composite_scores else 0
    
    # Time of day averages
    time_avg = {}
    for tod in TIME_OF_DAY_OPTIONS:
        time_avg[tod] = {
            "layers": {k: round(sum(v) / len(v), 2) if v else 0 for k, v in by_time[tod].items()},
            "count": len(by_time[tod]["overall"])
        }
        time_avg[tod]["composite"] = calculate_composite_score(time_avg[tod]["layers"])
    
    # Day of week averages
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

@api_router.get("/analytics/trends")
async def get_trends(days: int = 30, layer: Optional[str] = None, time_of_day: Optional[str] = None):
    """Get detailed trend data for charts"""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    
    if time_of_day and time_of_day in TIME_OF_DAY_OPTIONS:
        query["time_of_day"] = time_of_day
    
    moods = await db.moods.find(query).sort([("date", 1), ("time_of_day", 1)]).to_list(1000)
    moods = [m for m in moods if "time_of_day" in m and "layers" in m]
    
    # Group by date
    daily_data = defaultdict(list)
    for mood in moods:
        daily_data[mood["date"]].append(mood)
    
    trends = []
    for date_str, day_moods in sorted(daily_data.items()):
        entry = {
            "date": date_str,
            "day_of_week": DAY_NAMES[get_day_of_week(date_str)],
            "entries": len(day_moods)
        }
        
        if layer and layer in MOOD_LAYERS:
            # Single layer trend
            values = [m["layers"].get(layer, 3) for m in day_moods]
            entry["value"] = round(sum(values) / len(values), 2) if values else 0
            entry["by_time"] = {
                m["time_of_day"]: m["layers"].get(layer, 3) for m in day_moods
            }
        else:
            # Composite and all layers
            layer_avgs = {}
            for lk in MOOD_LAYERS.keys():
                values = [m["layers"].get(lk, 3) for m in day_moods]
                layer_avgs[lk] = round(sum(values) / len(values), 2) if values else 0
            
            entry["layers"] = layer_avgs
            entry["composite"] = calculate_composite_score(layer_avgs)
            entry["by_time"] = {
                m["time_of_day"]: {
                    "layers": m["layers"],
                    "composite": calculate_composite_score(m["layers"])
                } for m in day_moods
            }
        
        trends.append(entry)
    
    return {
        "period_days": days,
        "filter_layer": layer,
        "filter_time": time_of_day,
        "data": trends
    }

@api_router.get("/analytics/compare")
async def compare_periods(current_days: int = 7):
    """Compare current period with previous period"""
    end_date = datetime.utcnow().date()
    current_start = end_date - timedelta(days=current_days)
    previous_start = current_start - timedelta(days=current_days)
    
    # Current period
    current_moods = await db.moods.find({
        "date": {
            "$gte": current_start.isoformat(),
            "$lte": end_date.isoformat()
        }
    }).to_list(1000)
    current_moods = [m for m in current_moods if "time_of_day" in m and "layers" in m]
    
    # Previous period
    previous_moods = await db.moods.find({
        "date": {
            "$gte": previous_start.isoformat(),
            "$lt": current_start.isoformat()
        }
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
    
    # Calculate changes
    changes = {}
    for k in MOOD_LAYERS.keys():
        curr = current_stats["layers"].get(k, 0)
        prev = previous_stats["layers"].get(k, 0)
        changes[k] = round(curr - prev, 2)
    
    changes["composite"] = round(
        current_stats["composite"] - previous_stats["composite"], 2
    )
    
    return {
        "period_days": current_days,
        "current": current_stats,
        "previous": previous_stats,
        "changes": changes
    }

# Chat endpoints
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_mood_assistant(request: ChatRequest):
    """Chat with the AI mood assistant"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI chat not configured")
    
    session_id = request.session_id or str(uuid.uuid4())
    
    # Get mood context
    mood_context = await get_mood_context(days=14)
    
    system_message = f"""You are a compassionate and insightful mood tracking assistant called MoodBuddy. You help users understand their mood patterns and provide supportive guidance.

CURRENT USER'S MOOD DATA:
{mood_context}

YOUR ROLE:
1. Analyze the user's mood data when asked
2. Identify patterns (time of day, day of week, specific layers)
3. Provide empathetic and actionable insights
4. Suggest gentle improvements without being preachy
5. Celebrate positive trends
6. Be supportive during difficult periods

GUIDELINES:
- Be warm, friendly, and conversational
- Use the actual data to back up your observations
- Keep responses concise but helpful (under 200 words usually)
- Use emojis sparingly for warmth
- If asked about something not in the data, acknowledge the limitation
- Focus on patterns and trends, not single data points
- Never diagnose or replace professional mental health advice

Remember: You have access to their mood data above. Reference specific dates, scores, and patterns when relevant."""

    try:
        # Store message in database
        user_msg = ChatMessage(role="user", content=request.message)
        await db.chat_messages.insert_one({
            **user_msg.dict(),
            "session_id": session_id
        })
        
        # Get chat history for context
        history = await db.chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", -1).limit(10).to_list(10)
        history.reverse()
        
        # Create chat instance
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        # Send message
        response = await chat.send_message(UserMessage(text=request.message))
        
        # Store assistant response
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
    """Get chat history for a session"""
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
    """Clear chat history for a session"""
    result = await db.chat_messages.delete_many({"session_id": session_id})
    return {"deleted": result.deleted_count}

@api_router.get("/weekly-summary")
async def get_weekly_summary():
    """Get AI-generated weekly mood summary"""
    summary = await generate_weekly_summary()
    return {"summary": summary}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
