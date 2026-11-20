import React, { useEffect, useState } from 'react'
import { fetchAttendance, fetchUsers, updateUser } from '../services/api'

export default function Overview({ onNavigate }) {
  const [records, setRecords] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'PRESENT' | 'LATE' | 'ABSENT'
  const [searchQuery, setSearchQuery] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', department: '', email: '' })
  const [savingUser, setSavingUser] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  async function loadData() {
    setLoading(true)
    try {
      const [attData, usersData] = await Promise.all([
        fetchAttendance(todayStr),
        fetchUsers()
      ])
      setRecords(attData.records || [])
      setUsers(usersData || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date())

  const cutoff = localStorage.getItem('kiosk_cutoff_time') || '09:15 AM'

  const totalEnrolled = users.length > 0 ? users.length : records.length
  const presentCount = records.filter(r => (r.status || '').toUpperCase() === 'PRESENT').length
  const lateCount = records.filter(r => (r.status || '').toUpperCase() === 'LATE').length
  const absentCount = records.filter(r => (r.status || '').toUpperCase() === 'ABSENT').length
  const onTimeCount = presentCount
  const onTimePct = totalEnrolled > 0 ? Math.round((onTimeCount / totalEnrolled) * 100) : 0

  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (onTimePct / 100) * circumference

  const filteredRecords = records.filter(r => {
    if (statusFilter !== 'all' && (r.status || '').toUpperCase() !== statusFilter) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = (r.user_id || '').toLowerCase().includes(q)
      const matchName = (r.full_name || '').toLowerCase().includes(q)
      const matchDept = (r.department || '').toLowerCase().includes(q)
      if (!matchId && !matchName && !matchDept) return false
    }
    return true
  })

  function formatTime(isoStr) {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return isoStr
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    } catch {
      return isoStr
    }
  }

  function getInitials(name, id) {
    if (name) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
      return name.slice(0, 2).toUpperCase()
    }
    return (id || 'ST').slice(0, 2).toUpperCase()
  }

  function startEdit(record) {
    const user = users.find(u => u.user_id === record.user_id) || record
    setEditingUser(user)
    setEditForm({
      full_name: user.full_name || record.full_name || '',
      department: user.department || record.department || '',
      email: user.email || ''
    })
  }

  async function saveUserChanges(e) {
    e.preventDefault()
    if (!editingUser) return
    setSavingUser(true)
    try {
      const updated = await updateUser(editingUser.user_id, editForm)
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? { ...u, ...updated } : u))
      setRecords(prev => prev.map(r => r.user_id === editingUser.user_id ? { ...r, full_name: editForm.full_name, department: editForm.department } : r))
      setEditingUser(null)
    } catch (err) {
      alert('Error saving user: ' + err.message)
    } finally {
      setSavingUser(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 sm:pb-6 border-b border-[#E6E4DD] gap-4">
        <div>
          <h1 className="font-serif font-bold text-2xl sm:text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            Today's Attendance
          </h1>
          <p className="text-xs sm:text-sm text-[#5C5A55] mt-1">
            {formattedDate} &bull; Cutoff {cutoff}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
          <div className="bg-[#F4F3EE] border border-[#E6E4DD] rounded-xl px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#7B9478]" />
            <div className="text-xs leading-none">
              <span className="font-medium text-[#141413]">Kiosk-01</span>
              <span className="text-[#5C5A55] ml-1">Online</span>
            </div>
          </div>

          <button
            onClick={() => onNavigate && onNavigate('enroll')}
            className="bg-[#141413] hover:bg-black text-white text-xs sm:text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <span>+ Enroll Student</span>
          </button>
        </div>
      </div>

      {/* Hairline Metrics Band (Responsive: stack/grid on mobile) */}
      <div className="flex flex-col sm:grid sm:grid-cols-5 py-5 sm:py-7 border-b border-[#E6E4DD] items-center gap-4 sm:gap-0">
        {/* Col 1: Donut Progress Ring */}
        <div className="flex items-center justify-center">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <svg className="w-20 h-20 sm:w-24 sm:h-24 transform -rotate-90" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r={radius} stroke="#E6E4DD" strokeWidth="7" fill="none" />
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="#166534"
                strokeWidth="7"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-serif font-bold text-lg sm:text-[22px] leading-tight text-[#141413] tabular-nums">
                {onTimePct}%
              </span>
              <span className="text-[10px] sm:text-[11px] text-[#5C5A55] font-medium leading-none mt-0.5">
                On-Time
              </span>
            </div>
          </div>
        </div>

        {/* Cols 2-5: Responsive 4-Column Grid on Mobile */}
        <div className="grid grid-cols-4 w-full divide-x divide-[#E6E4DD] sm:contents">
          {/* Enrolled */}
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {totalEnrolled}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">
              Enrolled
            </span>
          </div>

          {/* Present */}
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {presentCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">
              Present
            </span>
          </div>

          {/* Late */}
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {lateCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">
              Late
            </span>
          </div>

          {/* Absent */}
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {absentCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">
              Absent
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Row (Responsive flex-col on mobile) */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 my-4 sm:my-6">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'all'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            All {records.length}
          </button>
          <button
            onClick={() => setStatusFilter('PRESENT')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'PRESENT'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Present
          </button>
          <button
            onClick={() => setStatusFilter('LATE')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'LATE'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Late
          </button>
          <button
            onClick={() => setStatusFilter('ABSENT')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'ABSENT'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Absent
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="w-full h-[38px] bg-white border border-[#DCD9D0] rounded-lg pl-3.5 pr-9 text-xs sm:text-sm text-[#141413] placeholder-[#8A867E] focus:outline-none focus:border-[#166534]"
          />
          <svg
            className="w-4 h-4 text-[#8A867E] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Responsive Hairline Roster Table Container */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full text-left border-collapse min-w-[540px]">
          <thead>
            <tr className="border-b border-[#E6E4DD] text-xs font-semibold text-[#8A867E] uppercase tracking-wider">
              <th className="py-2.5 font-medium">Student</th>
              <th className="py-2.5 font-medium">Department</th>
              <th className="py-2.5 font-medium">Check-In Time</th>
              <th className="py-2.5 font-medium">Confidence</th>
              <th className="py-2.5 font-medium text-right pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="h-[58px] border-b border-[#E6E4DD] animate-pulse">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-[34px] h-[34px] rounded-full bg-[#E7E4DC]" />
                      <div className="h-4 bg-[#E7E4DC] rounded w-32" />
                    </div>
                  </td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-20" /></td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-16" /></td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-12" /></td>
                  <td className="py-3 text-right"><div className="h-7 bg-[#E7E4DC] rounded-full w-18 ml-auto" /></td>
                </tr>
              ))
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-sm text-[#8A867E]">
                  No student attendance recorded yet. Enroll a student to get started.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const status = (r.status || 'PRESENT').toUpperCase()
                const isAbsent = status === 'ABSENT'
                const initials = getInitials(r.full_name, r.user_id)

                let statusBadgeColor = 'bg-[#7B9478]'
                let statusLabel = 'Present'
                if (status === 'LATE') {
                  statusBadgeColor = 'bg-[#B58E43]'
                  statusLabel = 'Late'
                } else if (status === 'ABSENT') {
                  statusBadgeColor = 'bg-[#864446]'
                  statusLabel = 'Absent'
                }

                return (
                  <tr
                    key={r.user_id}
                    onClick={() => startEdit(r)}
                    className="h-[58px] border-b border-[#E6E4DD] hover:bg-[#FAF9F6] transition-colors cursor-pointer group"
                    title="Click to view/edit student details"
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className="w-[34px] h-[34px] rounded-full bg-[#D9D4C9] text-[#141413] flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                          <span className="text-xs sm:text-sm font-medium text-[#141413] tabular-nums">
                            {r.user_id}
                          </span>
                          <span className="text-xs sm:text-sm text-[#5C5A55]">
                            {r.full_name || 'Unnamed'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 text-xs sm:text-sm text-[#5C5A55]">
                      {r.department || 'General'}
                    </td>

                    <td className="py-2.5 text-xs sm:text-sm text-[#141413] tabular-nums">
                      {isAbsent ? '—' : formatTime(r.check_in_time)}
                    </td>

                    <td className="py-2.5 text-xs sm:text-sm text-[#141413] tabular-nums">
                      {isAbsent || !r.confidence_score ? '—' : `${Number(r.confidence_score).toFixed(1)}%`}
                    </td>

                    <td className="py-2.5 text-right pr-2">
                      <span
                        className={`inline-flex items-center justify-center min-w-[70px] sm:min-w-[78px] h-6 sm:h-7 px-2.5 rounded-full text-white text-xs sm:text-[13px] font-medium leading-none ${statusBadgeColor}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 border border-[#E6E4DD] shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-bold text-lg text-[#141413]">
                Edit Student Details
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-[#8A867E] hover:text-[#141413] text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={saveUserChanges} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#5C5A55] mb-1">Student ID</label>
                <input
                  type="text"
                  disabled
                  value={editingUser.user_id}
                  className="w-full h-10 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#5C5A55] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C5A55] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C5A55] mb-1">Department</label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5C5A55] mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E6E4DD]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-[#8A8275] rounded-full text-xs font-medium text-[#5C5A55] hover:text-[#141413]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-5 py-2 bg-[#141413] hover:bg-black text-white rounded-full text-xs font-medium"
                >
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
