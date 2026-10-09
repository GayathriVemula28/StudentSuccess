from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import AcademicRecord, AttendanceRecord, Student, Subject, User
from ..services.student_assistant import AssistantProviderError, answer_student_question, build_student_context
from .auth import require_roles

router = APIRouter()


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post('/chat')
def chat_with_assistant(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles('student')),
):
    if user.student_id:
        student = db.query(Student).filter(Student.student_id == user.student_id).first()
    else:
        student = db.query(Student).filter(Student.email == user.email).first()

    if not student or student.risk_level == 'Pending':
        context = {}
    else:
        subjects = db.query(Subject).filter(Subject.student_id == student.student_id).all()
        attendance = db.query(AttendanceRecord).filter(AttendanceRecord.student_id == student.student_id).first()
        academic = db.query(AcademicRecord).filter(AcademicRecord.student_id == student.student_id).order_by(AcademicRecord.id.desc()).first()
        context = build_student_context(student, subjects, attendance, academic)

    try:
        answer, provider = answer_student_question(payload.message.strip(), context)
    except AssistantProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {'answer': answer, 'provider': provider}