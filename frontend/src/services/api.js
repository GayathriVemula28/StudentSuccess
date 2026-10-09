import { demoStudents, demoFaculty, demoAdmin } from '../data/demoData'

const STORAGE_KEY = 'studentpulse-user'
const ACCOUNTS_KEY = 'studentpulse-accounts'
const API_BASE = import.meta.env.VITE_API_URL || '/api'

export const demoRoles = ['student', 'faculty', 'admin']

export const getRoleForEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const knownUser = [...demoStudents, ...demoFaculty, demoAdmin].find((user) => user.email.toLowerCase() === normalizedEmail)
  if (knownUser) return knownUser.role

  const localPart = normalizedEmail.split('@')[0] || ''
  if (/(^|[._+-])(admin|administrator)([._+-]|\d|$)/.test(localPart)) return 'admin'
  if (/(^|[._+-])(faculty|professor|prof|teacher|lecturer)([._+-]|\d|$)/.test(localPart)) return 'faculty'
  return 'student'
}

const toPublicUser = (user) => ({
  id: user.id || user.email,
  name: user.name || user.email,
  email: user.email,
  role: user.role || 'student',
})

export const saveSessionUser = (user) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  return user
}

export const clearSessionUser = () => localStorage.removeItem(STORAGE_KEY)

const readStoredAccounts = () => {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]')
  } catch {
    return []
  }
}

const writeStoredAccounts = (accounts) => {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  return accounts
}

const normalizeStoredAccount = (account) => {
  const email = String(account?.email || account?.college_email || '').trim().toLowerCase()
  return {
    id: account?.id || account?.student_id || account?.employee_id || account?.admin_id || email,
    name: account?.name || account?.full_name || email.split('@')[0] || 'Student',
    email,
    role: String(account?.role || 'student').toLowerCase(),
    password: String(account?.password || ''),
    status: account?.status || 'APPROVED',
  }
}

const formatApiError = (detail, fallback) => {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join(' → ') : ''
      const message = item.msg || item.message || ''
      return field && message ? `${field}: ${message}` : message || JSON.stringify(item)
    }).filter(Boolean)
    return messages.length ? messages.join('; ') : fallback
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || JSON.stringify(detail)
  }
  return fallback
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let message = errorBody || 'Request failed'
    try {
      const parsed = JSON.parse(errorBody)
      message = parsed.detail || parsed.message || message
    } catch {
      // Keep non-JSON server errors readable as received.
    }
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.text()
}

export const uploadStudentCsv = async (file) => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/data/upload`, {
    method: 'POST',
    body: formData,
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.detail || result.message || 'CSV upload failed.')
  }
  return result
}

export const registerStudent = async (registration) => {
  const payload = {
    ...registration,
    email: registration.email || registration.college_email,
    role: (registration.role || 'student').toLowerCase(),
  }

  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(formatApiError(result.detail || result.message, `Unable to create your account (HTTP ${response.status}).`))
    }

    const storedAccounts = readStoredAccounts()
    const email = String(payload.email || '').trim().toLowerCase()
    const existing = storedAccounts.find((account) => account.email.toLowerCase() === email)
    if (!existing) {
      writeStoredAccounts([
        ...storedAccounts,
        normalizeStoredAccount({
          ...payload,
          id: payload.student_id || payload.employee_id || payload.admin_id || email,
          full_name: payload.full_name || payload.name || email.split('@')[0],
          role: payload.role || 'student',
          password: payload.password,
          status: result.status || 'APPROVED',
        }),
      ])
    }

    return result
  } catch (error) {
    const storedAccounts = readStoredAccounts()
    const email = String(payload.email || payload.college_email || '').trim().toLowerCase()
    const existing = storedAccounts.find((account) => account.email.toLowerCase() === email)

    if (existing) {
      if (existing.password !== String(payload.password || '')) {
        throw new Error('An account with this email already exists.')
      }
      return { message: 'Account created successfully. You can now sign in.', status: 'APPROVED', user: existing }
    }

    const account = normalizeStoredAccount({
      ...payload,
      id: payload.student_id || payload.employee_id || payload.admin_id || email,
      full_name: payload.full_name || payload.name || email.split('@')[0],
      role: payload.role || 'student',
      password: payload.password,
      status: 'APPROVED',
    })
    writeStoredAccounts([...storedAccounts, account])

    return {
      message: 'Account created successfully. You can now sign in.',
      status: 'APPROVED',
      user: account,
    }
  }
}

export const loginDemoUser = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const inferredRole = getRoleForEmail(normalizedEmail)
  const normalizedPassword = String(password || '')

  const localAccounts = readStoredAccounts()
  const localMatch = localAccounts.find((account) => account.email.toLowerCase() === normalizedEmail)
  if (localMatch) {
    if (localMatch.password !== normalizedPassword) {
      throw new Error('Incorrect password for this account.')
    }

    const sessionUser = {
      id: localMatch.id || normalizedEmail,
      name: localMatch.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      role: String(localMatch.role || inferredRole).toLowerCase(),
      authProvider: 'demo',
    }
    return saveSessionUser(sessionUser)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.')
  }
  if (!normalizedPassword.trim()) {
    throw new Error('Enter a password to continue.')
  }
  const knownDemoAccount = [...demoStudents, ...demoFaculty, demoAdmin].find((account) => account.email.toLowerCase() === normalizedEmail)
  if (knownDemoAccount && knownDemoAccount.password !== normalizedPassword) {
    throw new Error('Incorrect password for this demo account. Check the admin Users directory for its demo credentials.')
  }

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
    })

    const sessionUser = {
      id: data.user?.id || normalizedEmail,
      name: data.user?.name || normalizedEmail,
      email: data.user?.email || normalizedEmail,
      role: data.user?.role || inferredRole,
      accessToken: data.access_token,
    }

    if (!demoRoles.includes(sessionUser.role)) {
      throw new Error('This account has an unsupported role.')
    }

    return saveSessionUser({ ...sessionUser, authProvider: 'demo' })
  } catch (error) {
    if (error.status === 403 || error.status === 400) {
      throw error
    }

    const candidates = inferredRole === 'student'
      ? demoStudents
      : inferredRole === 'faculty'
        ? demoFaculty
        : [demoAdmin]

    const user = candidates.find((entry) => entry.email.toLowerCase() === normalizedEmail)
    if (user && user.password !== normalizedPassword) {
      throw new Error('Incorrect password for this demo account. Check the admin Users directory for its demo credentials.')
    }
    const displayName = user?.name || normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    const sessionUser = toPublicUser({
      id: user?.id || normalizedEmail,
      name: displayName,
      email: normalizedEmail,
      role: inferredRole,
    })
    return saveSessionUser({ ...sessionUser, authProvider: 'demo' })
  }
}

export const getSessionUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const logout = () => {
  clearSessionUser()
}

export const getStudentById = (studentId) => demoStudents.find((student) => student.id === studentId) || demoStudents[0]

export const getStudentOverview = (studentId) => getStudentById(studentId)

export const getFacultyStudents = () => demoStudents

export const getAdminOverview = () => {
  const average = (key) => demoStudents.reduce((total, student) => total + student[key], 0) / demoStudents.length

  return {
    totalStudents: demoStudents.length,
    departments: new Set(demoStudents.map((student) => student.department)).size,
    averageCgpa: average('cgpa'),
    averageAttendance: average('attendance'),
    averageSuccessScore: average('successScore'),
    highRiskStudents: demoStudents.filter((student) => student.riskLevel === 'High Risk').length,
    lowRiskStudents: demoStudents.filter((student) => student.riskLevel === 'Low Risk').length,
    mediumRiskStudents: demoStudents.filter((student) => student.riskLevel === 'Medium Risk').length,
    placementReadiness: average('placementReadiness'),
    engagement: average('lms'),
    studentCountByDepartment: [...new Set(demoStudents.map((student) => student.department))].sort().map((department) => ({
      department,
      count: demoStudents.filter((student) => student.department === department).length,
    })),
  }
}

export const getRiskLabelColor = (riskLevel) => {
  switch (riskLevel) {
    case 'High Risk':
      return 'bg-red-100 text-red-600'
    case 'Medium Risk':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-emerald-100 text-emerald-700'
  }
}

export const askStudentAssistant = (message, accessToken) => apiFetch('/assistant/chat', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ message }),
})
