from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / '.env')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import BASE_DIR, SessionLocal, engine
from .models import User, Student
from .migrations import upgrade_database
from .routes.admin import router as admin_router
from .routes.auth import hash_password, router as auth_router, verify_password
from .routes.students import router as student_router
from .routes.assistant import router as assistant_router
from .routes.upload import router as upload_router

app = FastAPI(title='StudentPulse AI API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router, prefix='/auth')
app.include_router(student_router, prefix='/students')
app.include_router(assistant_router, prefix='/assistant')
app.include_router(admin_router, prefix='/admin')
app.include_router(upload_router, prefix='/data')


def ensure_database_schema() -> None:
    upgrade_database(engine)


ensure_database_schema()


def demo_password_for_user(user_data: dict) -> str | None:
    if user_data.get('role') == 'student':
        student_id = str(user_data.get('student_id') or '')
        if student_id.startswith('STU-'):
            number = student_id.removeprefix('STU-')
            if number.isdigit() and 1001 <= int(number) <= 1700:
                return f'PulseStu-{number}!'
    if user_data.get('email') == 'nair@pulse.edu':
        return 'Faculty-Nair!26'
    if user_data.get('email') == 'sethi@pulse.edu':
        return 'Faculty-Sethi!26'
    if user_data.get('email') == 'admin@pulse.edu':
        return 'Admin-Pulse!26'
    return None


def seed_demo_data() -> None:
    db: Session = SessionLocal()
    credential_migration_marker = BASE_DIR / '.unique-demo-passwords-v2'
    migrate_legacy_demo_passwords = not credential_migration_marker.exists()

    if db.query(User).count() > 0:
        existing_users = db.query(User).all()
        for user in existing_users:
            if not user.status:
                user.status = 'APPROVED' if user.role in {'student', 'faculty', 'admin'} else 'PENDING'
            if migrate_legacy_demo_passwords:
                demo_password = demo_password_for_user({
                    'role': user.role,
                    'student_id': user.student_id,
                    'email': user.email,
                })
                if demo_password and verify_password('demo123', user.password_hash):
                    user.password_hash = hash_password(demo_password)
        db.commit()

    demo_users = [
        {'email': 'ananya@pulse.edu', 'name': 'Ananya Rao', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1001', 'department': 'CSE', 'year': '3rd Year'},
        {'email': 'rohan@pulse.edu', 'name': 'Rohan Mehta', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1002', 'department': 'ECE', 'year': '2nd Year'},
        {'email': 'priya@pulse.edu', 'name': 'Priya Shah', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1003', 'department': 'IT', 'year': '4th Year'},
        {'email': 'kabir@pulse.edu', 'name': 'Kabir Singh', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1004', 'department': 'CSE', 'year': '3rd Year'},
        {'email': 'neha@pulse.edu', 'name': 'Neha Kulkarni', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1005', 'department': 'IT', 'year': '2nd Year'},
        {'email': 'aditi@pulse.edu', 'name': 'Aditi Verma', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1006', 'department': 'CSE', 'year': '4th Year'},
        {'email': 'vikram@pulse.edu', 'name': 'Vikram Nair', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1007', 'department': 'MECH', 'year': '3rd Year'},
        {'email': 'ishita@pulse.edu', 'name': 'Ishita Joshi', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1008', 'department': 'CSE', 'year': '1st Year'},
        {'email': 'manav@pulse.edu', 'name': 'Manav Iyer', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1009', 'department': 'CSE', 'year': '2nd Year'},
        {'email': 'sana@pulse.edu', 'name': 'Sana Qureshi', 'role': 'student', 'status': 'APPROVED', 'password_hash': '', 'student_id': 'STU-1010', 'department': 'AI&DS', 'year': '3rd Year'},
        {'email': 'nair@pulse.edu', 'name': 'Prof. Nair', 'role': 'faculty', 'status': 'APPROVED', 'password_hash': '', 'student_id': None, 'department': 'CSE', 'year': None},
        {'email': 'sethi@pulse.edu', 'name': 'Prof. Sethi', 'role': 'faculty', 'status': 'APPROVED', 'password_hash': '', 'student_id': None, 'department': 'IT', 'year': None},
        {'email': 'admin@pulse.edu', 'name': 'Admin Team', 'role': 'admin', 'status': 'APPROVED', 'password_hash': '', 'student_id': None, 'department': 'Administration', 'year': None},
    ]

    for user_data in demo_users:
        demo_password = demo_password_for_user(user_data)
        existing_user = db.query(User).filter(User.email == user_data['email']).first()
        if not existing_user:
            if demo_password:
                user_data['password_hash'] = hash_password(demo_password)
            db.add(User(**user_data))
    db.commit()

    students = [
        {'student_id': 'STU-1001', 'name': 'Ananya Rao', 'email': 'ananya@pulse.edu', 'department': 'CSE', 'year': '3rd Year', 'academic_score': 82, 'attendance': 86, 'lms': 78, 'placement': 74, 'skills': 81, 'success_score': 82, 'risk_level': 'Low Risk', 'risk_score': 18, 'cgpa': 8.7, 'semester': 'Semester 6'},
        {'student_id': 'STU-1002', 'name': 'Rohan Mehta', 'email': 'rohan@pulse.edu', 'department': 'ECE', 'year': '2nd Year', 'academic_score': 66, 'attendance': 68, 'lms': 58, 'placement': 52, 'skills': 60, 'success_score': 61, 'risk_level': 'Medium Risk', 'risk_score': 39, 'cgpa': 6.8, 'semester': 'Semester 4'},
        {'student_id': 'STU-1003', 'name': 'Priya Shah', 'email': 'priya@pulse.edu', 'department': 'IT', 'year': '4th Year', 'academic_score': 48, 'attendance': 52, 'lms': 46, 'placement': 39, 'skills': 42, 'success_score': 44, 'risk_level': 'High Risk', 'risk_score': 56, 'cgpa': 5.3, 'semester': 'Semester 8'},
        {'student_id': 'STU-1004', 'name': 'Kabir Singh', 'email': 'kabir@pulse.edu', 'department': 'CSE', 'year': '3rd Year', 'academic_score': 80, 'attendance': 93, 'lms': 72, 'placement': 61, 'skills': 78, 'success_score': 76, 'risk_level': 'Low Risk', 'risk_score': 24, 'cgpa': 8.1, 'semester': 'Semester 5'},
        {'student_id': 'STU-1005', 'name': 'Neha Kulkarni', 'email': 'neha@pulse.edu', 'department': 'IT', 'year': '2nd Year', 'academic_score': 78, 'attendance': 71, 'lms': 82, 'placement': 48, 'skills': 65, 'success_score': 70, 'risk_level': 'Medium Risk', 'risk_score': 30, 'cgpa': 7.5, 'semester': 'Semester 4'},
        {'student_id': 'STU-1006', 'name': 'Aditi Verma', 'email': 'aditi@pulse.edu', 'department': 'CSE', 'year': '4th Year', 'academic_score': 62, 'attendance': 59, 'lms': 50, 'placement': 63, 'skills': 67, 'success_score': 58, 'risk_level': 'Medium Risk', 'risk_score': 42, 'cgpa': 6.5, 'semester': 'Semester 8'},
        {'student_id': 'STU-1007', 'name': 'Vikram Nair', 'email': 'vikram@pulse.edu', 'department': 'MECH', 'year': '3rd Year', 'academic_score': 58, 'attendance': 64, 'lms': 49, 'placement': 42, 'skills': 57, 'success_score': 52, 'risk_level': 'Medium Risk', 'risk_score': 48, 'cgpa': 6.1, 'semester': 'Semester 6'},
        {'student_id': 'STU-1008', 'name': 'Ishita Joshi', 'email': 'ishita@pulse.edu', 'department': 'CSE', 'year': '1st Year', 'academic_score': 90, 'attendance': 92, 'lms': 87, 'placement': 72, 'skills': 86, 'success_score': 88, 'risk_level': 'Low Risk', 'risk_score': 12, 'cgpa': 9.0, 'semester': 'Semester 2'},
        {'student_id': 'STU-1009', 'name': 'Manav Iyer', 'email': 'manav@pulse.edu', 'department': 'CSE', 'year': '2nd Year', 'academic_score': 69, 'attendance': 74, 'lms': 71, 'placement': 55, 'skills': 62, 'success_score': 66, 'risk_level': 'Medium Risk', 'risk_score': 34, 'cgpa': 7.1, 'semester': 'Semester 4'},
        {'student_id': 'STU-1010', 'name': 'Sana Qureshi', 'email': 'sana@pulse.edu', 'department': 'AI&DS', 'year': '3rd Year', 'academic_score': 81, 'attendance': 83, 'lms': 76, 'placement': 69, 'skills': 80, 'success_score': 77, 'risk_level': 'Low Risk', 'risk_score': 23, 'cgpa': 8.3, 'semester': 'Semester 6'},
    ]

    departments = ['CSE', 'IT', 'ECE', 'AI&DS', 'MECH']
    first_names = ['Aarav', 'Advait', 'Akash', 'Amara', 'Arjun', 'Dev', 'Diya', 'Ishaan', 'Kavya', 'Kiran', 'Meera', 'Nikhil', 'Riya', 'Samar', 'Tanvi', 'Ved', 'Yash', 'Zara', 'Aanya', 'Dhruv']
    last_names = ['Patel', 'Menon', 'Kapoor', 'Desai', 'Bose', 'Malhotra', 'Reddy', 'Chopra', 'Sharma', 'Mukherjee']
    department_counts = {department: sum(1 for student in students if student['department'] == department) for department in departments}

    for index in range(690):
        department = next(name for name in departments if department_counts[name] < 140)
        student_id_number = 1011 + index
        template = next(student for student in students if student['department'] == department)
        variation = ((student_id_number * 7) % 25) - 12
        clamp = lambda value, minimum=35, maximum=99: max(minimum, min(maximum, value))
        academic = clamp(template['academic_score'] + variation)
        attendance = clamp(template['attendance'] + ((student_id_number * 11) % 23) - 11)
        lms = clamp(template['lms'] + ((student_id_number * 13) % 27) - 13)
        skills = clamp(template['skills'] + ((student_id_number * 17) % 25) - 12)
        placement = clamp(template['placement'] + ((student_id_number * 19) % 29) - 14)
        success_score = round(academic * 0.3 + attendance * 0.25 + lms * 0.15 + skills * 0.15 + placement * 0.1 + 65 * 0.05)
        risk_level = 'High Risk' if attendance < 60 or academic < 55 else 'Medium Risk' if success_score < 68 else 'Low Risk'
        semester_number = (student_id_number % 8) + 1
        year_number = min(4, (semester_number + 1) // 2)
        year_suffix = ['st', 'nd', 'rd', 'th'][year_number - 1]

        students.append({
            'student_id': f'STU-{student_id_number}',
            'name': f'{first_names[index % len(first_names)]} {last_names[(index // len(first_names)) % len(last_names)]}',
            'email': f'student{student_id_number}@pulse.edu',
            'department': department,
            'year': f'{year_number}{year_suffix} Year',
            'academic_score': academic,
            'attendance': attendance,
            'lms': lms,
            'placement': placement,
            'skills': skills,
            'success_score': success_score,
            'risk_level': risk_level,
            'risk_score': 100 - success_score,
            'cgpa': round(max(4, min(10, academic / 10 + ((student_id_number % 5) - 2) * 0.1)), 1),
            'semester': f'Semester {semester_number}',
        })
        department_counts[department] += 1

    for student_data in students:
        if not db.query(Student).filter(Student.student_id == student_data['student_id']).first():
            db.add(Student(**student_data))
        if student_data['email'].startswith('student'):
            demo_password = demo_password_for_user({
                'role': 'student',
                'student_id': student_data['student_id'],
                'email': student_data['email'],
            })
            existing_user = db.query(User).filter(User.email == student_data['email']).first()
            if not existing_user:
                db.add(User(
                    email=student_data['email'],
                    name=student_data['name'],
                    role='student',
                    status='APPROVED',
                    password_hash=hash_password(demo_password),
                    student_id=student_data['student_id'],
                    department=student_data['department'],
                    year=student_data['year'],
                ))

    db.commit()
    credential_migration_marker.touch(exist_ok=True)
    db.close()


seed_demo_data()


@app.get('/')
def health_check():
    return {'status': 'ok', 'app': 'StudentPulse AI'}


@app.get('/analytics/overview')
def analytics_overview():
    db: Session = SessionLocal()
    students = db.query(Student).all()
    db.close()

    total_students = len(students)
    average_cgpa = round(sum(student.cgpa for student in students) / total_students, 2) if total_students else 0
    average_attendance = round(sum(student.attendance for student in students) / total_students, 2) if total_students else 0
    average_success = round(sum(student.success_score for student in students) / total_students, 2) if total_students else 0
    high_risk = sum(1 for student in students if student.risk_level == 'High Risk')

    return {
        'total_students': total_students,
        'departments': 5,
        'average_cgpa': average_cgpa,
        'average_attendance': average_attendance,
        'average_success_score': average_success,
        'high_risk_students': high_risk,
        'placement_readiness': 69,
        'engagement': 71,
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app.main:app', host='0.0.0.0', port=8000, reload=False)
