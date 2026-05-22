# Moodtracker — Project Context

## What this is
A full-stack mood tracking app with cross-platform support (iOS, Android, Web). UI is in Polish.

## Tech Stack
- **Frontend**: React Native + Expo (TypeScript), file-based routing via Expo Router
- **Backend**: FastAPI (Python, async), ~2,200 lines in `backend/server.py`
- **Database**: MongoDB (async via Motor)
- **AI/LLM**: Emergent LLM API (chat, note analysis, daily/weekly summaries)
- **Vector search**: ChromaDB (semantic note search) — currently in-memory only (data lost on restart)
- **Auth**: JWT (7-day tokens) + bcrypt
- **Push notifications**: Expo Push + APScheduler

## Running the app

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn backend.server:app --reload
```

### Frontend
```bash
cd frontend
yarn install
yarn start         # Expo dev server
yarn web           # Web
yarn android / yarn ios
```

## Required environment variables

**Backend** — create `backend/.env`:
```
MONGO_URL=mongodb+srv://...
DB_NAME=mood_tracker
JWT_SECRET=<secret>
EMERGENT_LLM_KEY=<api-key>
```

**Frontend** — create `frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=<backend-url>
```

## Key files
- `backend/server.py` — all 103 API endpoints in one file
- `frontend/app/(tabs)/index.tsx` — Today/Dashboard screen (mood entry)
- `frontend/app/(tabs)/notes.tsx` — Notes & Tasks screen (largest file, 1,800 lines)
- `frontend/app/(tabs)/trends.tsx` — Analytics/charts
- `frontend/app/(tabs)/chat.tsx` — AI chat assistant
- `frontend/app/(tabs)/calendar.tsx` — Monthly calendar view
- `frontend/app/(tabs)/settings.tsx` — Notification preferences
- `frontend/contexts/auth-context.tsx` — Auth state (JWT storage, API base URL)

## Database collections
`users_auth`, `moods`, `notes`, `chat_messages`, `daily_summaries`, `user_settings`, `user_context`, `push_tokens`

## Testing
- `backend_test.py`, `additional_tests.py`, `multi_user_isolation_test.py` — API test suites
- Tests hardcode `https://ai-mood-buddy-2.preview.emergentagent.com/api` as the target URL — update before running locally
- `tests/` directory exists but is empty

## Known issues / things to address
1. **No `.env` files or `.env.example`** — app crashes on startup without them; add examples to repo
2. **ChromaDB is ephemeral** — uses in-memory client, semantic search index lost on every restart; switch to persistent storage for production
3. **Voice transcription is simulated** — `transcribe_voice_note()` uses LLM generation as a placeholder, no real audio processing
4. **Hardcoded test URLs** — test files point to a remote preview URL, not localhost
5. **`server.py` is very large** — 2,200+ lines; splitting into routers would improve maintainability

## Mood data model
5 mood dimensions tracked per entry: Overall, Energy, Stress, Productivity, Social (each 1–5). Time-of-day slots: morning / midday / evening.
