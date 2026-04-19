# Mood Tracker App - PRD

## Problem Statement
Mobilna aplikacja do śledzenia nastroju (Expo + FastAPI + MongoDB) z polskim UI.

## Core Features
- Zapis nastrojów (Rano/Południe/Wieczór) z wielowarstwowym scoringiem
- Kalendarz z widokiem zadań na wybrany dzień
- AI Chatbot ("MoodBuddy") do analizy trendów
- Notatki kategoryzowane: Zadania / Przemyślenia
- System powtarzalnych zadań z zaawansowanym planowaniem

## Architecture
- **Frontend**: Expo SDK 51, React Native, Expo Router
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **AI**: OpenAI GPT-4o via Emergent LLM Key
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
- [x] **Zaawansowane planowanie zadań (P0 - DONE)**:
  - Godzina zadania (scheduled_time)
  - Data końca powtarzania (recurrence_end_date)
  - Wybór dni tygodnia (recurrence_days) z wzorcem "custom"
  - UI: pola daty, godziny, selector dni, data końca
  - Wyświetlanie w kalendarzu: badge godziny + etykieta dni

## Backlog

### P1
- [x] Notatki głosowe — nagrywanie i zapis base64 w MongoDB, odtwarzanie w widoku szczegółowym
- [x] Notatki z obrazkami — wybór z galerii/aparat, zapis base64 w MongoDB, podgląd w szczegółach
- [ ] Transkrypcja audio i interpretacja AI zdjęć (następny krok)
- [ ] Ponowne włączenie push notifications (backend-driven, np. FCM)

### P2
- [ ] Przywrócenie funkcji eksportu
- [ ] Podsumowania tygodniowe (rozbudowa)
- [ ] Refaktoryzacja server.py (routes/models)

## Key Files
- `backend/server.py` — cała logika backendowa
- `frontend/app/notes.tsx` — ekran notatek z formularzem tworzenia
- `frontend/app/calendar.tsx` — kalendarz z listą zadań
- `frontend/app/chat.tsx` — AI chatbot
- `frontend/app/index.tsx` — ekran "Dziś"
- `frontend/app/settings.tsx` — ustawienia
