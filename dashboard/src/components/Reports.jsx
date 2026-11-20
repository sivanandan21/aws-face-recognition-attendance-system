import React, { useEffect, useState } from 'react'
import { Download, Filter, Calendar, Search, FileText } from 'lucide-react'
import { fetchAttendance } from '../services/api'

export default function Reports() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [department, setDepartment] = useState('')
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

  // Filter records by search query (name or user_id)
  const filteredRecords = records.filter(r => {
    const q = searchQuery.toLowerCase()
    return (
      (r.user_id && r.user_id.toLowerCase().includes(q)) ||
      (r.full_name && r.full_name.toLowerCase().includes(q))
    )
  })

  // Export filtered attendance records to CSV (preserving original repo action_report functionality)
  function exportCSV() {
    if (filteredRecords.length === 0) return

    const headers = ['User ID', 'Full Name', 'Department', 'Check-In Time', 'Status', 'Confidence Score', 'Device ID']
    const rows = filteredRecords.map(r => [
      r.user_id,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-gray-500" />
            <span>Attendance Reports</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Query attendance logs, filter by department, and export CSV reports.
          </p>
        </div>

        <button
          onClick={exportCSV}
          disabled={filteredRecords.length === 0}
          className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span>Export to CSV</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Date Selector */}
        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2">
          <Calendar className="h-4 w-4 text-gray-400 mr-2" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm text-gray-900 focus:outline-none w-full font-mono"
          />
        </div>

        {/* Department Filter */}
        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2">
          <Filter className="h-4 w-4 text-gray-400 mr-2" />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="bg-transparent text-sm text-gray-900 focus:outline-none w-full"
          >
            <option value="">All Departments</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Electronics">Electronics</option>
            <option value="Mechanical">Mechanical</option>
            <option value="Civil">Civil</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Search by ID or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm text-gray-900 focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Report Records Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between text-xs text-gray-400">
          <span>Displaying {filteredRecords.length} records</span>
          <span className="font-mono">Partition: CLASS#{selectedDate}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3.5">User ID</th>
                <th className="px-6 py-3.5">Full Name</th>
                <th className="px-6 py-3.5">Department</th>
                <th className="px-6 py-3.5">Check-In Time</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                    {loading ? 'Loading records...' : 'No matching attendance records found.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-mono font-medium text-gray-900">{rec.user_id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{rec.full_name}</td>
                    <td className="px-6 py-4 text-gray-500">{rec.department}</td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {rec.check_in_time ? new Date(rec.check_in_time).toLocaleString('en-IN') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          rec.status === 'PRESENT'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">
                      {rec.confidence_score ? `${rec.confidence_score}%` : '98.0%'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
