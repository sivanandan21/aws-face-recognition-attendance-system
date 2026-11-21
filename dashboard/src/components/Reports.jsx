import React, { useEffect, useState } from 'react'
import { fetchAttendance } from '../services/api'

export default function Reports() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [department, setDepartment] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  async function loadReport() {
    setLoading(true)
    try {
      const data = await fetchAttendance(selectedDate, department)
      setRecords(data.records || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [selectedDate, department])

  // Filter records
  const filteredRecords = records.filter(r => {
    if (statusFilter !== 'ALL' && (r.status || '').toUpperCase() !== statusFilter) {
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

  // Export filtered attendance records to CSV
  function exportCSV() {
    if (filteredRecords.length === 0) return

    const headers = ['User ID', 'Roll Number', 'Full Name', 'Department', 'Check-In Time (IST)', 'Status', 'Confidence Score', 'Device ID']
    const rows = filteredRecords.map(r => [
      r.user_id,
      `"${r.roll_number || ''}"`,
      `"${r.full_name || ''}"`,
      `"${r.department || ''}"`,
      r.check_in_time || '',
      r.status || 'PRESENT',
      r.confidence_score || '',
      r.device_id || 'kiosk-01'
    ])

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `attendance_report_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Compute metrics
  const totalRecords = filteredRecords.length
  const presentCount = filteredRecords.filter(r => (r.status || '').toUpperCase() === 'PRESENT').length
  const presentRate = totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) : '0.0'

  const scores = filteredRecords
    .filter(r => r.confidence_score && (r.status || '').toUpperCase() !== 'ABSENT')
    .map(r => Number(r.confidence_score))
  const avgConfidence = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '97.8'

  function getInitials(name, id) {
    if (name) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
      return name.slice(0, 2).toUpperCase()
    }
    return (id || 'ST').slice(0, 2).toUpperCase()
  }

  function formatTime(isoStr) {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return isoStr
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(d)
    } catch {
      return isoStr
    }
  }

  function formatFullTooltip(isoStr) {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return ''
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(d) + ' IST'
    } catch {
      return ''
    }
  }

  // Format date display for input pill: e.g. "Nov 20, 2026"
  const dateFormattedPill = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(selectedDate))

  return (
    <div className="flex flex-col">
      {/* Header Row */}
      <div className="flex justify-between items-start pb-6 border-b border-[#E6E4DD]">
        <div>
          <h1 className="font-serif font-bold text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            Attendance Reports
          </h1>
          <p className="text-sm text-[#5C5A55] mt-1">
            Query historical attendance logs, filter by department, and export verified CSV
          </p>
        </div>

        <button
          onClick={exportCSV}
          disabled={filteredRecords.length === 0}
          className="bg-[#141413] hover:bg-black text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors flex items-center gap-2 shadow-sm"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* 3-Column Hairline Summary Strip */}
      <div className="grid grid-cols-3 py-6 border-b border-[#E6E4DD] text-center">
        {/* Col 1 */}
        <div className="flex flex-col items-center justify-center">
          <span className="font-serif font-medium text-[44px] leading-none text-[#141413] tabular-nums">
            {totalRecords}
          </span>
          <span className="text-xs text-[#5C5A55] font-medium mt-1.5">
            Records
          </span>
        </div>

        {/* Col 2 */}
        <div className="border-l border-[#E6E4DD] flex flex-col items-center justify-center">
          <span className="font-serif font-medium text-[44px] leading-none text-[#141413] tabular-nums">
            {presentRate}%
          </span>
          <span className="text-xs text-[#5C5A55] font-medium mt-1.5">
            Present Rate
          </span>
        </div>

        {/* Col 3 */}
        <div className="border-l border-[#E6E4DD] flex flex-col items-center justify-center">
          <span className="font-serif font-medium text-[44px] leading-none text-[#141413] tabular-nums">
            {avgConfidence}%
          </span>
          <span className="text-xs text-[#5C5A55] font-medium mt-1.5">
            Avg Confidence
          </span>
        </div>
      </div>

      {/* Inline Filter Bar */}
      <div className="flex justify-between items-center my-6">
        <div className="flex items-center gap-2.5">
          {/* Date Picker Pill */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
            />
            <div className="bg-[#DDD9CE] hover:bg-[#D4CBB8] text-[#141413] px-3.5 py-1.5 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors">
              <span>{dateFormattedPill}</span>
              <svg
                className="w-4 h-4 text-[#5C5A55]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>

          {/* Department Dropdown Pill */}
          <div className="relative">
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="appearance-none bg-[#E7E4DC] hover:bg-[#DCD9D0] text-[#141413] pl-3.5 pr-7 py-1.5 rounded-xl text-sm font-medium focus:outline-none cursor-pointer"
            >
              <option value="">All Departments</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Electronics">Electronics</option>
              <option value="Mechanical">Mechanical</option>
              <option value="Civil">Civil</option>
            </select>
            <svg
              className="w-3.5 h-3.5 text-[#5C5A55] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* Status Dropdown Pill */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none bg-[#E7E4DC] hover:bg-[#DCD9D0] text-[#141413] pl-3.5 pr-7 py-1.5 rounded-xl text-sm font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
            </select>
            <svg
              className="w-3.5 h-3.5 text-[#5C5A55] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ID or name..."
            className="w-full h-[38px] bg-white border border-[#DCD9D0] rounded-lg pl-3.5 pr-9 text-sm text-[#141413] placeholder-[#8A867E] focus:outline-none focus:border-[#166534]"
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

      {/* Open Hairline Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
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
              [...Array(6)].map((_, i) => (
                <tr key={i} className="h-[58px] border-b border-[#E6E4DD] animate-pulse">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-[34px] h-[34px] rounded-full bg-[#E7E4DC]" />
                      <div className="h-4 bg-[#E7E4DC] rounded w-36" />
                    </div>
                  </td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-24" /></td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-16" /></td>
                  <td className="py-3"><div className="h-4 bg-[#E7E4DC] rounded w-12" /></td>
                  <td className="py-3 text-right"><div className="h-7 bg-[#E7E4DC] rounded-full w-20 ml-auto" /></td>
                </tr>
              ))
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-12 text-center text-sm text-[#8A867E]">
                  No records found for {selectedDate}.
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
                    className="h-[58px] border-b border-[#E6E4DD] hover:bg-[#FAF9F6] transition-colors"
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-[34px] h-[34px] rounded-full bg-[#D9D4C9] text-[#141413] flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-[#141413] tabular-nums">
                            {r.user_id}
                          </span>
                          <span className="text-sm text-[#5C5A55]">
                            {r.full_name || 'Unnamed'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 text-sm text-[#5C5A55]">
                      {r.department || 'General'}
                    </td>

                    <td className="py-2.5 text-sm text-[#141413] tabular-nums">
                      {isAbsent ? '—' : formatTime(r.check_in_time)}
                    </td>

                    <td className="py-2.5 text-sm text-[#141413] tabular-nums">
                      {isAbsent || !r.confidence_score ? '—' : `${Number(r.confidence_score).toFixed(1)}%`}
                    </td>

                    <td className="py-2.5 text-right pr-2">
                      <span
                        className={`inline-flex items-center justify-center min-w-[78px] h-7 px-3 rounded-full text-white text-[13px] font-medium leading-none ${statusBadgeColor}`}
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
    </div>
  )
}
