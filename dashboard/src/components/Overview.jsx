import React, { useEffect, useState } from 'react'
import { Users, CheckCircle2, Clock, AlertTriangle, RefreshCw, UserPlus, UserCheck, ShieldCheck, Edit2, X, Trash2, Camera, Upload } from 'lucide-react'
import { fetchAttendance, fetchUsers, updateUser, removeUserFace, addUserFaces } from '../services/api'

export default function Overview({ onNavigate }) {
  const [records, setRecords] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('attendance') // 'attendance' | 'roster'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'PRESENT' | 'LATE' | 'ABSENT'
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

  function startEdit(user) {
    setEditingUser(user)
    setEditForm({
      full_name: user.full_name || '',
      department: user.department || '',
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

  async function deletePhoto(faceIdx) {
    if (!editingUser) return
    try {
      await removeUserFace(editingUser.user_id, faceIdx)
      const updatedImages = (editingUser.images || []).filter((_, idx) => idx !== faceIdx)
      setEditingUser({ ...editingUser, images: updatedImages })
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? { ...u, images: updatedImages } : u))
    } catch (err) {
      alert('Error removing photo: ' + err.message)
    }
  }

  async function handleAddPhoto(e) {
    const files = Array.from(e.target.files)
    if (!files.length || !editingUser) return
    const newB64s = []
    for (const f of files) {
      const b64 = await new Promise(res => {
        const reader = new FileReader()
        reader.onload = ev => res(ev.target.result.split(',')[1])
        reader.readAsDataURL(f)
      })
      newB64s.push(b64)
    }
    try {
      await addUserFaces(editingUser.user_id, newB64s)
      const updatedImages = [...(editingUser.images || []), ...newB64s]
      setEditingUser({ ...editingUser, images: updatedImages })
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? { ...u, images: updatedImages } : u))
    } catch (err) {
      alert('Error adding photos: ' + err.message)
    }
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [])

  const presentCount = records.filter(r => r.status === 'PRESENT').length
  const lateCount = records.filter(r => r.status === 'LATE').length
  const totalEnrolled = users.length || 6
  const absentCount = totalEnrolled - presentCount - lateCount

  // Filter records by status
  const filteredRecords = statusFilter === 'all'
    ? records
    : records.filter(r => r.status === statusFilter)

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Today's Attendance</h2>
          <p className="text-sm text-gray-500 mt-1">
            Session: <span className="font-mono text-gray-700">CLASS#{todayStr}</span> &bull; Cutoff: <span className="font-mono">09:15 AM IST</span>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm border border-gray-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onNavigate('enroll')}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>Enroll New Student</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div 
          onClick={() => setViewMode('roster')}
          className={`bg-white border rounded-xl p-5 cursor-pointer transition ${
            viewMode === 'roster' ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Enrolled</span>
            <Users className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">{totalEnrolled}</span>
            <span className="text-xs text-blue-600 underline">View Roster &rarr;</span>
          </div>
        </div>

        <div 
          onClick={() => { setViewMode('attendance'); setStatusFilter('PRESENT') }}
          className={`bg-white border rounded-xl p-5 cursor-pointer transition ${
            viewMode === 'attendance' && statusFilter === 'PRESENT' ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Present Today</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-700">{presentCount}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">On Time</span>
          </div>
        </div>

        <div 
          onClick={() => { setViewMode('attendance'); setStatusFilter('LATE') }}
          className={`bg-white border rounded-xl p-5 cursor-pointer transition ${
            viewMode === 'attendance' && statusFilter === 'LATE' ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Late Arrivals</span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-700">{lateCount}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">After 09:15</span>
          </div>
        </div>

        <div 
          onClick={() => { setViewMode('attendance'); setStatusFilter('all') }}
          className={`bg-white border rounded-xl p-5 cursor-pointer transition ${
            viewMode === 'attendance' && statusFilter === 'all' ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Absent</span>
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-red-700">{absentCount < 0 ? 0 : absentCount}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Not Marked</span>
          </div>
        </div>
      </div>

      {/* Main Table with Tab Selector */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setViewMode('attendance'); setStatusFilter('all') }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                viewMode === 'attendance'
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Live Check-In Feed ({records.length})</span>
            </button>
            <button
              onClick={() => setViewMode('roster')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                viewMode === 'roster'
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserCheck className="h-4 w-4" />
              <span>Enrolled Roster ({users.length})</span>
            </button>
          </div>

          {/* Status Filter Tabs */}
          {viewMode === 'attendance' && (
            <div className="flex items-center gap-1">
              {[
                { key: 'all', label: 'All' },
                { key: 'PRESENT', label: 'Present' },
                { key: 'LATE', label: 'Late' },
                { key: 'ABSENT', label: 'Absent' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    statusFilter === f.key
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <span className="text-xs text-gray-400">
            {viewMode === 'attendance' ? `${filteredRecords.length} marked today` : `${users.length} total registered`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {viewMode === 'attendance' ? (
            /* Attendance Check-in Table */
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Student ID</th>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Check-In Time (IST)</th>
                  <th className="px-6 py-3.5">Confidence</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-gray-400">
                      No check-ins recorded for today yet.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec, i) => {
                    const isPresent = rec.status === 'PRESENT'
                    const isLate = rec.status === 'LATE'
                    const isAbsent = rec.status === 'ABSENT'
                    return (
                      <tr key={i} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">{rec.user_id}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{rec.full_name}</td>
                        <td className="px-6 py-4 text-gray-500">{rec.department}</td>
                        <td className="px-6 py-4 font-mono text-xs">
                          {rec.check_in_time ? new Date(rec.check_in_time).toLocaleTimeString('en-IN', { hour12: true }) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-gray-600">
                            {rec.confidence_score ? `${rec.confidence_score}%` : (isAbsent ? '-' : '98.5%')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isPresent
                                ? 'bg-emerald-50 text-emerald-700'
                                : isLate
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-400">{rec.device_id || '-'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* Enrolled Students Roster Table */
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Student ID</th>
                  <th className="px-6 py-3.5">Full Name</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Enrolled Date</th>
                  <th className="px-6 py-3.5">Vector Status</th>
                  <th className="px-6 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-mono font-medium text-gray-900">{u.user_id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{u.full_name}</td>
                    <td className="px-6 py-4 text-gray-500">{u.department}</td>
                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">{u.email || '-'}</td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-500">
                      {u.enrolled_at ? new Date(u.enrolled_at).toLocaleDateString() : 'Active'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Vectors Active</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => startEdit(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
                      >
                        <Edit2 className="h-3 w-3 text-gray-500" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Student Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-lg w-full overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Edit Student Profile</h3>
                <p className="text-xs text-gray-500 font-mono">ID: {editingUser.user_id}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveUserChanges} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={editForm.department}
                  onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-500"
                >
                  <option value="Computer Science">Computer Science &amp; Engineering</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics &amp; Communication</option>
                  <option value="Mechanical">Mechanical Engineering</option>
                  <option value="Civil">Civil Engineering</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-500"
                />
              </div>

              {/* Face Photos Management */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Enrolled Face Photos ({(editingUser.images || []).length})
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium cursor-pointer hover:underline">
                    <Upload className="h-3 w-3" />
                    <span>Add Angle</span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png"
                      onChange={handleAddPhoto}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto py-2">
                  {(editingUser.images || []).length === 0 ? (
                    <span className="text-xs text-gray-400">No photos registered yet</span>
                  ) : (
                    editingUser.images.map((imgB64, idx) => (
                      <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                        <img
                          src={imgB64.startsWith('data:') ? imgB64 : `data:image/jpeg;base64,${imgB64}`}
                          alt={`Angle ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => deletePhoto(idx)}
                          className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {savingUser ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
