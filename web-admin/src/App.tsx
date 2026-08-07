import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import TeachersPage from './pages/teachers/TeachersPage'
import TeacherPrintableSheetPage from './pages/teachers/TeacherPrintableSheetPage'
import TeacherTimetablePage from './pages/teachers/TeacherTimetablePage'
import ClassesPage from './pages/classes/ClassesPage'
import SubjectsPage from './pages/subjects/SubjectsPage'
import TimetablePage from './pages/timetable/TimetablePage'
import WarningsPage from './pages/warnings/WarningsPage'
import CapacityAdvisorPage from './pages/capacityAdvisor/CapacityAdvisorPage'
import GapsAndSuggestionsPage from './pages/gapsAndSuggestions/GapsAndSuggestionsPage'
import GuidelinesPage from './pages/guidelines/GuidelinesPage'
import SettingsPage from './pages/settings/SettingsPage'
import { ToastProvider } from './components/ui/Toast'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/teachers" element={<TeachersPage />} />
              <Route path="/dashboard/teachers/:teacherId/print" element={<TeacherPrintableSheetPage />} />
              <Route path="/dashboard/teachers/timetable" element={<TeacherTimetablePage />} />
              <Route path="/dashboard/teachers/:teacherId/timetable" element={<TeacherTimetablePage />} />
              <Route path="/dashboard/classes" element={<ClassesPage />} />
              <Route path="/dashboard/subjects" element={<SubjectsPage />} />
              <Route path="/dashboard/timetable" element={<TimetablePage />} />
              <Route path="/dashboard/warnings" element={<WarningsPage />} />
              <Route path="/dashboard/capacity-advisor" element={<CapacityAdvisorPage />} />
              <Route path="/dashboard/gaps-and-suggestions" element={<GapsAndSuggestionsPage />} />
              <Route path="/dashboard/guidelines" element={<GuidelinesPage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
