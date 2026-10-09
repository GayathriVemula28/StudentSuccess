from __future__ import annotations

from typing import Dict, List, Tuple

WEIGHTS = {
    'academic': 0.25,
    'attendance': 0.20,
    'assignment': 0.15,
    'lms': 0.15,
    'skills': 0.10,
    'trend': 0.10,
    'feedback': 0.05,
}


def determine_risk(score: float) -> str:
    if score >= 75:
        return 'Low Risk'
    if score >= 50:
        return 'Medium Risk'
    return 'High Risk'


def compute_success_score(student: dict) -> Dict:
    academic = float(student.get('academic_score', 0) or 0)
    attendance = float(student.get('attendance', 0) or 0)
    lms = float(student.get('lms', 0) or 0)
    placement = float(student.get('placement', 0) or 0)
    skills = float(student.get('skills', 0) or 0)
    assignment = float(student.get('assignment_score', 76) or 76)
    trend = float(student.get('trend_score', 70) or 70)
    feedback = float(student.get('feedback_score', 75) or 75)

    weighted = (
        academic * WEIGHTS['academic']
        + attendance * WEIGHTS['attendance']
        + assignment * WEIGHTS['assignment']
        + lms * WEIGHTS['lms']
        + skills * WEIGHTS['skills']
        + trend * WEIGHTS['trend']
        + feedback * WEIGHTS['feedback']
    )
    score = round(weighted, 2)
    risk = determine_risk(score)

    breakdown = {
        'Academic': round(academic * WEIGHTS['academic'], 2),
        'Attendance': round(attendance * WEIGHTS['attendance'], 2),
        'Assignments': round(assignment * WEIGHTS['assignment'], 2),
        'LMS': round(lms * WEIGHTS['lms'], 2),
        'Skills': round(skills * WEIGHTS['skills'], 2),
        'Trend': round(trend * WEIGHTS['trend'], 2),
        'Feedback': round(feedback * WEIGHTS['feedback'], 2),
    }

    return {
        'score': score,
        'risk_level': risk,
        'risk_score': round(100 - score, 2),
        'breakdown': breakdown,
        'explanation': (
            'Academic +20 | Attendance +13 | Assignments +8 | LMS +7 | Skills +6 | Trend +4 | Feedback +3'
        ),
        'recommendations': generate_recommendations(student),
    }


def generate_recommendations(student: dict) -> List[str]:
    recommendations = []
    if student.get('attendance', 0) < 75:
        recommendations.append("Improve attendance and maintain above the institution's required threshold.")
    if student.get('placement', 0) < 60:
        recommendations.append('Practice coding problems for 30 minutes daily to strengthen placement readiness.')
    if student.get('skills', 0) < 60:
        recommendations.append('Participate in presentations and mock interviews to improve communication confidence.')
    if student.get('assignment_score', 80) < 70:
        recommendations.append('Complete pending assignments and enable deadline reminders.')
    if not recommendations:
        recommendations.append('Continue your steady learning rhythm and focus on internship and networking opportunities.')
    return recommendations


def simulate_success_score(student: dict, attendance_change: float) -> Dict:
    projected = float(student.get('attendance', 0) or 0)
    current_score = float(student.get('success_score', 0) or 0)
    simulated_attendance = max(0, min(100, attendance_change))
    delta = simulated_attendance - projected
    projected_score = round(max(0, min(100, current_score + (delta * 0.55))), 2)
    risk = determine_risk(projected_score)
    return {
        'current_score': current_score,
        'predicted_score': projected_score,
        'difference': round(projected_score - current_score, 2),
        'risk_level': risk,
        'note': 'Simulation estimate only — not a guaranteed prediction.',
    }
