from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import AuditLog, Student, User
from .auth import require_roles

router = APIRouter(prefix='/admin')


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get('/students')
def list_students(db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    students = db.query(User).filter(User.role == 'student').all()
    return [
        {
            'id': user.id,
            'student_id': user.student_id,
            'name': user.name,
            'email': user.email,
            'department': user.department,
            'year': user.year,
            'status': user.status,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        for user in students
    ]


@router.get('/students/pending')
def pending_students(db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    students = db.query(User).filter(User.role == 'student', User.status == 'PENDING').all()
    return [
        {
            'id': user.id,
            'student_id': user.student_id,
            'name': user.name,
            'email': user.email,
            'department': user.department,
            'year': user.year,
            'status': user.status,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        for user in students
    ]


@router.get('/students/{student_id}')
def get_student(student_id: str, db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    user = db.query(User).filter(User.role == 'student', User.student_id == student_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Student not found')
    return {
        'id': user.id,
        'student_id': user.student_id,
        'name': user.name,
        'email': user.email,
        'department': user.department,
        'year': user.year,
        'section': user.section,
        'phone_number': user.phone_number,
        'status': user.status,
        'skills': user.skills,
        'career_goal': user.career_goal,
    }


def _apply_status(student_id: str, status: str, db: Session, admin: User, reason: str = ''):
    user = db.query(User).filter(User.role == 'student', User.student_id == student_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Student not found')
    user.status = status
    if status == 'APPROVED':
        user.approved_at = datetime.utcnow()
        user.approved_by = admin.id
    db.add(AuditLog(
        admin_id=admin.id,
        action=f'ADMIN {status} STUDENT',
        target_student_id=student_id,
        date=datetime.utcnow().strftime('%Y-%m-%d'),
        time=datetime.utcnow().strftime('%H:%M:%S'),
        reason=reason,
    ))
    db.commit()
    return {'message': f'Student status updated to {status}', 'status': status}


@router.post('/students/{student_id}/approve')
def approve_student(student_id: str, reason: str = '', db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    return _apply_status(student_id, 'APPROVED', db, admin, reason)


@router.post('/students/{student_id}/reject')
def reject_student(student_id: str, reason: str = '', db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    return _apply_status(student_id, 'REJECTED', db, admin, reason)


@router.post('/students/{student_id}/suspend')
def suspend_student(student_id: str, reason: str = '', db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    return _apply_status(student_id, 'SUSPENDED', db, admin, reason)


@router.post('/students/{student_id}/reactivate')
def reactivate_student(student_id: str, reason: str = '', db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    return _apply_status(student_id, 'APPROVED', db, admin, reason)


@router.get('/audit-logs')
def audit_logs(db: Session = Depends(get_db), admin: User = Depends(require_roles('admin'))):
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).all()
    return [
        {
            'id': log.id,
            'admin_id': log.admin_id,
            'action': log.action,
            'target_student_id': log.target_student_id,
            'date': log.date,
            'time': log.time,
            'reason': log.reason,
        }
        for log in logs
    ]
