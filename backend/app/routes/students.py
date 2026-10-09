from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Student
from ..services.ai import compute_success_score, generate_recommendations

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get('/')
def list_students():
    db = SessionLocal()
    students = db.query(Student).all()
    db.close()
    return [
        {
            'id': student.student_id,
            'name': student.name,
            'email': student.email,
            'department': student.department,
            'year': student.year,
            'success_score': student.success_score,
            'risk_level': student.risk_level,
            'attendance': student.attendance,
            'cgpa': student.cgpa,
        }
        for student in students
    ]


@router.get('/{student_id}')
def get_student(student_id: str):
    db = SessionLocal()
    student = db.query(Student).filter(Student.student_id == student_id).first()
    db.close()
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    return {
        'id': student.student_id,
        'name': student.name,
        'email': student.email,
        'department': student.department,
        'year': student.year,
        'academic_score': student.academic_score,
        'attendance': student.attendance,
        'lms': student.lms,
        'placement': student.placement,
        'skills': student.skills,
        'success_score': student.success_score,
        'risk_level': student.risk_level,
        'risk_score': student.risk_score,
        'cgpa': student.cgpa,
        'semester': student.semester,
    }


@router.get('/{student_id}/success-score')
def success_score(student_id: str):
    db = SessionLocal()
    student = db.query(Student).filter(Student.student_id == student_id).first()
    db.close()
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    payload = {
        'student_id': student.student_id,
        'academic_score': student.academic_score,
        'attendance': student.attendance,
        'lms': student.lms,
        'placement': student.placement,
        'skills': student.skills,
        'assignment_score': 80,
        'trend_score': 70,
        'feedback_score': 75,
    }
    result = compute_success_score(payload)
    return {
        'student_id': student.student_id,
        'score': result['score'],
        'risk_level': result['risk_level'],
        'explanation': result['explanation'],
        'breakdown': result['breakdown'],
    }


@router.get('/{student_id}/risk')
def get_risk(student_id: str):
    db = SessionLocal()
    student = db.query(Student).filter(Student.student_id == student_id).first()
    db.close()
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    result = compute_success_score({
        'student_id': student.student_id,
        'academic_score': student.academic_score,
        'attendance': student.attendance,
        'lms': student.lms,
        'placement': student.placement,
        'skills': student.skills,
        'assignment_score': 80,
        'trend_score': 70,
        'feedback_score': 75,
    })
    return {
        'student_id': student.student_id,
        'risk_level': result['risk_level'],
        'risk_score': result['risk_score'],
        'factors': ['declining attendance', 'low LMS activity'],
        'recommended_action': 'Schedule a mentoring review and reinforce assignment completion.',
    }


@router.get('/{student_id}/recommendations')
def get_recommendations(student_id: str):
    db = SessionLocal()
    student = db.query(Student).filter(Student.student_id == student_id).first()
    db.close()
    if not student:
        raise HTTPException(status_code=404, detail='Student not found')
    return {'student_id': student.student_id, 'recommendations': generate_recommendations({'attendance': student.attendance, 'placement': student.placement, 'skills': student.skills, 'assignment_score': 80})}


@router.get('/{student_id}/academic')
def get_academic(student_id: str):
    return {'student_id': student_id, 'cgpa': 8.7, 'semester': 'Semester 6', 'subjects': [{'name': 'Data Structures', 'marks': 88}, {'name': 'DBMS', 'marks': 86}]}


@router.get('/{student_id}/attendance')
def get_attendance(student_id: str):
    return {'student_id': student_id, 'overall_attendance': 86, 'present_classes': 78, 'absent_classes': 12, 'trend': [84, 86, 85, 88, 82, 86]}


@router.get('/{student_id}/lms')
def get_lms(student_id: str):
    return {'student_id': student_id, 'courses_completed': 7, 'videos_watched': 42, 'assignments_submitted': 9, 'quiz_attempts': 12, 'login_frequency': 8, 'learning_hours': 21, 'engagement_score': 78}


@router.get('/{student_id}/engagement')
def get_engagement(student_id: str):
    return {'student_id': student_id, 'engagement_score': 71, 'hackathons': 2, 'workshops': 3, 'clubs': 1, 'seminars': 2, 'events': 4}


@router.get('/{student_id}/placement')
def get_placement(student_id: str):
    return {'student_id': student_id, 'placement_readiness_score': 74, 'aptitude': 78, 'coding': 82, 'communication': 68, 'interview': 72}


@router.get('/{student_id}/skills')
def get_skills(student_id: str):
    return {'student_id': student_id, 'skills': [{'skill': 'Python', 'level': 'Advanced', 'score': 88}, {'skill': 'React', 'level': 'Beginner', 'score': 55}]}


@router.get('/{student_id}/feedback')
def get_feedback(student_id: str):
    return {'student_id': student_id, 'feedback': [{'faculty_name': 'Prof. Nair', 'subject': 'Data Structures', 'rating': 4.8, 'comments': 'Strong analytical thinking.'}]}
