from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.auth_routes import router as auth_router
from database import init_db
from services.question_routes import router as question_router
from services.question_service import seed_questions
from services.student_routes import router as student_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_questions()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(question_router)
app.include_router(student_router)
