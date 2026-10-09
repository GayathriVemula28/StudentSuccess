import json
import math
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AssistantProviderError(Exception):
    pass


def build_student_context(student, subjects, attendance, academic):
    if student.risk_level == 'Pending':
        return {}

    context = {}
    for key, value in (
        ('academic_score', student.academic_score),
        ('cgpa', student.cgpa),
        ('attendance', attendance.overall_attendance if attendance else student.attendance),
        ('lms_engagement', student.lms),
        ('placement_readiness', student.placement),
        ('skills_score', student.skills),
        ('assignment_score', academic.assignment_score if academic else None),
        ('quiz_score', academic.quiz_score if academic else None),
    ):
        if value is not None:
            context[key] = round(float(value), 2)

    subject_marks = [
        {'subject': subject.name, 'marks': round(float(subject.marks), 2)}
        for subject in subjects
        if subject.name and subject.marks is not None
    ]
    if subject_marks:
        context['subjects'] = subject_marks

    if attendance and attendance.present_classes is not None and attendance.absent_classes is not None:
        present = int(attendance.present_classes)
        absent = int(attendance.absent_classes)
        total = present + absent
        recorded_attendance = context.get('attendance')
        counts_match = total > 0 and recorded_attendance is not None and abs((present / total * 100) - recorded_attendance) <= 2
    else:
        counts_match = False

    if counts_match:
        context['attendance_counts'] = {
            'present': present,
            'absent': absent,
        }

    return context


def _offline_answer(message, context):
    if not context:
        return (
            "Your portal doesn't currently have academic or attendance records available, "
            'so I cannot make a personalized recommendation yet. Assignment titles and due dates '
            'are also unavailable.'
        )

    question = message.lower()
    if 'attendance' in question or 'class' in question:
        attendance = context.get('attendance')
        counts = context.get('attendance_counts')
        if attendance is None:
            return 'Your attendance information is unavailable in the portal, so I cannot assess it or calculate classes to attend.'
        if attendance < 75 and counts:
            present = counts['present']
            total = present + counts['absent']
            classes_needed = max(0, math.ceil((0.75 * total - present) / 0.25))
            return f'Your recorded attendance is {attendance}%. Attend the next {classes_needed} classes to reach 75%, assuming each is held and attended.'
        if attendance < 75:
            return f'Your recorded attendance is {attendance}%, below 75%. Consistent class counts are unavailable, so I cannot calculate how many upcoming classes are needed.'
        return f'Your recorded attendance is {attendance}%. Keep attending consistently; class-level attendance details are unavailable.'

    if 'assignment' in question or 'deadline' in question or 'due' in question:
        return 'Assignment titles and due dates are unavailable in the portal, so I cannot identify or rank pending work.'

    subjects = sorted(context.get('subjects', []), key=lambda item: item['marks'])
    if subjects:
        weakest = subjects[0]
        strongest = subjects[-1]
        return (
            f"Based on the available marks, focus first on {weakest['subject']} ({weakest['marks']}%). "
            f"Your strongest recorded subject is {strongest['subject']} ({strongest['marks']}%). "
            'Try one focused 25-minute review session, then practice a few questions.'
        )

    available = [key for key in ('academic_score', 'cgpa', 'quiz_score') if key in context]
    if available:
        summary = ', '.join(f'{key.replace("_", " ")}: {context[key]}' for key in available)
        return f'Your portal has these academic indicators: {summary}. Subject-level marks are unavailable, so I cannot name a specific topic to study.'

    return 'Your portal has no subject marks to compare yet. Add academic records to get a personalized study focus.'


def answer_student_question(message, context):
    api_key = os.getenv('OPENAI_API_KEY', '').strip()
    if not api_key:
        return _offline_answer(message, context), 'rules'

    request_body = {
        'model': os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
        'temperature': 0.2,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'You are a student study assistant. Answer using only the supplied portal data. '
                    'Never infer missing grades, attendance, assignment names, or due dates. '
                    'Say clearly when requested information is unavailable. Give concise, practical suggestions. '
                    f'Portal data: {json.dumps(context, separators=(",", ":"))}'
                ),
            },
            {'role': 'user', 'content': message},
        ],
    }
    request = Request(
        'https://api.openai.com/v1/chat/completions',
        data=json.dumps(request_body).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode('utf-8'))
        answer = result['choices'][0]['message']['content'].strip()
        if not answer:
            raise ValueError('The AI provider returned an empty response.')
        return answer, 'openai'
    except (HTTPError, URLError, TimeoutError, KeyError, IndexError, ValueError) as error:
        raise AssistantProviderError('The AI service could not complete this request. Please try again.') from error