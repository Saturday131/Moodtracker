from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date
from bson import ObjectId


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class MoodEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mood_type: str  # great, good, okay, low, bad
    mood_value: int  # 5, 4, 3, 2, 1
    emoji: str  # 😄, 🙂, 😐, 😔, 😢
    note: Optional[str] = None
    date: str  # YYYY-MM-DD format
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class MoodEntryCreate(BaseModel):
    mood_type: str
    mood_value: int
    emoji: str
    note: Optional[str] = None
    date: str

class MoodEntryUpdate(BaseModel):
    mood_type: Optional[str] = None
    mood_value: Optional[int] = None
    emoji: Optional[str] = None
    note: Optional[str] = None

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Mood Tracker API"}

@api_router.post("/moods", response_model=MoodEntry)
async def create_mood(input: MoodEntryCreate):
    # Check if mood already exists for this date
    existing = await db.moods.find_one({"date": input.date})
    if existing:
        # Update existing mood
        update_data = input.dict()
        update_data["timestamp"] = datetime.utcnow()
        await db.moods.update_one({"date": input.date}, {"$set": update_data})
        updated = await db.moods.find_one({"date": input.date})
        return MoodEntry(**updated)
    
    # Create new mood
    mood_dict = input.dict()
    mood_obj = MoodEntry(**mood_dict)
    await db.moods.insert_one(mood_obj.dict())
    return mood_obj

@api_router.get("/moods", response_model=List[MoodEntry])
async def get_moods(start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    moods = await db.moods.find(query).sort("date", -1).to_list(1000)
    return [MoodEntry(**mood) for mood in moods]

@api_router.get("/moods/date/{date_str}", response_model=Optional[MoodEntry])
async def get_mood_by_date(date_str: str):
    mood = await db.moods.find_one({"date": date_str})
    if mood:
        return MoodEntry(**mood)
    return None

@api_router.get("/moods/{mood_id}", response_model=MoodEntry)
async def get_mood(mood_id: str):
    mood = await db.moods.find_one({"id": mood_id})
    if not mood:
        raise HTTPException(status_code=404, detail="Mood not found")
    return MoodEntry(**mood)

@api_router.put("/moods/{mood_id}", response_model=MoodEntry)
async def update_mood(mood_id: str, input: MoodEntryUpdate):
    mood = await db.moods.find_one({"id": mood_id})
    if not mood:
        raise HTTPException(status_code=404, detail="Mood not found")
    
    update_data = {k: v for k, v in input.dict().items() if v is not None}
    if update_data:
        update_data["timestamp"] = datetime.utcnow()
        await db.moods.update_one({"id": mood_id}, {"$set": update_data})
    
    updated = await db.moods.find_one({"id": mood_id})
    return MoodEntry(**updated)

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
    
    moods = await db.moods.find(query).sort("date", -1).to_list(1000)
    export_data = {
        "export_date": datetime.utcnow().isoformat(),
        "total_entries": len(moods),
        "moods": [MoodEntry(**mood).dict() for mood in moods]
    }
    return export_data

@api_router.get("/moods/stats/summary")
async def get_mood_stats(days: int = 30):
    from datetime import timedelta
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    
    moods = await db.moods.find(query).to_list(1000)
    
    if not moods:
        return {
            "period_days": days,
            "total_entries": 0,
            "average_mood": 0,
            "mood_distribution": {}
        }
    
    total = sum(m["mood_value"] for m in moods)
    avg = total / len(moods)
    
    distribution = {}
    for mood in moods:
        mood_type = mood["mood_type"]
        distribution[mood_type] = distribution.get(mood_type, 0) + 1
    
    return {
        "period_days": days,
        "total_entries": len(moods),
        "average_mood": round(avg, 2),
        "mood_distribution": distribution
    }

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
