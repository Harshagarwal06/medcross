"""
server.py — FastAPI proxy exposing MedAI to the MedCross front-end.

Run:
    export HF_TOKEN="hf_..."
    uvicorn server:app --port 8788

Endpoints (all JSON):
    POST /api/explain  {"clue": str, "category": str}
    POST /api/hint     {"clue": str, "known_letters": str|null, "category": str}
    POST /api/learn    {"terms": [{"answer": str, "clue": str}], "category": str}

Keeping the HF token server-side means it is never shipped to the browser.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from medai_client import MedAI, MedAIError

app = FastAPI(title="MedCross AI", version="1.0")

# The crossword is served from a different port (static server), so allow it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8787", "http://127.0.0.1:8787"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ai = MedAI()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": ai.model}


class ExplainRequest(BaseModel):
    clue: str = Field(min_length=1)
    category: str = "medicine"


class HintRequest(BaseModel):
    clue: str = Field(min_length=1)
    known_letters: str | None = None
    category: str = "medicine"


class Term(BaseModel):
    answer: str
    clue: str


class LearnRequest(BaseModel):
    terms: list[Term] = Field(min_length=1)
    category: str = "medicine"


@app.post("/api/explain")
def explain(req: ExplainRequest) -> dict:
    try:
        return {"text": ai.explain_clue(req.clue, req.category)}
    except MedAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/hint")
def hint(req: HintRequest) -> dict:
    try:
        return {"text": ai.hint_for_clue(req.clue, req.known_letters, req.category)}
    except MedAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/learn")
def learn(req: LearnRequest) -> dict:
    try:
        terms = [t.model_dump() for t in req.terms]
        return {"text": ai.learn_batch(terms, req.category)}
    except MedAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
