# Mood Tracker App - PRD

## Problem Statement
Mobilna aplikacja do śledzenia nastroju (Expo + FastAPI + MongoDB) z polskim UI.

## Core Features
- Zapis nastrojów (Rano/Południe/Wieczór) z wielowarstwowym scoringiem
- Kalendarz z widokiem zadań na wybrany dzień
- AI Chatbot ("MoodBuddy") do analizy trendów
- Notatki kategoryzowane: Zadania / Przemyślenia
- System powtarzalnych zadań z zaawansowanym planowaniem
- Notatki multimedialne (głos, zdjęcia)
- Autoryzacja JWT z izolacją danych per użytkownik
- Wyszukiwanie semantyczne (ChromaDB)

## Architecture
- **Frontend**: Expo SDK 51, React Native, Expo Router
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **Auth**: JWT (PyJWT + bcrypt/passlib), AuthProvider context
- **Vector DB**: ChromaDB (all-MiniLM-L6-v2, lokalne embeddingi)
- **AI**: OpenAI GPT via Emergent LLM Key
- **Background Jobs**: apscheduler

## What's Implemented

### Completed (March 2026)
- [x] UI w języku polskim
- [x] Wpisy nastrojów z 5 warstwami (overall, energy, stress, productivity, social)
- [x] Kalendarz z nawigacją miesiąca i wskaźnikami nastroju/zadań
- [x] System notatek: Zadania + Przemyślenia (bez modyfikacji AI)
- [x] AI podsumowania dzienne
- [x] Ekran ustawień użytkownika
- [x] Zadania z checkboxem (complete/uncomplete)
- [x] Zadania powtarzalne (daily, weekdays, weekly, monthly, custom)
- [x] Modyfikacja zadań przez AI chat
- [x] Zaawansowane planowanie zadań (scheduled_time, recurrence_end_date, recurrence_days)

### Completed (April 2026)
- [x] Notatki głosowe — nagrywanie i zapis base64 w MongoDB, odtwarzanie
- [x] Notatki z obrazkami — wybór z galerii/aparat, zapis base64, podgląd
- [x] System autoryzacji JWT — rejestracja, logowanie, profil użytkownika
- [x] Baza wektorowa ChromaDB — embeddingi semantyczne notatek
- [x] Wyszukiwanie semantyczne — endpoint `/api/notes/search?q=...`
- [x] Izolacja danych per użytkownik

### Completed (May 2026)
- [x] **Popup kalendarza do wyboru daty** — modal z siatką dni, nawigacja miesięcy, format DD-MM-YYYY
- [x] **Scrollowalny picker godziny** — kolumny godz/min, przycisk "Potwierdź HH:MM"
- [x] **Podgląd nagrania głosowego** — przycisk play/pause przed zapisem notatki
- [x] **Pełna izolacja danych użytkowników (Multi-tenancy):**
  - Wszystkie endpointy (35+) wymagają JWT auth
  - Wszystkie zapytania MongoDB filtrują po `user_id`
  - Funkcje pomocnicze (get_mood_context, get_notes_context, generate_daily_summary, etc.) przyjmują `user_id`
  - Operacje chat-modify filtrują po `user_id` (create, update, delete, complete, reschedule, set_recurring)
  - Nowe instancje (recurring, chat-created) dziedziczą `user_id` od twórcy
  - Usunięto hardcoded "default_user" z kodu
- [x] **Indeksy wydajnościowe MongoDB:**
  - `users_auth`: unique na `email` i `id`
  - `moods`: compound `{user_id, date, time_of_day}`
  - `notes`: compound `{user_id, category, created_at}`, `{user_id, scheduled_date}`, `{user_id, is_recurring}`, unique `id`
  - `chat_messages`: compound `{user_id, session_id, timestamp}`
  - `daily_summaries`: compound unique `{user_id, date}`
  - `user_settings`: unique `user_id`
  - `user_context`: unique `user_id`
- [x] **Migracja osieroconych danych** — automatyczne czyszczenie dokumentów bez user_id na starcie
- [x] **Testy bezpieczeństwa** — 22/22 testów izolacji (cross-user attacks, auth enforcement, data isolation)

## Backlog

### P0
- [ ] Interpretacja AI multimediów do ChromaDB (transkrypcja audio Whisper + Vision dla zdjęć)

### P1
- [ ] Ponowne włączenie push notifications (backend-driven, np. FCM)

### P2
- [ ] Przywrócenie funkcji eksportu
- [ ] Podsumowania tygodniowe (rozbudowa)
- [ ] Refaktoryzacja server.py (routes/models)

## Key Files
- `backend/server.py` — cała logika backendowa (auth, CRUD, AI, ChromaDB, indeksy, migracja)
- `frontend/app/auth-context.tsx` — AuthProvider, useAuth hook
- `frontend/app/auth-screen.tsx` — ekran logowania/rejestracji
- `frontend/app/profile-modal.tsx` — modal profilu użytkownika
- `frontend/app/_layout.tsx` — nawigacja + auth guard
- `frontend/app/notes.tsx` — ekran notatek z formularzem tworzenia (pickery daty/czasu)
- `frontend/app/calendar.tsx` — kalendarz z listą zadań
- `frontend/app/chat.tsx` — AI chatbot
- `frontend/app/index.tsx` — ekran "Dziś"
- `frontend/app/settings.tsx` — ustawienia
