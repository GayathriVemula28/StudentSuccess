import { createContext, useContext, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Download,
  GraduationCap,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { defaultStudent, demoFaculty, demoStudents, departmentChart, riskTrendData } from './data/demoData'
import { askStudentAssistant, clearSessionUser, getAdminOverview, getFacultyStudents, getSessionUser, getStudentById, loginDemoUser, logout, registerStudent, saveSessionUser, uploadStudentCsv } from './services/api'
import { createFirebaseStudent, firebaseAuth, getFirebaseAuthError, isFirebaseConfigured, sendFirebasePasswordReset, signInFirebaseStudent, signInWithGoogle, signOutFirebase, subscribeToFirebaseAuth, toSessionUser } from './services/firebase'
import { getAssistantContext, getAssistantStudent, getDailySuggestions, getOfflineAssistantReply } from './services/studentAssistant'

const studentNav = ['Overview', 'Academic', 'Attendance', 'LMS', 'Engagement', 'Placement', 'Skills', 'Feedback', 'Recommendations']
const studentNavIcons = {
  Overview: LayoutGrid,
  Academic: BookOpen,
  Attendance: CalendarCheck2,
  LMS: GraduationCap,
  Engagement: TrendingUp,
  Placement: Briefcase,
  Skills: Star,
  Feedback: CheckCircle2,
  Recommendations: Sparkles,
}
const CONDONATION_ATTENDANCE_THRESHOLD = 75
const DEMO_CONDONATION_FEE = 500
const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const cached = getSessionUser()
    return cached?.authProvider === 'demo' ? cached : null
  })
  const [loading, setLoading] = useState(isFirebaseConfigured)

  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      setUser(getSessionUser())
      setLoading(false)
      return undefined
    }

    let active = true
    const unsubscribe = subscribeToFirebaseAuth(async (firebaseUser) => {
      if (!firebaseUser) {
        const cached = getSessionUser()
        if (cached?.authProvider === 'demo') setUser(cached)
        else {
          clearSessionUser()
          setUser(null)
        }
        setLoading(false)
        return
      }

      try {
        const sessionUser = await toSessionUser(firebaseUser)
        if (!active) return
        saveSessionUser(sessionUser)
        setUser(sessionUser)
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }, () => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const adoptSession = (sessionUser) => {
    saveSessionUser(sessionUser)
    setUser(sessionUser)
  }

  const signOut = async () => {
    await signOutFirebase()
    logout()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, adoptSession, signOut }}>{children}</AuthContext.Provider>
}

function useAuth() {
  return useContext(AuthContext)
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.9c-.58 2.96-2.26 5.48-4.77 7.18l7.73 6C44.37 38.05 47 31.9 47 24.55Z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.9.94 7.59 2.56 10.78l7.97-6.19Z" transform="translate(0 4)" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -4)" />
    </svg>
  )
}

function calculateStudentSuccessScore(student) {
  const engagementScore = Math.min(
    100,
    ((student.engagement.hackathons * 12) +
      (student.engagement.workshops * 8) +
      (student.engagement.clubs * 7) +
      (student.engagement.seminars * 6) +
      (student.engagement.events * 5) +
      (student.engagement.projects * 9) +
      (student.engagement.certifications * 8) +
      (student.engagement.peerActivities * 4) +
      (student.lmsActivity.loginFrequency * 4)) / 2.5
  )

  const weightedScore = (
    (student.academic * 0.30) +
    (student.attendance * 0.25) +
    (student.lms * 0.15) +
    (student.skills * 0.15) +
    (student.placementReadiness * 0.10) +
    (engagementScore * 0.05)
  )

  return Math.round(weightedScore)
}

function getRiskBand(score, highThreshold, mediumThreshold) {
  if (score < highThreshold) return 'High Risk'
  if (score < mediumThreshold) return 'Medium Risk'
  return 'Low Risk'
}

function getWorseRisk(first, second) {
  const riskOrder = { 'Low Risk': 0, 'Medium Risk': 1, 'High Risk': 2 }
  return riskOrder[first] >= riskOrder[second] ? first : second
}

function getStudentRiskProfile(student) {
  let academicRisk = getRiskBand(student.academic, 55, 70)
  let placementRisk = getRiskBand(student.placementReadiness, 50, 70)
  const academicReasons = []
  const placementReasons = []

  if (student.academic < 70) {
    academicReasons.push(`Academic score is ${student.academic}% (target: 70% or higher).`)
  }
  if (student.cgpa < 6) {
    academicReasons.push(`CGPA is ${student.cgpa}, indicating academic recovery may be needed.`)
    academicRisk = getWorseRisk(academicRisk, student.cgpa < 5.5 ? 'High Risk' : 'Medium Risk')
  }
  const backlogs = student.subjects.filter((subject) => subject.marks < 50)
  if (backlogs.length) {
    academicReasons.push(`Below-pass marks in: ${backlogs.map((subject) => subject.name).join(', ')}.`)
    academicRisk = 'High Risk'
  }
  const trend = student.academicTrend || []
  if (trend.length > 1 && trend[trend.length - 1] < trend[0] - 0.4) {
    academicReasons.push('Academic trend is declining across recent semesters.')
    academicRisk = getWorseRisk(academicRisk, 'Medium Risk')
  }
  if (!academicReasons.length) academicReasons.push('No significant academic risk signals detected.')

  if (student.placementReadiness < 70) {
    placementReasons.push(`Placement readiness is ${student.placementReadiness}% (target: 70% or higher).`)
  }
  const placementFactors = [
    ['Aptitude', student.aptitude],
    ['Coding', student.coding],
    ['Communication', student.communication],
    ['Interview', student.interview],
  ]
  placementFactors.forEach(([name, value]) => {
    if (value < 55) {
      placementReasons.push(`${name} readiness is low at ${value}%.`)
      placementRisk = getWorseRisk(placementRisk, value < 40 ? 'High Risk' : 'Medium Risk')
    }
  })
  if (student.skills < 55) {
    placementReasons.push(`Technical and soft-skills score is ${student.skills}%.`)
    placementRisk = getWorseRisk(placementRisk, student.skills < 40 ? 'High Risk' : 'Medium Risk')
  }
  if (!placementReasons.length) placementReasons.push('No significant placement risk signals detected.')

  const attendanceRisk = getRiskBand(student.attendance, 60, 75)
  const overallRisk = getWorseRisk(getWorseRisk(academicRisk, placementRisk), attendanceRisk)

  return { academicRisk, academicReasons, placementRisk, placementReasons, attendanceRisk, overallRisk }
}

function RiskBadge({ level }) {
  const styles = level === 'High Risk'
    ? 'bg-red-100 text-red-700'
    : level === 'Medium Risk'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-emerald-100 text-emerald-700'

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>{level}</span>
}

function RiskAreaCard({ title, level, reasons }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <RiskBadge level={level} />
      </div>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {reasons.map((reason) => <li key={reason} className="flex gap-2"><span className="text-indigo-500">•</span><span>{reason}</span></li>)}
      </ul>
    </div>
  )
}

function CondonationFeeNotice({ attendance }) {
  if (attendance >= CONDONATION_ATTENDANCE_THRESHOLD) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5" role="status">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-semibold">Attendance below the 75% threshold</h3>
          </div>
          <p className="mt-2 text-sm text-amber-900">Your attendance is {attendance}%. You may need to contact the college office about condonation eligibility and payment.</p>
          <p className="mt-2 text-xs text-amber-800">Fee shown is an illustrative demo amount only. Confirm the actual amount and eligibility with your institution.</p>
        </div>
        <div className="shrink-0 rounded-xl border border-amber-200 bg-white px-4 py-3 sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimated demo fee</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">₹{DEMO_CONDONATION_FEE}</p>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PublicOnlyRoute><LandingPage /></PublicOnlyRoute>} />
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/signin" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/signup" element={<PublicOnlyRoute><SignupRolePickerPage /></PublicOnlyRoute>} />
          <Route path="/signup/student" element={<PublicOnlyRoute><StudentSignupPage /></PublicOnlyRoute>} />
          <Route path="/signup/faculty" element={<PublicOnlyRoute><FacultySignupPage /></PublicOnlyRoute>} />
          <Route path="/signup/admin" element={<PublicOnlyRoute><AdminSignupPage /></PublicOnlyRoute>} />
          <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/faculty" element={<ProtectedRoute role="faculty"><FacultyDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/signup" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm font-medium text-slate-500">Checking your secure session…</div>
  if (user) return <Navigate to={user.role === 'student' ? '/dashboard' : `/${user.role}`} replace />
  return children
}

function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center text-sm font-medium text-slate-500">Checking your secure session…</div>
  if (!user) return <Navigate to="/signin" replace />
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />
  return children
}

function LandingPage() {
  const navigate = useNavigate()
  const featureCards = [
    { title: 'Personalized growth plan', text: 'Turn weak areas into focused actions with a clear study strategy and weekly momentum goals.', icon: <Target className="h-6 w-6" /> },
    { title: 'Smart academic insights', text: 'Track your performance, attendance, LMS activities, and skills with simple, actionable scorecards.', icon: <TrendingUp className="h-6 w-6" /> },
    { title: 'Career readiness roadmap', text: 'Build skills and confidence for internships, placements, and graduate opportunities using measurable progress.', icon: <GraduationCap className="h-6 w-6" /> },
  ]

  const improvementSteps = [
    'Assess your current skills and identify what is limiting your growth.',
    'Build a weekly routine with attendance, focus, and assignment goals.',
    'Track results in real time and adjust when performance dips.',
  ]

  return (
    <div className="landing-page min-h-screen bg-slate-50 text-slate-900">
      <header className="landing-topbar mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">StudentPulse</p>
            <h1 className="text-xl font-semibold text-slate-900">AI Growth Platform</h1>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="transition hover:text-slate-900">Features</a>
          <a href="#impact" className="transition hover:text-slate-900">Impact</a>
          <a href="#plan" className="transition hover:text-slate-900">Plan</a>
        </nav>
        <button onClick={() => navigate('/signin')} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800">
          Student Login
        </button>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:pt-14">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
              <Sparkles className="h-4 w-4" />
              Smarter learning, better outcomes
            </div>
            <h2 className="landing-title max-w-xl text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
              Build a stronger future with a plan that actually helps students improve.
            </h2>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              StudentPulse helps learners grow with clear score insights, personal recommendations, focus routines, and career guidance designed for real academic progress.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button onClick={() => navigate('/signin')} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-200 transition hover:opacity-95">
                Explore dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => navigate('/signup')} className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900">
                Start learning
              </button>
            </div>
            <div className="mt-10 flex flex-wrap gap-8 text-sm text-slate-600">
              <div><span className="block text-2xl font-bold text-slate-900">92%</span> student retention</div>
              <div><span className="block text-2xl font-bold text-slate-900">12k+</span> monthly milestones</div>
              <div><span className="block text-2xl font-bold text-slate-900">4.9/5</span> improvement score</div>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
              <div className="rounded-[20px] bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-indigo-100">Student score</p>
                    <h3 className="mt-3 text-4xl font-bold">82%</h3>
                  </div>
                  <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-5 h-2.5 rounded-full bg-white/20">
                  <div className="h-full w-[82%] rounded-full bg-white" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Attendance', value: '91%', tone: 'text-emerald-600 bg-emerald-50' },
                  { label: 'Course focus', value: '8.4/10', tone: 'text-violet-600 bg-violet-50' },
                  { label: 'Assignments', value: '12 done', tone: 'text-sky-600 bg-sky-50' },
                  { label: 'Career prep', value: '74%', tone: 'text-amber-600 bg-amber-50' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <div className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${item.tone}`}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                      <CalendarCheck2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">Weekly improvement target</p>
                      <p className="text-xs text-slate-500">Complete 3 priority tasks</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">Progress 76%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-600">Why students choose it</p>
              <h3 className="mt-4 text-3xl font-bold text-slate-900 md:text-4xl">Everything students need to improve with confidence.</h3>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {featureCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                    {card.icon}
                  </div>
                  <h4 className="text-xl font-semibold text-slate-900">{card.title}</h4>
                  <p className="mt-3 text-slate-600">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="impact" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
          <div className="rounded-[32px] bg-slate-900 p-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.2)] md:p-12">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-200">Your growth loop</p>
                <h3 className="mt-4 text-3xl font-bold md:text-4xl">A simple system that turns effort into measurable progress.</h3>
              </div>

              <div className="space-y-4">
                {improvementSteps.map((step, index) => (
                  <div key={step} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">{index + 1}</div>
                      <p className="text-slate-100">{step}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="plan" className="bg-slate-50 pb-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-3">
              {[
                { title: 'Study smarter', text: 'Prioritize the topics that matter most and follow a realistic, measurable study routine.' },
                { title: 'Stay consistent', text: 'Use reminders, habit scoring, and routine planning to keep your momentum steady.' },
                { title: 'Prepare for the future', text: 'Strengthen career readiness with skills, communication, and placement-focused improvement goals.' },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-xl font-semibold text-slate-900">{item.title}</h4>
                  <p className="mt-3 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-600 md:flex-row lg:px-10">
          <p>© 2026 StudentPulse AI. Designed for student growth and improvement.</p>
          <button onClick={() => navigate('/signin')} className="inline-flex items-center gap-2 font-medium text-indigo-600 hover:text-indigo-700">
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const { adoptSession } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const demoLoginAccounts = [
    { role: 'Student', email: 'ananya@pulse.edu', password: 'PulseStu-1001!' },
    { role: 'Faculty', email: 'nair@pulse.edu', password: 'Faculty-Nair!26' },
    { role: 'Admin', email: 'admin@pulse.edu', password: 'Admin-Pulse!26' },
  ]

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    try {
      if (demoMode && isFirebaseConfigured) await signOutFirebase()
      const user = demoMode || !isFirebaseConfigured
        ? await loginDemoUser(form)
        : await signInFirebaseStudent({ email: form.email.trim(), password: form.password })
      adoptSession(user)
      navigate(user.role === 'student' ? '/dashboard' : `/${user.role}`)
    } catch (err) {
      setError(demoMode || !isFirebaseConfigured ? err.message : getFirebaseAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError('')
    setNotice('')
    try {
      const user = await signInWithGoogle({ emailHint: form.email.trim() })
      adoptSession(user)
      navigate(user.role === 'student' ? '/dashboard' : `/${user.role}`)
    } catch (err) {
      setError(getFirebaseAuthError(err))
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError('')
    setNotice('')
    const email = form.email.trim()
    if (!email) {
      setError('Enter your email address first, then select Forgot password.')
      return
    }
    try {
      await sendFirebasePasswordReset(email)
      setNotice(`Password reset instructions were sent to ${email}.`)
    } catch (err) {
      setError(getFirebaseAuthError(err))
    }
  }

  return (
    <div className="auth-page min-h-screen bg-slate-100 px-4 py-10 text-slate-800">
      <div className="auth-panel mx-auto grid max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="auth-brand-panel relative hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-blue-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur-sm">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-100">Academics AI</p>
                <h1 className="text-2xl font-semibold">AI-Powered Student Analytics Success Platform</h1>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-indigo-100">Student success platform</p>
                  <h2 className="mt-4 text-4xl font-semibold">Your academic journey, powered by AI.</h2>
              </div>
              <div className="grid gap-3 text-sm text-indigo-50">
                {['Explainable success score engine', 'Faculty risk intervention workflows', 'Institution-level analytics dashboard'].map((line) => (
                  <div key={line} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                    <ShieldCheck className="h-5 w-5 text-cyan-200" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-sm font-semibold text-white">Secure student analytics</p>
            <p className="mt-2 text-sm leading-6 text-indigo-100">Track academics, attendance, learning progress, strengths, and opportunities to improve.</p>
            <div className="mt-5 flex items-center gap-2 text-xs text-indigo-200"><ShieldCheck className="h-4 w-4" /> Firebase-secured sign-in</div>
          </div>
        </div>

        <div className="auth-form-panel p-8 lg:p-12">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-400">Welcome back</p>
              <h3 className="mt-2 text-3xl font-semibold text-slate-900">Sign in</h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <UserRound className="h-6 w-6" />
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {!isFirebaseConfigured && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Firebase setup required for real accounts.</strong> Configure VITE_FIREBASE_* using frontend/.env.example. Demo role previews remain available below.</div>}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input type="email" name="email" required autoComplete="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setDemoMode(false) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-indigo-400 focus:bg-white" placeholder="you@college.edu" />
            </div>

            <button type="button" onClick={handleGoogleSignIn} disabled={googleLoading || loading} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"><GoogleMark />{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</button>
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400"><span className="h-px flex-1 bg-slate-200" />or with email<span className="h-px flex-1 bg-slate-200" /></div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} name="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-base outline-none focus:border-indigo-400 focus:bg-white" placeholder="Enter your password" />
                <button type="button" className="absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-500" onClick={() => setShowPassword((prev) => !prev)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview a demo dashboard</p>
              <div className="grid grid-cols-3 gap-2">
                {demoLoginAccounts.map((account) => (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => { setForm({ email: account.email, password: account.password }); setDemoMode(true); setError(''); setNotice('') }}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {account.role}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

            <button type="submit" disabled={loading || googleLoading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 font-medium text-white shadow-lg shadow-indigo-300/40 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? 'Signing in...' : 'Login'}
            </button>
            <div className="text-right"><button type="button" onClick={handleForgotPassword} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Forgot password?</button></div>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Firebase-secured sign-in</p>
            <p className="mt-1">Use your student email and password or continue with Google. Demo role buttons are sample dashboard previews.</p>
          </div>
          <p className="mt-5 text-center text-sm text-slate-600">New student? <button type="button" onClick={() => navigate('/signup')} className="font-semibold text-indigo-600 hover:text-indigo-700">Create an account</button></p>
        </div>
      </div>
    </div>
  )
}

function SignupRolePickerPage() {
  const navigate = useNavigate()
  const roles = [
    { key: 'student', label: 'Student', icon: <GraduationCap className="h-7 w-7" />, description: 'Track your academic progress, skills, and growth goals.' },
    { key: 'faculty', label: 'Faculty', icon: <BarChart3 className="h-7 w-7" />, description: 'Monitor student performance and intervention insights.' },
    { key: 'admin', label: 'Admin', icon: <ShieldCheck className="h-7 w-7" />, description: 'Review campus-wide student success and operational trends.' },
  ]

  return (
    <div className="signup-page min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 px-4 py-8 text-slate-800 sm:py-12">
      <div className="signup-card mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <header className="signup-header bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-100">Student Success</p>
              <h1 className="text-2xl font-semibold">Create your account</h1>
            </div>
          </div>
          <p className="mt-5 text-lg font-semibold text-white">Choose your access role</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-indigo-100">Build a profile for student success, faculty monitoring, or admin oversight.</p>
        </header>

        <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-10">
          {roles.map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => navigate(`/signup/${role.key}`)}
              className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-lg"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
                {role.icon}
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-900">{role.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{role.description}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">
                Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FacultySignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    employee_id: '',
    email: '',
    department: 'CSE',
    designation: 'Professor',
    phone_number: '',
    password: '',
    confirm_password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.')
      return
    }
    if (!acceptedTerms) {
      setError('Accept the Terms and Conditions to create an account.')
      return
    }

    setLoading(true)
    try {
      await registerStudent({
        full_name: form.full_name.trim(),
        college_email: form.email.trim().toLowerCase(),
        department: form.department,
        phone_number: form.phone_number.trim(),
        password: form.password,
        confirm_password: form.confirm_password,
        role: 'faculty',
      })
      setSuccess('Faculty account created. Please sign in to continue.')
      setForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (submitError) {
      setError(submitError.message || 'Unable to create the faculty account.')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white'
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

  return (
    <div className="signup-page min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 px-4 py-8 text-slate-800 sm:py-12">
      <div className="signup-card mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <header className="signup-header bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-100">Student Success</p>
              <h1 className="text-2xl font-semibold">Faculty sign up</h1>
            </div>
          </div>
          <p className="mt-5 text-lg font-semibold text-white">Monitor student performance and interventions</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-7 p-6 sm:p-10">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="faculty-name">Full name *</label><input id="faculty-name" name="full_name" required value={form.full_name} onChange={updateField} className={fieldClass} placeholder="Your full name" /></div>
            <div><label className={labelClass} htmlFor="faculty-id">Employee ID *</label><input id="faculty-id" name="employee_id" required value={form.employee_id} onChange={updateField} className={fieldClass} placeholder="FAC-001" /></div>
            <div><label className={labelClass} htmlFor="faculty-email">Work email *</label><input id="faculty-email" type="email" name="email" required value={form.email} onChange={updateField} className={fieldClass} placeholder="faculty@college.edu" /></div>
            <div><label className={labelClass} htmlFor="faculty-department">Department *</label><select id="faculty-department" name="department" required value={form.department} onChange={updateField} className={fieldClass}>{['CSE', 'IT', 'ECE', 'AI&DS', 'MECH'].map((department) => <option key={department}>{department}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="faculty-designation">Designation *</label><select id="faculty-designation" name="designation" required value={form.designation} onChange={updateField} className={fieldClass}>{['Professor', 'Associate Professor', 'Assistant Professor', 'Head of Department'].map((designation) => <option key={designation}>{designation}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="faculty-phone">Phone number *</label><input id="faculty-phone" type="tel" name="phone_number" required value={form.phone_number} onChange={updateField} className={fieldClass} placeholder="Contact number" /></div>
            <div><label className={labelClass} htmlFor="faculty-password">Password *</label><input id="faculty-password" type="password" name="password" required minLength="8" value={form.password} onChange={updateField} className={fieldClass} placeholder="At least 8 characters" /></div>
            <div><label className={labelClass} htmlFor="faculty-confirm">Confirm password *</label><input id="faculty-confirm" type="password" name="confirm_password" required minLength="8" value={form.confirm_password} onChange={updateField} className={fieldClass} placeholder="Confirm password" /></div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
            <span>I accept the <strong className="font-semibold text-indigo-600">Terms and Conditions</strong> for faculty access.</span>
          </label>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><p className="font-semibold">Account created</p><p className="mt-1">{success}</p></div>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => navigate('/signup')} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Choose another role</button>
            <button type="submit" disabled={loading} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Creating account…' : 'Create Faculty Account'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdminSignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    admin_id: '',
    email: '',
    campus_name: 'Main Campus',
    phone_number: '',
    password: '',
    confirm_password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.')
      return
    }
    if (!acceptedTerms) {
      setError('Accept the Terms and Conditions to create an account.')
      return
    }

    setLoading(true)
    try {
      await registerStudent({
        full_name: form.full_name.trim(),
        college_email: form.email.trim().toLowerCase(),
        campus_name: form.campus_name,
        phone_number: form.phone_number.trim(),
        password: form.password,
        confirm_password: form.confirm_password,
        role: 'admin',
      })
      setSuccess('Admin account created. Please sign in to continue.')
      setForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (submitError) {
      setError(submitError.message || 'Unable to create the admin account.')
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white'
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

  return (
    <div className="signup-page min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 px-4 py-8 text-slate-800 sm:py-12">
      <div className="signup-card mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <header className="signup-header bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-100">Student Success</p>
              <h1 className="text-2xl font-semibold">Admin sign up</h1>
            </div>
          </div>
          <p className="mt-5 text-lg font-semibold text-white">Manage institution-level student success trends</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-7 p-6 sm:p-10">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="admin-name">Full name *</label><input id="admin-name" name="full_name" required value={form.full_name} onChange={updateField} className={fieldClass} placeholder="Your full name" /></div>
            <div><label className={labelClass} htmlFor="admin-id">Admin ID *</label><input id="admin-id" name="admin_id" required value={form.admin_id} onChange={updateField} className={fieldClass} placeholder="ADM-001" /></div>
            <div><label className={labelClass} htmlFor="admin-email">Admin email *</label><input id="admin-email" type="email" name="email" required value={form.email} onChange={updateField} className={fieldClass} placeholder="admin@college.edu" /></div>
            <div><label className={labelClass} htmlFor="admin-campus">Campus *</label><select id="admin-campus" name="campus_name" required value={form.campus_name} onChange={updateField} className={fieldClass}>{['Main Campus', 'North Campus', 'South Campus', 'Online Campus'].map((campus) => <option key={campus}>{campus}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="admin-phone">Phone number *</label><input id="admin-phone" type="tel" name="phone_number" required value={form.phone_number} onChange={updateField} className={fieldClass} placeholder="Contact number" /></div>
            <div><label className={labelClass} htmlFor="admin-password">Password *</label><input id="admin-password" type="password" name="password" required minLength="8" value={form.password} onChange={updateField} className={fieldClass} placeholder="At least 8 characters" /></div>
            <div className="sm:col-span-2"><label className={labelClass} htmlFor="admin-confirm">Confirm password *</label><input id="admin-confirm" type="password" name="confirm_password" required minLength="8" value={form.confirm_password} onChange={updateField} className={fieldClass} placeholder="Confirm password" /></div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
            <span>I accept the <strong className="font-semibold text-indigo-600">Terms and Conditions</strong> for admin access.</span>
          </label>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><p className="font-semibold">Account created</p><p className="mt-1">{success}</p></div>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => navigate('/signup')} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Choose another role</button>
            <button type="submit" disabled={loading} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Creating account…' : 'Create Admin Account'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StudentSignupPage() {
  const navigate = useNavigate()
  const { adoptSession } = useAuth()
  const [form, setForm] = useState({
    full_name: '',
    student_id: '',
    college_email: '',
    personal_email: '',
    department: 'CSE',
    year: '1st Year',
    section: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    skills: '',
    career_goal: '',
  })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password)) {
      setError('Use at least one uppercase letter, one lowercase letter, and one number.')
      return
    }
    if (form.password !== form.confirm_password) {
      setError('The passwords do not match.')
      return
    }
    if (!acceptedTerms) {
      setError('Accept the Terms and Conditions to create an account.')
      return
    }

    setLoading(true)
    try {
      if (isFirebaseConfigured) {
        const firebaseSession = await createFirebaseStudent({
          email: form.college_email.trim().toLowerCase(),
          password: form.password,
          fullName: form.full_name.trim(),
          profile: {
            studentId: form.student_id.trim(),
            personalEmail: form.personal_email.trim().toLowerCase(),
            department: form.department,
            year: form.year,
            section: form.section.trim(),
            phoneNumber: form.phone_number.trim(),
            skills: form.skills.trim(),
            careerGoal: form.career_goal.trim(),
            termsAcceptedAt: new Date().toISOString(),
          },
        })
        adoptSession(firebaseSession)
        navigate('/dashboard')
        return
      }

      const result = await registerStudent({
        ...form,
        full_name: form.full_name.trim(),
        student_id: form.student_id.trim(),
        college_email: form.college_email.trim().toLowerCase(),
        personal_email: form.personal_email.trim().toLowerCase(),
        section: form.section.trim(),
        phone_number: form.phone_number.trim(),
        skills: form.skills.trim(),
        career_goal: form.career_goal.trim(),
      })
      setSuccess(result.message || 'Signup submitted. Your account is waiting for administrator approval.')
      setForm((current) => ({ ...current, password: '', confirm_password: '' }))
    } catch (submitError) {
      setError(submitError.message || 'Could not submit signup. Check that the backend server is running.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setError('')
    setSuccess('')
    if (!form.full_name.trim()) {
      setError('Enter your full name before continuing with Google.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.college_email.trim())) {
      setError('Enter a valid student email address first.')
      return
    }
    if (!acceptedTerms) {
      setError('Accept the Terms and Conditions to create an account.')
      return
    }

    setGoogleLoading(true)
    try {
      const firebaseSession = await signInWithGoogle({
        emailHint: form.college_email.trim(),
        profile: {
          studentId: form.student_id.trim(),
          personalEmail: form.personal_email.trim().toLowerCase(),
          department: form.department,
          year: form.year,
          section: form.section.trim(),
          phoneNumber: form.phone_number.trim(),
          skills: form.skills.trim(),
          careerGoal: form.career_goal.trim(),
          termsAcceptedAt: new Date().toISOString(),
        },
      })
      adoptSession(firebaseSession)
      navigate('/dashboard')
    } catch (googleError) {
      setError(getFirebaseAuthError(googleError))
    } finally {
      setGoogleLoading(false)
    }
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white'
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

  return (
    <div className="signup-page min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 px-4 py-8 text-slate-800 sm:py-12">
      <div className="signup-card mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <header className="signup-header bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 shadow-lg">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-100">Student Success</p>
              <h1 className="text-2xl font-semibold">Create your account</h1>
            </div>
          </div>
          <p className="mt-5 text-lg font-semibold text-white">Student Success platform</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-indigo-100">Your academic journey, powered by data and AI insights. Create an account to track progress and unlock your goals.</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-7 p-6 sm:p-10">
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Personal and academic details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="signup-full-name">Full name *</label><input id="signup-full-name" name="full_name" required autoComplete="name" value={form.full_name} onChange={updateField} className={fieldClass} placeholder="Your full name" /></div>
              <div><label className={labelClass} htmlFor="signup-student-id">Student ID *</label><input id="signup-student-id" name="student_id" required value={form.student_id} onChange={updateField} className={fieldClass} placeholder="e.g. STU-2001" /></div>
              <div><label className={labelClass} htmlFor="signup-college-email">Student email address *</label><input id="signup-college-email" type="email" name="college_email" required autoComplete="email" value={form.college_email} onChange={updateField} className={fieldClass} placeholder="you@college.edu" /></div>
              {form.college_email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.college_email.trim()) && <button type="button" onClick={handleGoogleSignup} disabled={googleLoading || loading} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 sm:col-span-2"><GoogleMark />{googleLoading ? 'Connecting to Google…' : 'Sign up with Google'}</button>}
              <div><label className={labelClass} htmlFor="signup-personal-email">Personal email</label><input id="signup-personal-email" type="email" name="personal_email" value={form.personal_email} onChange={updateField} className={fieldClass} placeholder="Optional" /></div>
              <div><label className={labelClass} htmlFor="signup-department">Department *</label><select id="signup-department" name="department" required value={form.department} onChange={updateField} className={fieldClass}>{['CSE', 'IT', 'ECE', 'AI&DS', 'MECH'].map((department) => <option key={department}>{department}</option>)}</select></div>
              <div><label className={labelClass} htmlFor="signup-year">Year *</label><select id="signup-year" name="year" required value={form.year} onChange={updateField} className={fieldClass}>{['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year) => <option key={year}>{year}</option>)}</select></div>
              <div><label className={labelClass} htmlFor="signup-section">Section *</label><input id="signup-section" name="section" required value={form.section} onChange={updateField} className={fieldClass} placeholder="e.g. A" /></div>
              <div><label className={labelClass} htmlFor="signup-phone">Phone number *</label><input id="signup-phone" type="tel" name="phone_number" required autoComplete="tel" value={form.phone_number} onChange={updateField} className={fieldClass} placeholder="Contact number" /></div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Goals and interests</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="signup-skills">Skills *</label><textarea id="signup-skills" name="skills" required rows="3" value={form.skills} onChange={updateField} className={fieldClass} placeholder="List your skills, separated by commas" /></div>
              <div><label className={labelClass} htmlFor="signup-career-goal">Career goal *</label><textarea id="signup-career-goal" name="career_goal" required rows="3" value={form.career_goal} onChange={updateField} className={fieldClass} placeholder="What role or field are you working toward?" /></div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Create password</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="signup-password">Password *</label><input id="signup-password" type="password" name="password" required minLength="8" autoComplete="new-password" value={form.password} onChange={updateField} className={fieldClass} placeholder="At least 8 characters" /></div>
              <div><label className={labelClass} htmlFor="signup-confirm-password">Confirm password *</label><input id="signup-confirm-password" type="password" name="confirm_password" required minLength="8" autoComplete="new-password" value={form.confirm_password} onChange={updateField} className={fieldClass} placeholder="Enter password again" /></div>
            </div>
          </section>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
            <span>I accept the <strong className="font-semibold text-indigo-600">Terms and Conditions</strong> and understand my profile data is used to provide student analytics.</span>
          </label>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><p className="font-semibold">Registration submitted</p><p className="mt-1">{success}</p><p className="mt-2">After an administrator approves your account, you can sign in using your college email and the password you created.</p></div>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => navigate('/signin')} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Already registered? Sign in</button>
            <button type="submit" disabled={loading || googleLoading || Boolean(success)} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Creating account…' : success ? 'Submitted' : 'Create Account'}</button>
          </div>
          <p className="text-center text-xs text-slate-500">Firebase Authentication manages passwords; the app never stores them in your profile. When Firebase is not configured, signup uses the legacy demo backend.</p>
        </form>
      </div>
    </div>
  )
}

function StudentDashboard() {
  const user = getSessionUser()
  const student = getStudentById(user?.id || defaultStudent.id)
  const [activeTab, setActiveTab] = useState('Overview')
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [lastAssistantPrompt, setLastAssistantPrompt] = useState('')
  const [assistantProvider, setAssistantProvider] = useState('')
  const [assistantMessages, setAssistantMessages] = useState([
    { sender: 'assistant', text: 'Ask about your study focus, attendance, or assignments. I will use only information available in your portal.' },
  ])

  const studentSuccessScore = calculateStudentSuccessScore(student)
  const riskProfile = getStudentRiskProfile(student)
  const assistantStudent = getAssistantStudent(user)
  const assistantContext = getAssistantContext(assistantStudent)
  const dailySuggestions = getDailySuggestions(assistantContext)
  const scoreBreakdown = [
    { name: 'Academic', value: Math.round(student.academic * 0.3) },
    { name: 'Attendance', value: Math.round(student.attendance * 0.25) },
    { name: 'LMS', value: Math.round(student.lms * 0.15) },
    { name: 'Skills', value: Math.round(student.skills * 0.15) },
    { name: 'Placement', value: Math.round(student.placementReadiness * 0.10) },
    { name: 'Engagement', value: Math.round(Math.min(100, ((student.engagement.hackathons * 12) + (student.engagement.workshops * 8) + (student.engagement.clubs * 7) + (student.engagement.seminars * 6) + (student.engagement.events * 5) + (student.engagement.projects * 9) + (student.engagement.certifications * 8) + (student.engagement.peerActivities * 4) + (student.lmsActivity.loginFrequency * 4)) / 2.5) * 0.05) },
  ]

  const academicData = student.subjects.map((item) => ({ name: item.name, marks: item.marks }))
  const trendData = student.academicTrend.map((score, index) => ({ name: `Sem ${index + 1}`, score }))
  const attendanceData = student.attendanceTrend.map((value, index) => ({ name: `W${index + 1}`, value }))
  const sendAssistantMessage = async (prompt) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || assistantLoading) return

    setAssistantMessages((currentMessages) => [
      ...currentMessages,
      { sender: 'student', text: trimmedPrompt },
    ])
    setAssistantInput('')
    setAssistantError('')
    setLastAssistantPrompt(trimmedPrompt)
    setAssistantLoading(true)

    try {
      const response = user?.accessToken
        ? await askStudentAssistant(trimmedPrompt, user.accessToken)
        : { answer: getOfflineAssistantReply(trimmedPrompt, assistantContext), provider: 'local' }
      setAssistantMessages((currentMessages) => [...currentMessages, { sender: 'assistant', text: response.answer }])
      setAssistantProvider(response.provider)
    } catch (error) {
      setAssistantError(error.message || 'The assistant could not respond. Please try again.')
    } finally {
      setAssistantLoading(false)
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Overview':
        return (
          <div className="space-y-8">
            <div className="flex flex-col gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-indigo-900">Sample analytics preview</p><p className="mt-0.5 text-xs text-indigo-700">Academic metrics and charts are demo data until connected to your institution's student records.</p></div>
              <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">Demo data</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: 'Student Success Score', value: studentSuccessScore, suffix: '/100', color: 'bg-violet-100 text-violet-700', icon: <Sparkles className="h-4 w-4" /> },
                { label: 'Academic Score', value: student.academic, suffix: '%', color: 'bg-emerald-100 text-emerald-700', icon: <BookOpen className="h-4 w-4" /> },
                { label: 'Attendance', value: student.attendance, suffix: '%', color: 'bg-sky-100 text-sky-700', icon: <CheckCircle2 className="h-4 w-4" /> },
                { label: 'LMS Engagement', value: student.lms, suffix: '%', color: 'bg-amber-100 text-amber-700', icon: <LayoutGrid className="h-4 w-4" /> },
                { label: 'Placement Readiness', value: student.placementReadiness, suffix: '%', color: 'bg-pink-100 text-pink-700', icon: <Briefcase className="h-4 w-4" /> },
                { label: 'Skills Score', value: student.skills, suffix: '%', color: 'bg-indigo-100 text-indigo-700', icon: <Star className="h-4 w-4" /> },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div className={`rounded-xl p-2 ${item.color}`}>{item.icon}</div>
                    <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Status</div>
                  </div>
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-semibold text-slate-900">{item.value}</span>
                    <span className="pb-1 text-sm text-slate-500">{item.suffix}</span>
                  </div>
                  <div className="mt-4 h-2.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Your risk insights</h2>
                  <p className="mt-1 text-sm text-slate-500">Signals are based on your current performance data, not a diagnosis.</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">Overall status <RiskBadge level={riskProfile.overallRisk} /></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <RiskAreaCard title="Academic risks" level={riskProfile.academicRisk} reasons={riskProfile.academicReasons} />
                <RiskAreaCard title="Placement risks" level={riskProfile.placementRisk} reasons={riskProfile.placementReasons} />
              </div>
              {riskProfile.attendanceRisk !== 'Low Risk' && <p className="mt-3 text-sm text-amber-700">Attendance alert: current attendance is {student.attendance}%.</p>}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">AI Student Assistant</h2>
                    <p className="mt-1 text-sm text-slate-500">Personalized suggestions based on information available in your portal.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setAssistantOpen(true)} className="inline-flex w-fit items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
                  <MessageCircle className="h-4 w-4" /> Ask AI
                </button>
              </div>

              {dailySuggestions.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {dailySuggestions.map((suggestion) => {
                    const priorityStyles = suggestion.priority === 'High'
                      ? 'bg-red-100 text-red-700'
                      : suggestion.priority === 'Medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-700'
                    return (
                      <article key={suggestion.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-slate-800">{suggestion.title}</h3>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyles}`}>{suggestion.priority}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{suggestion.detail}</p>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                  <p className="font-medium text-slate-700">Personalized suggestions are not available yet</p>
                  <p className="mt-1 text-sm text-slate-500">Your portal is not connected to your academic, attendance, or assignment records.</p>
                </div>
              )}
            </section>

            {assistantOpen && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onClick={(event) => { if (event.target === event.currentTarget) setAssistantOpen(false) }}>
                <section role="dialog" aria-modal="true" aria-labelledby="assistant-dialog-title" className="flex max-h-[min(760px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">StudentPulse</p>
                      <h2 id="assistant-dialog-title" className="mt-1 text-xl font-semibold text-slate-900">Ask your AI assistant</h2>
                      <p className="mt-1 text-sm text-slate-500">Responses use only records available to your account.</p>
                    </div>
                    <button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close AI assistant" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></button>
                  </header>

                  <div className="min-h-56 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6" aria-live="polite">
                    {assistantMessages.map((message, index) => (
                      <div key={`${message.sender}-${index}`} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === 'assistant' ? 'border border-slate-200 bg-white text-slate-700' : 'ml-auto bg-indigo-600 text-white'}`}>
                        {message.text}
                      </div>
                    ))}
                    {assistantLoading && <div className="flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Checking your portal data…</div>}
                    {assistantError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p>{assistantError}</p><button type="button" onClick={() => sendAssistantMessage(lastAssistantPrompt)} disabled={assistantLoading} className="mt-2 font-semibold underline disabled:opacity-60">Try again</button></div>}
                  </div>

                  {assistantProvider && <p className="border-t border-slate-100 px-5 pt-2 text-xs text-slate-500 sm:px-6">{assistantProvider === 'openai' ? 'AI provider connected' : assistantProvider === 'rules' ? 'Data-based guidance; AI provider not configured' : 'Portal-data guidance'}</p>}
                  <form className="flex gap-2 border-t border-slate-200 p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); sendAssistantMessage(assistantInput) }}>
                    <input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} maxLength="1000" aria-label="Message the AI assistant" placeholder="Ask about study, attendance, or assignments" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-indigo-400" />
                    <button type="submit" aria-label="Send message" disabled={assistantLoading || !assistantInput.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button>
                  </form>
                </section>
              </div>
            )}

            <CondonationFeeNotice attendance={student.attendance} />

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Semester CGPA trend</h3>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">On Track</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="scoreArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#eef2ff" strokeDasharray="5 5" />
                      <XAxis dataKey="name" stroke="#94a3b8" />
                      <YAxis domain={[5, 10]} stroke="#94a3b8" />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" stroke="#4f46e5" fill="url(#scoreArea)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Explainable score</h3>
                  <span className="text-sm font-medium text-violet-600">{studentSuccessScore}/100</span>
                </div>
                <div className="space-y-3">
                  {scoreBreakdown.map((entry) => (
                    <div key={entry.name}>
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                        <span>{entry.name}</span>
                        <span>{entry.value}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${entry.value * 4}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      case 'Academic':
        {
          const semesterMatch = student.semester?.match(/\d+/)
          const currentSemester = semesterMatch ? Number(semesterMatch[0]) : 1
          const totalSemesters = 8

          return (
            <div className="space-y-5">
              <RiskAreaCard title="Academic risk assessment" level={riskProfile.academicRisk} reasons={riskProfile.academicReasons} />
              <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Subject-wise marks</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={academicData}>
                        <CartesianGrid stroke="#eef2ff" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="marks" radius={[8, 8, 0, 0]} fill="#6366f1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div><p className="text-sm text-slate-500">CGPA</p><p className="mt-1 text-3xl font-semibold text-slate-900">{student.cgpa}</p></div>
                  <div>
                    <p className="text-sm text-slate-500">Semester</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{student.semester} / {totalSemesters}</p>
                    <p className="mt-1 text-xs font-medium text-indigo-600">Semester {currentSemester} of {totalSemesters}</p>
                  </div>
                  <div><p className="text-sm text-slate-500">Assignment score</p><p className="mt-1 text-xl font-semibold text-slate-900">82%</p></div>
                  <div><p className="text-sm text-slate-500">Quiz score</p><p className="mt-1 text-xl font-semibold text-slate-900">88%</p></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Subject-wise academic performance</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium">Marks</th>
                        <th className="px-4 py-3 font-medium">Backlogs</th>
                        <th className="px-4 py-3 font-medium">Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.subjects.map((subject) => {
                        const backlogCount = subject.marks < 50 ? 1 : 0
                        const performance = subject.marks >= 75 ? 'Excellent' : subject.marks >= 60 ? 'Good' : subject.marks >= 50 ? 'Average' : 'Needs focus'

                        return (
                          <tr key={subject.name} className="border-t border-slate-200">
                            <td className="px-4 py-3 font-medium text-slate-800">{subject.name}</td>
                            <td className="px-4 py-3 text-slate-700">{subject.marks}%</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${backlogCount ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {backlogCount}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-2.5 w-28 rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${subject.marks}%` }} />
                                </div>
                                <span className="text-xs font-medium text-slate-600">{performance}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        }
      case 'Attendance':
        {
          const totalPeriods = 30
          const subjectAttendance = student.subjects.map((subject, index) => {
            const percentage = Math.max(45, Math.min(98, student.attendance - index * 2 + (subject.marks - 75) * 0.35))
            const attended = Math.round((percentage / 100) * totalPeriods)
            const notAttended = totalPeriods - attended

            return {
              subject: subject.name,
              attended,
              notAttended,
              percentage: Math.round(percentage),
            }
          })

          return (
            <div className="space-y-5">
              <CondonationFeeNotice attendance={student.attendance} />
              <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Attendance trend</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={attendanceData}>
                        <defs>
                          <linearGradient id="attArea" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.08} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="5 5" />
                        <XAxis dataKey="name" />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#attArea)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Overall attendance</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Overall percentage</p>
                      <p className="mt-2 text-4xl font-semibold text-slate-900">{student.attendance}%</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700">{student.attendance >= 75 ? 'Good' : 'Needs attention'}</div>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-600"><span>Present classes</span><span>{student.attendanceBreakdown.present}</span></div>
                      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${student.attendanceBreakdown.present}%` }} /></div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-600"><span>Absent classes</span><span>{student.attendanceBreakdown.absent}</span></div>
                      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-red-400" style={{ width: `${student.attendanceBreakdown.absent}%` }} /></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Subject-wise attendance</h3>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">{student.name}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium">Periods attended</th>
                        <th className="px-4 py-3 font-medium">Periods not attended</th>
                        <th className="px-4 py-3 font-medium">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectAttendance.map((row) => (
                        <tr key={row.subject} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-medium text-slate-800">{row.subject}</td>
                          <td className="px-4 py-3 text-slate-700">{row.attended}</td>
                          <td className="px-4 py-3 text-slate-700">{row.notAttended}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-slate-800">{row.percentage}%</span>
                              <div className="h-2 w-24 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${row.percentage}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        }
      case 'LMS':
        {
          const courseNames = [
            'Data Structures',
            'DBMS',
            'Operating Systems',
            'Computer Networks',
            'Software Engineering',
          ]

          const subjectLms = student.subjects.map((subject, index) => ({
            name: subject.name,
            course: courseNames[index] || subject.name,
            videos: Math.max(6, Math.min(24, 8 + (subject.marks - 50) / 2 + index * 2)),
            assignments: Math.max(2, Math.min(10, 3 + Math.round((subject.marks - 40) / 8) + index)),
            quizzes: Math.max(2, Math.min(12, 3 + Math.round((subject.marks - 50) / 10) + index)),
            completion: Math.min(100, Math.max(35, subject.marks)),
            learningHours: Math.max(3, Math.min(12, 5 + Math.round((subject.marks - 50) / 10) + index)),
          }))

          return (
            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Courses completed', student.lmsActivity.coursesCompleted],
                  ['Videos watched', student.lmsActivity.videosWatched],
                  ['Assignments submitted', student.lmsActivity.assignmentsSubmitted],
                  ['Quiz attempts', student.lmsActivity.quizAttempts],
                  ['Login frequency', student.lmsActivity.loginFrequency],
                  ['Learning hours', student.lmsActivity.learningHours],
                  ['Completion %', `${student.lms}%`],
                  ['Engagement score', `${student.lms}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Completed courses & learning hours</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Course</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Learning hours</th>
                        <th className="px-4 py-3 font-medium">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectLms.map((subject) => (
                        <tr key={subject.name} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-medium text-slate-800">{subject.course}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Completed</span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{subject.learningHours} hrs</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-slate-800">{subject.completion}%</span>
                              <div className="h-2.5 w-28 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${subject.completion}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        }
      case 'Engagement':
        return (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Hackathons', student.engagement.hackathons],
              ['Technical workshops', student.engagement.workshops],
              ['Clubs', student.engagement.clubs],
              ['Seminars', student.engagement.seminars],
              ['Events', student.engagement.events],
              ['Projects', student.engagement.projects],
              ['Certifications', student.engagement.certifications],
              ['Peer activities', student.engagement.peerActivities],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        )
      case 'Placement':
        {
          const mockTests = Math.min(100, Math.round((student.aptitude + student.coding + student.interview) / 3))

          return (
            <div className="space-y-5">
              <RiskAreaCard title="Placement risk assessment" level={riskProfile.placementRisk} reasons={riskProfile.placementReasons} />
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Placement readiness</h3>
                  <div className="space-y-4">
                    {[['Aptitude', student.aptitude], ['Coding', student.coding], ['Communication', student.communication], ['Interview', student.interview], ['Mock tests', mockTests]].map(([label, value]) => (
                      <div key={label}>
                        <div className="mb-1 flex items-center justify-between text-sm text-slate-600"><span>{label}</span><span>{value}%</span></div>
                        <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500" style={{ width: `${value}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div>
                    <p className="text-sm text-slate-500">Resume readiness</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">78%</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Mock test score</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{mockTests}%</p>
                  </div>
                  <div className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-700">Practice coding problems for 30 minutes daily and participate in mock interviews.</div>
                </div>
              </div>
            </div>
          )
        }
      case 'Skills':
        {
          const technicalSkills = student.skillsMatrix.filter((skill) => ['Python', 'Java', 'SQL', 'React'].includes(skill.skill))
          const softSkills = [
            { skill: 'Communication', level: 'Intermediate', score: student.communication || 68 },
            { skill: 'Teamwork', level: 'Advanced', score: 82 },
            { skill: 'Leadership', level: 'Intermediate', score: 74 },
            { skill: 'Problem Solving', level: 'Advanced', score: 88 },
            { skill: 'Time Management', level: 'Good', score: 79 },
          ]

          return (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Technical skills</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {technicalSkills.map((skill) => (
                    <div key={skill.skill} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-medium text-slate-800">{skill.skill}</span>
                        <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">{skill.level}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${skill.score}%` }} /></div>
                      <div className="mt-2 text-right text-sm text-slate-500">{skill.score}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Soft skills</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {softSkills.map((skill) => (
                    <div key={skill.skill} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-medium text-slate-800">{skill.skill}</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{skill.level}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${skill.score}%` }} /></div>
                      <div className="mt-2 text-right text-sm text-slate-500">{skill.score}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        }
      case 'Feedback':
        return (
          <div className="space-y-4">
            {student.feedback.map((item) => (
              <div key={`${item.faculty}-${item.date}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{item.faculty}</p>
                    <p className="text-sm text-slate-500">{item.subject} • {item.date}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-sm font-medium text-amber-700">{item.rating}/5</span>
                </div>
                <p className="mt-4 text-slate-700">{item.comment}</p>
              </div>
            ))}
          </div>
        )
      case 'Recommendations':
        return (
          <div className="space-y-4">
            {student.recommendations.map((recommendation, index) => (
              <div key={`${recommendation}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <p className="font-medium text-slate-900">AI recommendation {index + 1}</p>
                    <p className="mt-2 text-slate-700">{recommendation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      default:
        return null
    }
  }

  return <DashboardShell title="Student Dashboard" user={user} navItems={studentNav} activeTab={activeTab} setActiveTab={setActiveTab} content={renderContent()} />
}

function FacultyDashboard() {
  const user = getSessionUser()
  const [activeTab, setActiveTab] = useState('Overview')
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState('All')
  const [departmentFilter, setDepartmentFilter] = useState('All')
  const [yearFilter, setYearFilter] = useState('All')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadState, setUploadState] = useState({ loading: false, error: '', result: null })
  const students = getFacultyStudents()
  const riskProfiles = new Map(students.map((student) => [student.id, getStudentRiskProfile(student)]))
  const countAtRisk = (riskArea) => students.filter((student) => riskProfiles.get(student.id)[riskArea] !== 'Low Risk').length
  const departments = [...new Set(students.map((student) => student.department))].sort()
  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year']
  const yearSummaries = years.map((year) => ({
    year,
    count: students.filter((student) => student.year === year).length,
  }))
  const departmentSummaries = departments.map((department) => {
    const departmentStudents = students.filter((student) => student.department === department)
    return {
      department,
      count: departmentStudents.length,
      averageScore: Math.round(departmentStudents.reduce((total, student) => total + student.successScore, 0) / departmentStudents.length),
    }
  })

  const filteredStudents = students.filter((student) => {
    const matchesQuery = `${student.name} ${student.id}`.toLowerCase().includes(query.toLowerCase())
    const matchesRisk = riskFilter === 'All' || riskProfiles.get(student.id).overallRisk === riskFilter
    const matchesDepartment = departmentFilter === 'All' || student.department === departmentFilter
    const matchesYear = yearFilter === 'All' || student.year === yearFilter
    return matchesQuery && matchesRisk && matchesDepartment && matchesYear
  })

  const handleCsvUpload = async (event) => {
    event.preventDefault()
    if (!selectedFile) {
      setUploadState({ loading: false, error: 'Choose a CSV file before uploading.', result: null })
      return
    }

    setUploadState({ loading: true, error: '', result: null })
    try {
      const result = await uploadStudentCsv(selectedFile)
      setUploadState({ loading: false, error: '', result })
    } catch (error) {
      setUploadState({ loading: false, error: error.message || 'CSV upload failed.', result: null })
    }
  }

  return (
    <DashboardShell
      title="Faculty Dashboard"
      user={user}
      navItems={['Overview', 'Students', 'Risk Review', 'Data Upload']}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      content={(
        <div className="space-y-6">
          {activeTab === 'Overview' && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Total students', value: students.length },
              { label: 'Low risk overall', value: students.filter((student) => riskProfiles.get(student.id).overallRisk === 'Low Risk').length },
              { label: 'Medium risk overall', value: students.filter((student) => riskProfiles.get(student.id).overallRisk === 'Medium Risk').length },
              { label: 'High risk overall', value: students.filter((student) => riskProfiles.get(student.id).overallRisk === 'High Risk').length },
              { label: 'Academic risks', value: countAtRisk('academicRisk') },
              { label: 'Placement risks', value: countAtRisk('placementRisk') },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Students by department</h2>
                <p className="text-sm text-slate-500">Select a department to view its student roster.</p>
              </div>
              <button onClick={() => setDepartmentFilter('All')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${departmentFilter === 'All' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
                All departments · {students.length}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {departmentSummaries.map((summary) => (
                <button
                  key={summary.department}
                  onClick={() => setDepartmentFilter(departmentFilter === summary.department ? 'All' : summary.department)}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition ${departmentFilter === summary.department ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{summary.department}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{summary.count}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Avg. success score <span className="font-medium text-slate-700">{summary.averageScore}</span></p>
                </button>
              ))}
            </div>
          </section>
          </>}

          {activeTab === 'Students' && <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Students by year</h2>
                <p className="text-sm text-slate-500">Select a year to view that cohort, or combine it with a department filter.</p>
              </div>
              <button onClick={() => setYearFilter('All')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${yearFilter === 'All' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
                All years · {students.length}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {yearSummaries.map((summary) => (
                <button
                  key={summary.year}
                  onClick={() => setYearFilter(yearFilter === summary.year ? 'All' : summary.year)}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition ${yearFilter === summary.year ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{summary.year}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{summary.count} students</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="Search student name or ID" />
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="All">All departments</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="All">All years</option>
                  {years.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="All">All risk</option><option value="Low Risk">Low Risk</option><option value="Medium Risk">Medium Risk</option><option value="High Risk">High Risk</option>
                </select>
              </div>
              <button onClick={() => setActiveTab('Data Upload')} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><Download className="h-4 w-4" /> Upload CSV</button>
            </div>
            <p className="mb-3 text-sm text-slate-500">Showing {filteredStudents.length} of {students.length} students</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Year</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">CGPA</th><th className="px-4 py-3">Academic risk</th><th className="px-4 py-3">Placement risk</th><th className="px-4 py-3">Overall</th></tr></thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const profile = riskProfiles.get(student.id)
                    return (
                    <tr key={student.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3"><div className="font-medium text-slate-800">{student.name}</div><div className="text-xs text-slate-500">{student.id}</div></td>
                      <td className="px-4 py-3 text-slate-700">{student.department}</td><td className="px-4 py-3 text-slate-700">{student.year}</td><td className="px-4 py-3 text-slate-700">{student.attendance}%</td><td className="px-4 py-3 text-slate-700">{student.cgpa}</td>
                      <td className="min-w-52 px-4 py-3"><RiskBadge level={profile.academicRisk} /><p className="mt-1 text-xs text-slate-500">{profile.academicReasons[0]}</p></td>
                      <td className="min-w-52 px-4 py-3"><RiskBadge level={profile.placementRisk} /><p className="mt-1 text-xs text-slate-500">{profile.placementReasons[0]}</p></td>
                      <td className="px-4 py-3"><RiskBadge level={profile.overallRisk} /></td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>}

          {activeTab === 'Risk Review' && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Risk review</h2>
                <p className="mt-1 text-sm text-slate-500">Review students with academic, placement, or overall risk signals and see the leading reason.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: 'High overall risk', count: students.filter((student) => riskProfiles.get(student.id).overallRisk === 'High Risk').length },
                  { label: 'Medium overall risk', count: students.filter((student) => riskProfiles.get(student.id).overallRisk === 'Medium Risk').length },
                  { label: 'Academic risks', count: countAtRisk('academicRisk') },
                  { label: 'Placement risks', count: countAtRisk('placementRisk') },
                  { label: 'Attendance below 75%', count: students.filter((student) => student.attendance < 75).length },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{item.count}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label htmlFor="risk-filter" className="text-sm font-medium text-slate-700">Overall risk level</label>
                <select id="risk-filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="All">All levels</option><option value="High Risk">High Risk</option><option value="Medium Risk">Medium Risk</option><option value="Low Risk">Low Risk</option>
                </select>
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400">
                  <option value="All">All departments</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <span className="text-sm text-slate-500">{filteredStudents.length} students match the selected filters</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredStudents.filter((student) => riskProfiles.get(student.id).overallRisk !== 'Low Risk').slice(0, 100).map((student) => {
                  const profile = riskProfiles.get(student.id)
                  return (
                    <article key={student.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><h3 className="font-semibold text-slate-900">{student.name}</h3><p className="mt-1 text-sm text-slate-500">{student.id} · {student.department} · {student.year}</p></div>
                        <RiskBadge level={profile.overallRisk} />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-700">Academic</span><RiskBadge level={profile.academicRisk} /></div><p className="mt-2 text-xs leading-5 text-slate-600">{profile.academicReasons.join(' ')}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-700">Placement</span><RiskBadge level={profile.placementRisk} /></div><p className="mt-2 text-xs leading-5 text-slate-600">{profile.placementReasons.join(' ')}</p></div>
                      </div>
                    </article>
                  )
                })}
              </div>
              {filteredStudents.filter((student) => riskProfiles.get(student.id).overallRisk !== 'Low Risk').length > 100 && <p className="text-center text-sm text-slate-500">Showing the first 100 students. Narrow the filters to review more.</p>}
              {filteredStudents.every((student) => riskProfiles.get(student.id).overallRisk === 'Low Risk') && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">No students with medium or high overall risk match the current filters.</div>}
            </section>
          )}

          {activeTab === 'Data Upload' && (
            <section className="mx-auto max-w-3xl space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Upload student data</h2>
                <p className="mt-1 text-sm text-slate-500">Import a CSV file for processing and review the upload result.</p>
              </div>
              <form onSubmit={handleCsvUpload} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-8 text-center">
                  <Download className="mx-auto h-8 w-8 text-indigo-600" />
                  <label htmlFor="student-csv" className="mt-3 block cursor-pointer font-medium text-indigo-700">Choose a CSV file</label>
                  <p className="mt-1 text-sm text-slate-500">CSV format only</p>
                  <input id="student-csv" type="file" accept=".csv,text/csv" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setUploadState({ loading: false, error: '', result: null }) }} className="mx-auto mt-4 block max-w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-medium file:text-white" />
                  {selectedFile && <p className="mt-3 text-sm font-medium text-slate-700">Selected: {selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)} KB</p>}
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Expected columns</p>
                  <p className="mt-1 break-words">student_id, name, email, department, year, academic_score, attendance, lms, placement, skills, success_score, risk_level, risk_score, cgpa, semester</p>
                </div>
                {uploadState.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadState.error}</p>}
                {uploadState.result && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><p className="font-semibold">{uploadState.result.message || 'CSV processed successfully.'}</p><p className="mt-1">Rows processed: {uploadState.result.rows_processed ?? 0} · Duplicates skipped: {uploadState.result.duplicates_skipped ?? 0}</p><p className="mt-2 text-xs">This demo endpoint reports the parsed upload; uploaded rows are not added to the live dashboard dataset.</p></div>}
                <button type="submit" disabled={uploadState.loading || !selectedFile} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 font-medium text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">{uploadState.loading ? 'Uploading…' : 'Upload and process CSV'}</button>
              </form>
            </section>
          )}
        </div>
      )}
    />
  )
}

function AdminDashboard() {
  const user = getSessionUser()
  const [activeTab, setActiveTab] = useState('Overview')
  const [userQuery, setUserQuery] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('All')
  const overview = getAdminOverview()
  const pieData = [
    { name: 'Low Risk', value: overview.lowRiskStudents },
    { name: 'Medium Risk', value: overview.mediumRiskStudents },
    { name: 'High Risk', value: overview.highRiskStudents },
  ]
  const COLORS = ['#34d399', '#fbbf24', '#f87171']
  const departmentData = departmentChart.map((entry) => ({ ...entry, count: entry.students }))
  const demoUsers = [
    ...demoStudents.map((student) => ({ ...student, accountRole: 'Student', demoPassword: student.password })),
    ...demoFaculty.map((faculty) => ({ ...faculty, id: faculty.email, department: faculty.department || 'Faculty', year: '—', accountRole: 'Faculty', demoPassword: faculty.password })),
  ]
  const filteredUsers = demoUsers.filter((account) => {
    const matchesQuery = `${account.name} ${account.email} ${account.id}`.toLowerCase().includes(userQuery.toLowerCase())
    const matchesRole = userRoleFilter === 'All' || account.accountRole === userRoleFilter
    return matchesQuery && matchesRole
  })

  const adminContent = (
    <div className="space-y-6">
      {activeTab === 'Overview' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total students', value: overview.totalStudents },
            { label: 'Departments', value: overview.departments },
            { label: 'Average CGPA', value: overview.averageCgpa.toFixed(1) },
            { label: 'Average attendance', value: `${Math.round(overview.averageAttendance)}%` },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Department comparison</h3>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentData}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="department" tick={{ fontSize: 12 }} /><YAxis /><Tooltip /><Bar dataKey="score" fill="#7c3aed" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Risk distribution</h3>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4}>{pieData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          </div>
        </div>
      </>}

      {activeTab === 'Departments' && <section className="space-y-5">
        <div><h2 className="text-xl font-semibold text-slate-900">Department analytics</h2><p className="mt-1 text-sm text-slate-500">Student count and average success score by department.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {departmentData.map((department) => (
            <article key={department.department} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-slate-900">{department.department}</p>
              <p className="mt-3 text-3xl font-bold text-indigo-700">{department.count}</p>
              <p className="text-sm text-slate-500">students</p>
              <div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Average success</span><span className="font-semibold text-slate-800">{department.score}/100</span></div>
            </article>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-semibold text-slate-900">Success score by department</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentData}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="department" /><YAxis domain={[0, 100]} /><Tooltip /><Bar dataKey="score" name="Average success score" fill="#7c3aed" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      </section>}

      {activeTab === 'Risk Trends' && <section className="space-y-5">
        <div><h2 className="text-xl font-semibold text-slate-900">Risk trends</h2><p className="mt-1 text-sm text-slate-500">Monthly movement in low, medium, and high risk groups.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Low risk students', value: overview.lowRiskStudents, tone: 'text-emerald-700 bg-emerald-50' },
            { label: 'Medium risk students', value: overview.mediumRiskStudents, tone: 'text-amber-700 bg-amber-50' },
            { label: 'High risk students', value: overview.highRiskStudents, tone: 'text-red-700 bg-red-50' },
          ].map((card) => <div key={card.label} className={`rounded-2xl border border-slate-200 p-5 ${card.tone}`}><p className="text-sm">{card.label}</p><p className="mt-2 text-3xl font-bold">{card.value}</p></div>)}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 text-lg font-semibold text-slate-900">Monthly risk trend</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskTrendData}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="low" name="Low risk" fill="#34d399" radius={[6, 6, 0, 0]} /><Bar dataKey="medium" name="Medium risk" fill="#fbbf24" radius={[6, 6, 0, 0]} /><Bar dataKey="high" name="High risk" fill="#f87171" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      </section>}

      {activeTab === 'Users' && <section className="space-y-5">
        <div><h2 className="text-xl font-semibold text-slate-900">Student and faculty accounts</h2><p className="mt-1 text-sm text-slate-500">Browse demo account emails and demo passwords for testing.</p></div>
        <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Demo credentials only.</strong> Each demo account has a distinct password listed below. Passwords for real or registered accounts are not retrievable; reset them through your identity system. Do not expose this page in production.</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input aria-label="Search accounts" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search name, email, or student ID" className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <select aria-label="Filter account role" value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400"><option>All</option><option>Student</option><option>Faculty</option></select>
          </div>
          <p className="mb-3 text-sm text-slate-500">Showing {filteredUsers.length} of {demoUsers.length} demo accounts</p>
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Demo password</th></tr></thead>
              <tbody>{filteredUsers.map((account) => <tr key={`${account.accountRole}-${account.email}`} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{account.name}{account.accountRole === 'Student' && <span className="block text-xs font-normal text-slate-500">{account.id}</span>}</td><td className="px-4 py-3">{account.accountRole}</td><td className="px-4 py-3">{account.department}</td><td className="px-4 py-3">{account.email}</td><td className="px-4 py-3 font-mono">{account.demoPassword}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>}
    </div>
  )

  return <DashboardShell title="Admin Dashboard" user={user} navItems={['Overview', 'Departments', 'Risk Trends', 'Users']} activeTab={activeTab} setActiveTab={setActiveTab} content={adminContent} />
}

function DashboardShell({ title, user, navItems, activeTab, setActiveTab, content }) {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const isStudentDashboard = user?.role === 'student'

  const handleLogout = async () => {
    if (auth?.signOut) await auth.signOut()
    else logout()
    navigate('/signin')
  }

  return (
    <div className="dashboard-shell min-h-screen bg-slate-100 text-slate-800">
      <header className="dashboard-topbar border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="dashboard-topbar__inner mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">StudentPulse AI</p>
              <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-sm font-medium text-slate-900">{user?.name || 'Student'}</p>
              <p className="text-xs text-slate-500">{user?.role ? `${user.role}` : 'User'}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              {user?.photoURL ? <img src={user.photoURL} alt={`${user.name || 'Student'} profile`} referrerPolicy="no-referrer" className="h-full w-full rounded-xl object-cover" /> : <CircleUserRound className="h-5 w-5" />}
            </div>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className={`dashboard-layout mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 ${isStudentDashboard ? 'dashboard-layout--student' : 'lg:flex-row'}`}>
        <aside className={`dashboard-sidebar w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ${isStudentDashboard ? 'dashboard-sidebar--student' : 'lg:max-w-[260px]'}`}>
          {isStudentDashboard && <div className="student-menu-heading"><div><p>Student workspace</p><span>Learning and progress</span></div><span className="student-menu-count">{navItems.length} sections</span></div>}
          <nav className={`dashboard-nav ${isStudentDashboard ? 'dashboard-nav--student' : 'space-y-2'}`} aria-label={isStudentDashboard ? 'Student dashboard categories' : `${user?.role || 'Dashboard'} navigation`}>
            {navItems.map((item) => (
              <button key={item} type="button" onClick={() => setActiveTab(item)} aria-current={activeTab === item ? 'page' : undefined} className={`dashboard-nav-link flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition ${activeTab === item || (location.pathname === `/${user?.role}` && item === 'Overview') ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'} ${isStudentDashboard ? 'student-category-link' : ''}`}>
                {isStudentDashboard ? <><span className="student-category-icon">{(() => { const Icon = studentNavIcons[item] || LayoutGrid; return <Icon className="h-[18px] w-[18px]" /> })()}</span><span className="student-category-label">{item}</span></> : <><span>{item}</span><ChevronRight className="h-4 w-4" /></>}
              </button>
            ))}
          </nav>
        </aside>

        <main className="dashboard-content flex-1 space-y-6">{content}</main>
      </div>
    </div>
  )
}

export default App
