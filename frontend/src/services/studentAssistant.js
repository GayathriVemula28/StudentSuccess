import { demoStudents } from '../data/demoData'

const isNumber = (value) => Number.isFinite(value)
const attendanceCountsMatch = (context) => {
  const counts = context.attendanceCounts
  const total = counts ? counts.present + counts.absent : 0
  return total > 0 && context.attendance !== null && Math.abs((counts.present / total * 100) - context.attendance) <= 2
}

export const getAssistantStudent = (user) => {
  if (!user || user.authProvider !== 'demo') return null
  return demoStudents.find((student) => student.id === user.id) || null
}

export const getAssistantContext = (student) => {
  if (!student) return null

  return {
    attendance: isNumber(student.attendance) ? student.attendance : null,
    attendanceCounts: student.attendanceBreakdown || null,
    academicScore: isNumber(student.academic) ? student.academic : null,
    subjects: Array.isArray(student.subjects)
      ? student.subjects.filter((subject) => subject?.name && isNumber(subject.marks))
      : [],
    pendingAssignments: isNumber(student.assignments?.pending) ? student.assignments.pending : null,
  }
}

export const getDailySuggestions = (context) => {
  if (!context) return []

  const suggestions = []
  const subjects = [...context.subjects].sort((first, second) => first.marks - second.marks)
  if (subjects.length) {
    const focus = subjects[0]
    suggestions.push({
      title: `Review ${focus.name}`,
      detail: `Your lowest available subject mark is ${focus.marks}%. Spend one focused 25-minute session reviewing a topic and practicing questions.`,
      priority: focus.marks < 55 ? 'High' : focus.marks < 70 ? 'Medium' : 'Low',
    })
  } else if (context.academicScore !== null) {
    suggestions.push({
      title: 'Plan a focused study block',
      detail: `Your recorded academic score is ${context.academicScore}%. Review recent course material, then practice questions from the topics you find difficult.`,
      priority: context.academicScore < 55 ? 'High' : context.academicScore < 70 ? 'Medium' : 'Low',
    })
  }

  if (context.attendance !== null) {
    const belowThreshold = context.attendance < 75
    const counts = context.attendanceCounts
    let detail = belowThreshold
      ? `Your recorded attendance is ${context.attendance}%, below the 75% threshold. Attend upcoming classes consistently.`
      : `Your recorded attendance is ${context.attendance}%. Keep your attendance steady.`

    if (belowThreshold && attendanceCountsMatch(context)) {
      const total = counts.present + counts.absent
      const needed = Math.max(0, Math.ceil((0.75 * total - counts.present) / 0.25))
      detail = `Your recorded attendance is ${context.attendance}%. Attend the next ${needed} classes to reach 75%, assuming each is held and attended.`
    } else if (belowThreshold && counts) {
      detail = `Your recorded attendance is ${context.attendance}%, below 75%. The available class counts do not match this percentage, so I cannot calculate how many upcoming classes are needed.`
    }
    suggestions.push({ title: 'Attendance check', detail, priority: belowThreshold ? 'High' : 'Low' })
  }

  if (context.pendingAssignments !== null) {
    suggestions.push(context.pendingAssignments > 0
      ? {
          title: 'Check pending assignments',
          detail: `${context.pendingAssignments} assignment${context.pendingAssignments === 1 ? '' : 's'} are listed as pending. Titles and due dates are not available, so check your course pages to choose what is due first.`,
          priority: 'Medium',
        }
      : {
          title: 'Assignments are up to date',
          detail: 'The available portal count shows no pending assignments.',
          priority: 'Low',
        })
  }

  if (subjects.length > 1) {
    const strongest = subjects[subjects.length - 1]
    suggestions.push({
      title: `Build on ${strongest.name}`,
      detail: `Your strongest available subject mark is ${strongest.marks}%. Use a short review to maintain that progress.`,
      priority: 'Low',
    })
  }

  return suggestions.slice(0, 5)
}

export const getOfflineAssistantReply = (message, context) => {
  const question = message.toLowerCase()
  if (!context) {
    return 'Your student profile is not connected to academic records in this portal yet. Marks, attendance, and assignments are unavailable, so I cannot make a personalized recommendation.'
  }

  if (question.includes('attendance') || question.includes('class')) {
    if (context.attendance === null) return 'Attendance information is unavailable in your portal data, so I cannot assess it or calculate how many classes to attend.'
    if (context.attendance >= 75) return `Your recorded attendance is ${context.attendance}%. Keep attending consistently. Per-subject attendance is unavailable.`
    if (!attendanceCountsMatch(context)) return `Your recorded attendance is ${context.attendance}%, below 75%. Consistent class counts are unavailable, so I cannot calculate how many upcoming classes are needed.`

    const { present, absent } = context.attendanceCounts
    const total = present + absent
    const needed = Math.max(0, Math.ceil((0.75 * total - present) / 0.25))
    return `Your recorded attendance is ${context.attendance}%. Attend the next ${needed} classes to reach 75%, assuming each is held and attended.`
  }

  if (question.includes('assignment') || question.includes('deadline') || question.includes('due')) {
    if (context.pendingAssignments === null) return 'Assignment information is unavailable in your portal data.'
    if (!context.pendingAssignments) return 'The available portal count shows no pending assignments. Assignment titles and due dates are not recorded.'
    return `${context.pendingAssignments} assignment${context.pendingAssignments === 1 ? ' is' : 's are'} listed as pending. Titles and due dates are unavailable, so I cannot rank them; check your course pages for the nearest deadline.`
  }

  const subjects = [...context.subjects].sort((first, second) => first.marks - second.marks)
  if (subjects.length) {
    const focus = subjects[0]
    const strongest = subjects[subjects.length - 1]
    return `Based on available marks, focus first on ${focus.name} (${focus.marks}%). Your strongest recorded subject is ${strongest.name} (${strongest.marks}%). Try a focused 25-minute review followed by practice questions.`
  }

  if (context.academicScore !== null) {
    return `Your recorded academic score is ${context.academicScore}%, but subject-level marks are unavailable. Review recent lessons and choose a topic you find difficult for today's study block.`
  }
  return 'Subject marks are unavailable in your portal data, so I cannot identify a specific subject to prioritize.'
}