from datetime import datetime

from sqlalchemy import Column, Float, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default='student')
    status = Column(String, default='PENDING')
    student_id = Column(String, nullable=True)
    department = Column(String, nullable=True)
    year = Column(String, nullable=True)
    section = Column(String, nullable=True)
    personal_email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    skills = Column(String, nullable=True)
    career_goal = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, nullable=True)

    student = relationship('Student', back_populates='user', uselist=False)


class Student(Base):
    __tablename__ = 'students'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    department = Column(String, nullable=False)
    year = Column(String, nullable=False)
    academic_score = Column(Float, default=0.0)
    attendance = Column(Float, default=0.0)
    lms = Column(Float, default=0.0)
    placement = Column(Float, default=0.0)
    skills = Column(Float, default=0.0)
    success_score = Column(Float, default=0.0)
    risk_level = Column(String, default='Low Risk')
    risk_score = Column(Float, default=0.0)
    cgpa = Column(Float, default=0.0)
    semester = Column(String, default='Semester 1')
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)

    user = relationship('User', back_populates='student')


class AttendanceRecord(Base):
    __tablename__ = 'attendance'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    overall_attendance = Column(Float, default=0.0)
    present_classes = Column(Integer, default=0)
    absent_classes = Column(Integer, default=0)


class AcademicRecord(Base):
    __tablename__ = 'academic_records'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    cgpa = Column(Float, default=0.0)
    semester = Column(String)
    subject_marks = Column(String, default='')
    assignment_score = Column(Float, default=0.0)
    quiz_score = Column(Float, default=0.0)


class Subject(Base):
    __tablename__ = 'subjects'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    name = Column(String)
    marks = Column(Float, default=0.0)


class LMSActivity(Base):
    __tablename__ = 'lms_activity'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    courses_completed = Column(Integer, default=0)
    videos_watched = Column(Integer, default=0)
    assignments_submitted = Column(Integer, default=0)
    quiz_attempts = Column(Integer, default=0)
    login_frequency = Column(Integer, default=0)
    learning_hours = Column(Integer, default=0)


class EngagementRecord(Base):
    __tablename__ = 'engagement'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    hackathons = Column(Integer, default=0)
    workshops = Column(Integer, default=0)
    clubs = Column(Integer, default=0)
    seminars = Column(Integer, default=0)
    events = Column(Integer, default=0)
    projects = Column(Integer, default=0)
    certifications = Column(Integer, default=0)
    peer_activities = Column(Integer, default=0)


class PlacementRecord(Base):
    __tablename__ = 'placement'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    aptitude = Column(Float, default=0.0)
    coding = Column(Float, default=0.0)
    communication = Column(Float, default=0.0)
    interview = Column(Float, default=0.0)
    resume_readiness = Column(Float, default=0.0)


class SkillRecord(Base):
    __tablename__ = 'skills'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    skill_name = Column(String)
    skill_level = Column(String)
    score = Column(Float, default=0.0)


class FeedbackEntry(Base):
    __tablename__ = 'feedback'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    faculty_name = Column(String)
    subject = Column(String)
    rating = Column(Float, default=0.0)
    comments = Column(String)


class SuccessScore(Base):
    __tablename__ = 'success_scores'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    score = Column(Float, default=0.0)
    explanation = Column(String, default='')


class RiskPrediction(Base):
    __tablename__ = 'risk_predictions'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    risk_level = Column(String)
    risk_score = Column(Float, default=0.0)
    factors = Column(String, default='')
    recommended_action = Column(String, default='')


class Recommendation(Base):
    __tablename__ = 'recommendations'

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, index=True)
    message = Column(String)


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, nullable=False)
    action = Column(String, nullable=False)
    target_student_id = Column(String, nullable=True)
    date = Column(String, nullable=False)
    time = Column(String, nullable=False)
    reason = Column(String, nullable=True)
