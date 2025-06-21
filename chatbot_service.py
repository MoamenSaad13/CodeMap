# chatbot_service.py - Standalone FastAPI Chatbot Service

import pandas as pd
import faiss
import google.generativeai as genai
from sentence_transformers import SentenceTransformer
import numpy as np
import sys
import re
import os
from typing import List, Optional, Dict, Any
from beanie import Document, init_beanie
import motor.motor_asyncio
from pydantic import BaseModel, Field, ConfigDict
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uvicorn
import pymongo

# --- Load environment variables ---
load_dotenv()

# --- Application Settings ---
DATABASE_URI = os.getenv("DATABASE_URI")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MONGO_DATABASE_NAME = os.getenv("MONGO_DATABASE_NAME", "test")  # Default database name

# --- Model Settings ---
GEMINI_MODEL_NAME = "models/gemini-1.5-flash-latest"
EMBEDDING_MODEL_NAME = 'all-MiniLM-L6-v2'
FAISS_THRESHOLD = 0.7
TRACK_NAME_MATCH_THRESHOLD = 0.85

# --- Global variables to be populated at startup ---
df_tracks: Optional[pd.DataFrame] = None
official_track_names: List[str] = []
keyword_index: Optional[faiss.Index] = None
track_name_index: Optional[faiss.Index] = None
embedder_instance: Optional[SentenceTransformer] = None
gemini_model: Optional[genai.GenerativeModel] = None

# --- MongoDB Models ---
class Roadmap(Document):
    title: str
    requirments: str  # Note: keeping the typo from original schema
    target_audience: str

    class Settings:
        name = "roadmaps"

class ChatMessage(BaseModel):
    role: str
    content: str
    model_config = ConfigDict(from_attributes=True)

class ChatSession(Document):
    session_id: str = Field(..., unique=True)
    messages: List[ChatMessage] = Field(default_factory=list)
    last_suggested_roadmap: Optional[str] = None
    roadmap_confirmed: bool = False
    rejected_roadmaps: List[str] = Field(default_factory=list)

    class Settings:
        name = "chat_sessions"

# --- API Request/Response Models ---
class ChatRequest(BaseModel):
    session_id: str
    user_input: str

class ChatResponse(BaseModel):
    assistant_message: str
    session_id: str

# --- Helper Functions ---
async def load_roadmap_data_from_mongodb():
    global df_tracks, official_track_names, keyword_index, track_name_index, embedder_instance
    try:
        print("Loading roadmap data from MongoDB...")
        roadmaps = await Roadmap.find_all().to_list()
        if not roadmaps:
            print("Warning: No roadmap data found in MongoDB")
            df_tracks = pd.DataFrame(columns=["track", "keywords", "matching interests"])
            official_track_names = []
            return

        roadmap_data = []
        for roadmap in roadmaps:
            track_name = roadmap.title
            keywords = roadmap.requirments if roadmap.requirments else ""
            interests = roadmap.target_audience if roadmap.target_audience else ""
            roadmap_data.append([track_name, keywords, interests])

        df_tracks = pd.DataFrame(roadmap_data, columns=["track", "keywords", "matching interests"])
        official_track_names = df_tracks["track"].astype(str).tolist()
        keywords_list = df_tracks["keywords"].astype(str).tolist()
        matching_interests = df_tracks["matching interests"].astype(str).tolist()

        print(f"Found {len(official_track_names)} tracks from MongoDB.")

        all_texts_to_embed = keywords_list + matching_interests
        if any(t for t in all_texts_to_embed if t):
            print("Generating embeddings for keyword/interest FAISS index...")
            valid_texts = [t for t in all_texts_to_embed if t]
            if valid_texts:
                keyword_embeddings = embedder_instance.encode(valid_texts, normalize_embeddings=True)
                if keyword_embeddings.size > 0:
                    keyword_index = faiss.IndexFlatIP(keyword_embeddings.shape[1])
                    keyword_index.add(np.array(keyword_embeddings).astype("float32"))
                    print("Keyword/Interest FAISS index built successfully.")

        print("Generating embeddings for track name FAISS index...")
        valid_track_names = [t for t in official_track_names if t]
        if valid_track_names:
            track_name_embeddings = embedder_instance.encode(valid_track_names, normalize_embeddings=True)
            if track_name_embeddings.size > 0:
                track_name_index = faiss.IndexFlatIP(track_name_embeddings.shape[1])
                track_name_index.add(np.array(track_name_embeddings).astype("float32"))
                print("Track name FAISS index built successfully.")

    except Exception as e:
        print(f"Error loading roadmap data: {e}", file=sys.stderr)
        raise

def get_relevant_tracks_from_keywords(user_message: str) -> List[str]:
    if keyword_index is None or embedder_instance is None or not official_track_names:
        return []
    try:
        query_vec = embedder_instance.encode([user_message], normalize_embeddings=True)
        D, I = keyword_index.search(np.array(query_vec).astype("float32"), k=min(3, keyword_index.ntotal))
        results = []
        if I.ndim == 2 and I.size > 0:
            for i in range(I.shape[1]):
                score = D[0, i]
                index_hit = I[0, i]
                if score >= FAISS_THRESHOLD and index_hit >= 0:
                    track_idx = index_hit % len(official_track_names)
                    if 0 <= track_idx < len(official_track_names):
                        results.append(official_track_names[track_idx])
        return list(set(results))
    except Exception as e:
        print(f"Error during keyword FAISS search: {e}", file=sys.stderr)
        return []

def find_closest_official_track(suggested_track_name: str, threshold: float) -> Optional[str]:
    if track_name_index is None or embedder_instance is None or not suggested_track_name or not official_track_names:
        return None
    try:
        query_vec = embedder_instance.encode([suggested_track_name], normalize_embeddings=True)
        query_vec_float32 = np.array(query_vec).astype("float32")
        D, I = track_name_index.search(query_vec_float32, k=1)
        if I.ndim == 2 and I.size > 0 and D.ndim == 2 and D.size > 0:
            matched_index = I[0, 0]
            score = D[0, 0]
            if matched_index >= 0 and score >= threshold:
                if 0 <= matched_index < len(official_track_names):
                    return official_track_names[matched_index]
        return None
    except Exception as e:
        print(f"Error during track name FAISS search for '{suggested_track_name}': {e}", file=sys.stderr)
        return None

def extract_suggested_track(assistant_message: str) -> Optional[str]:
    match = re.search(r'\*\*(.*?)\*\*', assistant_message)
    if match:
        track_name = match.group(1).strip(" .:,!?")
        if len(track_name) > 3 and "track" not in track_name.lower() and "path" not in track_name.lower():
            return track_name
    match = re.search(r'recommend the\s+(.*?)\s+track', assistant_message, re.IGNORECASE)
    if match:
        return match.group(1).strip(" .:,!?")
    return None

def is_off_topic(user_input: str) -> bool:
    off_topic_keywords = [
        "كلمه عبيطه"
    ]
    learning_keywords = [
        "learn", "teach", "course", "track", "skill", "programming", "develop", "code",
        "study", "career", "tech", "data", "web", "mobile", "AI", "cloud", "security",
        "frontend", "backend", "fullstack", "devops", "cybersecurity", "blockchain",
        "game dev", "embedded", "iot", "ui/ux", "qa", "testing", "engineer", "analyst",
        "scientist", "developer", "path", "roadmap", "guide", "advice", "recommend",
        "tutorial", "lesson", "education", "training", "certification"
    ]
    user_input_lower = user_input.lower()
    has_learning_keyword = any(keyword in user_input_lower for keyword in learning_keywords)
    has_off_topic_keyword = any(keyword in user_input_lower for keyword in off_topic_keywords)
    if has_learning_keyword:
        return False
    if has_off_topic_keyword and not has_learning_keyword:
        return True
    return False

# --- System Prompt Template ---
SYSTEM_PROMPT_TEMPLATE = """
You are a professional and emotionally intelligent AI assistant guiding users to find the most suitable programming learning track *exclusively from our platform's database*. Your goal is to conduct a personalized, adaptive conversation — especially for users who may not even know what they're interested in yet.

**User Profile Context (use this to guide your conversation and recommendations):**
- User's experience level: {experience_level}
- User's technical interests: {technical_interests}
- User's personal goals: {personal_goals}
- Tracks user has previously rejected (DO NOT suggest these again): {rejected_tracks}

**Domain Restriction:** You MUST only engage with questions related to learning programming, technology skills, or educational tracks. If the user asks something unrelated (e.g., weather, recipes, jokes, sports scores), politely respond ONLY with: "I'm here to help you choose the best learning track. Unfortunately, I can't assist with this topic." Do not elaborate further.

**Conversation Flow & Behavior Rules:**
- Begin with warm, friendly energy. Start with light, friendly, indirect questions to discover the user's personality and preferences. For example:
    - "What kind of things do you enjoy doing in your free time?"
    - "Do you like solving problems, designing visuals, or organizing information?"
- If the user seems uncertain (e.g., replies like "I don't know" or "anything"), guide them gently with **multiple-choice questions** such as:
    - "Would you say you're more creative, analytical, or practical?"
    - "Are you more interested in building websites, mobile apps, or working with data?"

- **You MUST explore at least 3 dimensions before recommending any track.** Dimensions can include:
    1. Learning style (e.g., "Do you prefer videos, reading, or hands-on practice?")
    2. Learning speed (e.g., "Do you like to learn quickly, or take your time exploring?")
    3. Personal goal (e.g., "Do you want to build a portfolio, get a job, or explore for fun?")
  These should be phrased conversationally and naturally woven into the dialogue.

- When discussing creative interests like "designing visuals", DO NOT default only to UI/UX. Instead, offer a **diverse set of creative-tech options**, such as:
    - 🎮 Game Development
    - 🌐 Web Animation
    - 🎨 Creative Coding
    - 📱 Interactive Mobile Apps

- If a user **rejects a track**, respond with empathy and curiosity. You MUST ask a gentle follow-up like:
    - "Got it! Just to help me improve suggestions — was it too design-heavy, too technical, or something else?"
    - "علشان أقدر أرشح أفضل، ممكن أعرف إيه اللي مكنش مناسب في المسار ده؟" (Arabic)
    - "为了给您提供更好的建议，能告诉我这个课程有什么不适合您的地方吗？" (Chinese)

- When you identify a suitable track, **bold the track name** like this: "Based on your interests, I think the **Front-End Development** track would be perfect for you."

- After suggesting a track, **always ask if they'd like to know more** about it or if they'd prefer a different suggestion.

- If the user confirms interest in a track, provide a brief, enthusiastic summary of what they'll learn and potential career outcomes.

**Track Recommendation Guidelines:**
- Recommend tracks that align with the user's experience level, interests, and goals.
- For beginners with no clear preference, suggest accessible entry points like Front-End Development or UI/UX Design.
- For users with analytical interests, consider Data Science, Back-End Development, or AI tracks.
- For creative users, consider UI/UX Design, Front-End, Game Development, or Mobile App tracks.
- For users interested in infrastructure or systems, consider DevOps, Cloud Computing, or Cybersecurity.

**Multilingual Support:**
- If a user communicates in a language other than English, respond in that same language.
- Maintain the same conversation quality and recommendation approach regardless of language.

Remember, your goal is to make the user feel understood and guide them to a track they'll be excited about, even if they initially have no idea what they want to learn.
"""


# --- FastAPI App ---
app = FastAPI(title="Chatbot Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Initialization ---
async def initialize_chatbot_dependencies():
    global embedder_instance, gemini_model
    print("Initializing chatbot dependencies...")
    try:
        if not DATABASE_URI or not GEMINI_API_KEY:
            raise ValueError("DATABASE_URI and GEMINI_API_KEY must be set in .env file")
        client = motor.motor_asyncio.AsyncIOMotorClient(DATABASE_URI)
        db = client[MONGO_DATABASE_NAME]
        await init_beanie(database=db, document_models=[ChatSession, Roadmap])
        print(f"Chatbot connected to MongoDB database '{MONGO_DATABASE_NAME}'.")
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        embedder_instance = SentenceTransformer(EMBEDDING_MODEL_NAME)
        await load_roadmap_data_from_mongodb()
        print("Chatbot dependencies initialized successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR during chatbot initialization: {e}", file=sys.stderr)
        raise

@app.on_event("startup")
async def startup_event():
    await initialize_chatbot_dependencies()

@app.post("/chat", response_model=ChatResponse)
async def handle_chat(request: ChatRequest):
    session_id = request.session_id
    user_input = request.user_input
    try:
        chat_session = await ChatSession.find_one(ChatSession.session_id == session_id)
        if not chat_session:
            chat_session = ChatSession(session_id=session_id)
            await chat_session.create()
        if is_off_topic(user_input):
            assistant_response_message = "I'm here to help you choose the best learning track. Unfortunately, I can't assist with this topic."
        else:
            user_input_lower = user_input.lower()
            rejection_keywords = ["no", "not interested", "don't like", "something else", "different"]
            acceptance_keywords = ["yes", "interested", "sounds good", "tell me more", "like it"]
            if chat_session.last_suggested_roadmap:
                if any(keyword in user_input_lower for keyword in rejection_keywords):
                    if chat_session.last_suggested_roadmap not in chat_session.rejected_roadmaps:
                        chat_session.rejected_roadmaps.append(chat_session.last_suggested_roadmap)
                    chat_session.last_suggested_roadmap = None
                    await chat_session.save()
                elif any(keyword in user_input_lower for keyword in acceptance_keywords):
                    chat_session.roadmap_confirmed = True
                    await chat_session.save()
            relevant_tracks = get_relevant_tracks_from_keywords(user_input)
            relevant_tracks = [track for track in relevant_tracks if track not in chat_session.rejected_roadmaps]
            context = f"""
            Experience Level: Not specified
            Technical Interests: Not specified
            Personal Goals: Not specified
            Rejected Roadmaps: {', '.join(chat_session.rejected_roadmaps) if chat_session.rejected_roadmaps else 'None'}
            Relevant Tracks Found: {', '.join(relevant_tracks) if relevant_tracks else 'None'}
            """
            conversation_history = [f"{msg.role}: {msg.content}" for msg in chat_session.messages[-10:]]
            system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
                experience_level="Not specified",
                technical_interests="Not specified",
                personal_goals="Not specified",
                rejected_tracks=", ".join(chat_session.rejected_roadmaps) if chat_session.rejected_roadmaps else "None"
            )
            full_prompt = f"{system_prompt}\n\nContext: {context}\n\nConversation History:\n" + "\n".join(conversation_history) + f"\n\nUser: {user_input}\n\nAssistant:"
            response = gemini_model.generate_content(full_prompt)
            assistant_response_message = response.text
            suggested_track = extract_suggested_track(assistant_response_message)
            if suggested_track:
                official_track = find_closest_official_track(suggested_track, TRACK_NAME_MATCH_THRESHOLD)
                if official_track:
                    chat_session.last_suggested_roadmap = official_track
                    await chat_session.save()
        chat_session.messages.append(ChatMessage(role="user", content=user_input))
        chat_session.messages.append(ChatMessage(role="assistant", content=assistant_response_message))
        await chat_session.save()
        return ChatResponse(assistant_message=assistant_response_message, session_id=session_id)
    except Exception as e:
        print(f"Error in chat handler: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "chatbot"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)