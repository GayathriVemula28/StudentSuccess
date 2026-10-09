import os
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Student, User
from ..schemas import LoginRequest

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/auth/login')

SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'studentpulse-demo-key')
ALGORITHM = 'HS256'


class RegisterRequest(BaseModel):
    full_name: str
    college_email: str
    role: str | None = 'student'
    student_id: str | None = None
    employee_id: str | None = None
    admin_id: str | None = None
    personal_email: str | None = None
    department: str | None = None
    campus_name: str | None = None
    designation: str | None = None
    year: str | None = None
    section: str | None = None
    phone_number: str
    password: str
    confirm_password: str
    skills: str | None = None
    career_goal: str | None = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, stored_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))


def create_token(user: User) -> str:
    payload = {'sub': user.email, 'role': user.role, 'user_id': user.id, 'exp': datetime.utcnow() + timedelta(days=7)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid or expired token')

    user = db.query(User).filter(User.email == payload.get('sub')).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')
    return user


def require_roles(*roles):
    def check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Access forbidden')
        return user
    return check


@router.post('/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    if payload.role and user.role.lower() != payload.role.lower():
        raise HTTPException(status_code=403, detail='Role mismatch')

    if user.role == 'student':
        if user.status == 'PENDING':
            raise HTTPException(status_code=403, detail='Your account is awaiting administrator approval.')
        if user.status == 'REJECTED':
            raise HTTPException(status_code=403, detail='Your registration request was rejected. Please contact the administrator.')
        if user.status == 'SUSPENDED':
            raise HTTPException(status_code=403, detail='Your account has been suspended. Please contact the administrator.')
        if user.status != 'APPROVED':
            raise HTTPException(status_code=403, detail='Account not active.')

    if user.role in {'faculty', 'admin'} and user.status != 'APPROVED':
        raise HTTPException(status_code=403, detail='Your account is not active.')

    student = db.query(Student).filter(Student.email == user.email).first()
    return {
        'access_token': create_token(user),
        'token_type': 'bearer',
        'user': {
            'id': student.student_id if student else user.student_id or str(user.id),
            'name': user.name,
            'email': user.email,
            'role': user.role,
            'department': user.department,
            'year': user.year,
            'status': user.status,
        },
    }


@router.post('/register')
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    selected_role = (payload.role or 'student').lower()
    email = payload.college_email.lower().strip()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail='Student account already exists.')
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail='Passwords do not match.')

    if selected_role == 'student' and not payload.student_id:
        raise HTTPException(status_code=400, detail='Student ID is required for student registrations.')

    if selected_role == 'faculty' and not payload.employee_id:
        raise HTTPException(status_code=400, detail='Employee ID is required for faculty registrations.')

    if selected_role == 'admin' and not payload.admin_id:
        raise HTTPException(status_code=400, detail='Admin ID is required for admin registrations.')

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.full_name,
        role=selected_role,
        status='APPROVED',
        student_id=payload.student_id or payload.employee_id or payload.admin_id,
        department=payload.department or payload.campus_name,
        year=payload.year,
        section=payload.section,
        personal_email=(payload.personal_email or '').strip() or None,
        phone_number=payload.phone_number,
        skills=payload.skills or '',
        career_goal=payload.career_goal or '',
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if selected_role == 'student':
        student = Student(
            student_id=payload.student_id,
            name=payload.full_name,
            email=email,
            department=payload.department or 'CSE',
            year=payload.year or '1st Year',
            academic_score=0,
            attendance=0,
            lms=0,
            placement=0,
            skills=0,
            success_score=0,
            risk_level='Pending',
            risk_score=0,
            cgpa=0,
            semester='Semester 1',
        )
        db.add(student)
        db.commit()

    return {'message': 'Account created successfully. You can now sign in.', 'status': 'APPROVED', 'role': selected_role}


@router.post('/logout')
def logout():
    return {'message': 'Logged out successfully'}
