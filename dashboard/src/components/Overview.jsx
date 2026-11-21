import React, { useEffect, useRef, useState } from 'react'
import { fetchAttendance, fetchUsers, updateUser, addUserFaces, removeUserFace } from '../services/api'

export default function Overview({ onNavigate }) {
  const [records, setRecords] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'PRESENT' | 'LATE' | 'ABSENT' | 'DIRECTORY'
  const [searchQuery, setSearchQuery] = useState('')

  // Edit Student Modal / Drawer State
  const [editingUser, setEditingUser] = useState(null)
  const [editTab, setEditTab] = useState('details') // 'details' | 'photos'
  const [editForm, setEditForm] = useState({
    full_name: '',
    roll_number: '',
    department: '',
    class_id: '',
    email: '',
    phone: '',
    active: true
  })
  const [savingUser, setSavingUser] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  // Edit Modal Webcam State
  const [editCameraActive, setEditCameraActive] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')
  const [snappedPhoto, setSnappedPhoto] = useState(null)
  const editVideoRef = useRef(null)
  const editStreamRef = useRef(null)
  const editFileInputRef = useRef(null)

  // Compute IST Date String (YYYY-MM-DD)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true)
    try {
      const [attData, usersData] = await Promise.all([
        fetchAttendance(todayStr),
        fetchUsers()
      ])
      setRecords(attData.records || [])
      setUsers(usersData || [])
    } catch (err) {
      console.warn('Error fetching live attendance:', err)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    loadData(true)
    // Silent background auto-poll every 2.5s for real-time live clock & state synchronization
    const pollTimer = setInterval(() => {
      loadData(false)
    }, 2500)
    return () => clearInterval(pollTimer)
  }, [])

  // Detect video devices for Edit modal webcam capture
  useEffect(() => {
    async function getDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(videoInputs)
        if (videoInputs.length > 0 && !selectedCameraId) {
          const externalCam = videoInputs.find(c =>
            c.label.toLowerCase().includes('logitech') ||
            c.label.toLowerCase().includes('c270') ||
            c.label.toLowerCase().includes('c920') ||
            c.label.toLowerCase().includes('usb')
          )
          const chosen = externalCam || videoInputs[0]
          setSelectedCameraId(chosen.deviceId)
        }
      } catch (err) {
        console.warn('Device enum error:', err)
      }
    }
    getDevices()
  }, [])

  function showToast(text, type = 'success') {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
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

  // Filter records or users
  const filteredRecords = records.filter(r => {
    if (statusFilter === 'DIRECTORY') return false
    if (statusFilter !== 'all' && (r.status || '').toUpperCase() !== statusFilter) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = (r.user_id || '').toLowerCase().includes(q)
      const matchName = (r.full_name || '').toLowerCase().includes(q)
      const matchDept = (r.department || '').toLowerCase().includes(q)
      const matchRoll = (r.roll_number || '').toLowerCase().includes(q)
      if (!matchId && !matchName && !matchDept && !matchRoll) return false
    }
    return true
  })

  const filteredUsers = users.filter(u => {
    if (statusFilter !== 'DIRECTORY') return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchId = (u.user_id || '').toLowerCase().includes(q)
      const matchName = (u.full_name || '').toLowerCase().includes(q)
      const matchDept = (u.department || '').toLowerCase().includes(q)
      const matchRoll = (u.roll_number || '').toLowerCase().includes(q)
      if (!matchId && !matchName && !matchDept && !matchRoll) return false
    }
    return true
  })

  // Exact real-time IST time formatting
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

  function getInitials(name, id) {
    if (name) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
      return name.slice(0, 2).toUpperCase()
    }
    return (id || 'ST').slice(0, 2).toUpperCase()
  }

  // Open Edit Drawer
  function openEditDrawer(student) {
    const fullUser = users.find(u => u.user_id === student.user_id) || student
    setEditingUser(fullUser)
    setEditTab('details')
    setEditForm({
      full_name: fullUser.full_name || student.full_name || '',
      roll_number: fullUser.roll_number || student.roll_number || '',
      department: fullUser.department || student.department || '',
      class_id: fullUser.class_id || student.class_id || '',
      email: fullUser.email || '',
      phone: fullUser.phone || '',
      active: fullUser.active !== false
    })
    setSnappedPhoto(null)
    stopEditWebcam()
  }

  function closeEditDrawer() {
    setEditingUser(null)
    stopEditWebcam()
    setSnappedPhoto(null)
  }

  async function handleSaveDetails(e) {
    e.preventDefault()
    if (!editingUser) return
    setSavingUser(true)
    try {
      const updated = await updateUser(editingUser.user_id, editForm)
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? { ...u, ...updated } : u))
      setRecords(prev => prev.map(r => r.user_id === editingUser.user_id ? {
        ...r,
        full_name: editForm.full_name,
        department: editForm.department,
        roll_number: editForm.roll_number
      } : r))
      setEditingUser(prev => ({ ...prev, ...updated }))
      showToast('Student details updated successfully!')
    } catch (err) {
      showToast('Error updating student: ' + err.message, 'error')
    } finally {
      setSavingUser(false)
    }
  }

  // Photo Management in Edit Drawer
  async function handleDeletePhoto(index) {
    if (!editingUser) return
    const photos = editingUser.images || []
    if (photos.length <= 1) {
      alert("Cannot delete the student's only remaining face photo. Add a replacement angle first.")
      return
    }
    if (!window.confirm(`Delete photo angle #${index + 1}?`)) return

    try {
      await removeUserFace(editingUser.user_id, index)
      const newImages = photos.filter((_, i) => i !== index)
      const updatedUser = { ...editingUser, images: newImages }
      setEditingUser(updatedUser)
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? updatedUser : u))
      showToast(`Removed photo #${index + 1}`)
    } catch (err) {
      showToast('Error deleting photo: ' + err.message, 'error')
    }
  }

  async function handleUploadNewPhoto(e) {
    const file = e.target.files && e.target.files[0]
    if (!file || !editingUser) return

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const b64 = ev.target.result.split(',')[1]
      try {
        await addUserFaces(editingUser.user_id, [b64])
        const updatedImages = [...(editingUser.images || []), b64]
        const updatedUser = { ...editingUser, images: updatedImages }
        setEditingUser(updatedUser)
        setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? updatedUser : u))
        showToast('New face photo added successfully!')
      } catch (err) {
        showToast('Error adding photo: ' + err.message, 'error')
      }
    }
    reader.readAsDataURL(file)
  }

  // Webcam capture in Edit Drawer
  async function startEditWebcam(deviceId) {
    stopEditWebcam()
    const targetId = deviceId || selectedCameraId
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: targetId ? { deviceId: { exact: targetId }, width: { ideal: 640 }, height: { ideal: 480 } } : true,
        audio: false
      })
      editStreamRef.current = stream
      setEditCameraActive(true)
    } catch (err) {
      alert('Cannot start webcam: ' + err.message)
      setEditCameraActive(false)
    }
  }

  useEffect(() => {
    if (editCameraActive && editStreamRef.current && editVideoRef.current) {
      editVideoRef.current.srcObject = editStreamRef.current
      editVideoRef.current.play().catch(e => console.warn(e))
    }
  }, [editCameraActive, selectedCameraId])

  function stopEditWebcam() {
    if (editStreamRef.current) {
      editStreamRef.current.getTracks().forEach(t => t.stop())
      editStreamRef.current = null
    }
    if (editVideoRef.current) {
      editVideoRef.current.srcObject = null
    }
    setEditCameraActive(false)
  }

  function snapPhotoFromWebcam() {
    const video = editVideoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = Math.min(video.videoWidth || 640, 640)
    canvas.height = Math.round((canvas.width / (video.videoWidth || 640)) * (video.videoHeight || 480))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const b64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1]
    setSnappedPhoto(b64)
  }

  async function saveSnappedPhoto() {
    if (!snappedPhoto || !editingUser) return
    try {
      await addUserFaces(editingUser.user_id, [snappedPhoto])
      const updatedImages = [...(editingUser.images || []), snappedPhoto]
      const updatedUser = { ...editingUser, images: updatedImages }
      setEditingUser(updatedUser)
      setUsers(prev => prev.map(u => u.user_id === editingUser.user_id ? updatedUser : u))
      setSnappedPhoto(null)
      stopEditWebcam()
      showToast('Captured photo angle saved & indexed!')
    } catch (err) {
      showToast('Error saving captured photo: ' + err.message, 'error')
    }
  }

  return (
    <div className="flex flex-col relative">
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className={`fixed top-5 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 transition-all ${
          toastMsg.type === 'error'
            ? 'bg-[#864446] text-white border-red-700'
            : 'bg-[#166534] text-white border-green-800'
        }`}>
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 sm:pb-6 border-b border-[#E6E4DD] gap-4">
        <div>
          <h1 className="font-serif font-bold text-2xl sm:text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            {statusFilter === 'DIRECTORY' ? 'Enrolled Students' : "Today's Attendance"}
          </h1>
          <p className="text-xs sm:text-sm text-[#5C5A55] mt-1">
            {formattedDate} &bull; Cutoff {cutoff} &bull; Real-time IST Sync
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
          <div className="bg-[#F4F3EE] border border-[#E6E4DD] rounded-xl px-3 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#7B9478]" />
            <div className="text-xs leading-none">
              <span className="font-medium text-[#141413]">Kiosk-01</span>
              <span className="text-[#5C5A55] ml-1">Live</span>
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

      {/* Hairline Metrics Band */}
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

        {/* Cols 2-5: Responsive 4-Column Grid */}
        <div className="grid grid-cols-4 w-full divide-x divide-[#E6E4DD] sm:contents">
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {totalEnrolled}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">Enrolled</span>
          </div>
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {presentCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">Present</span>
          </div>
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {lateCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">Late</span>
          </div>
          <div className="sm:border-l sm:border-[#E6E4DD] flex flex-col items-center justify-center py-1">
            <span className="font-serif font-medium text-2xl sm:text-[44px] leading-none text-[#141413] tabular-nums">
              {absentCount}
            </span>
            <span className="text-[11px] sm:text-xs text-[#5C5A55] font-medium mt-1">Absent</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Row */}
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
            Present ({presentCount})
          </button>
          <button
            onClick={() => setStatusFilter('LATE')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'LATE'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Late ({lateCount})
          </button>
          <button
            onClick={() => setStatusFilter('ABSENT')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'ABSENT'
                ? 'bg-[#C9C4B8] text-[#141413]'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Absent ({absentCount})
          </button>
          <button
            onClick={() => setStatusFilter('DIRECTORY')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              statusFilter === 'DIRECTORY'
                ? 'bg-[#141413] text-white shadow-sm'
                : 'bg-[#E7E4DC] text-[#5C5A55] hover:text-[#141413]'
            }`}
          >
            Students Directory ({users.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or roll no..."
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

      {/* Responsive Table: Today's Attendance Mode OR Student Directory Mode */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {statusFilter === 'DIRECTORY' ? (
          /* Enrolled Students Directory Table */
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-[#E6E4DD] text-xs font-semibold text-[#8A867E] uppercase tracking-wider">
                <th className="py-2.5 font-medium">Student</th>
                <th className="py-2.5 font-medium">Roll Number</th>
                <th className="py-2.5 font-medium">Department</th>
                <th className="py-2.5 font-medium">Photos</th>
                <th className="py-2.5 font-medium">Status</th>
                <th className="py-2.5 font-medium text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-sm text-[#8A867E]">
                    No enrolled students match your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const initials = getInitials(u.full_name, u.user_id)
                  const nPhotos = (u.images || []).length || (u.face_ids || []).length || 1

                  return (
                    <tr
                      key={u.user_id}
                      className="h-[58px] border-b border-[#E6E4DD] hover:bg-[#FAF9F6] transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <div className="w-[34px] h-[34px] rounded-full bg-[#D9D4C9] text-[#141413] flex items-center justify-center text-xs font-semibold shrink-0">
                            {initials}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs sm:text-sm font-medium text-[#141413]">
                              {u.full_name || 'Unnamed'}
                            </span>
                            <span className="text-[11px] text-[#5C5A55] tabular-nums">
                              {u.user_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 text-xs sm:text-sm text-[#5C5A55] tabular-nums">
                        {u.roll_number || '—'}
                      </td>

                      <td className="py-2.5 text-xs sm:text-sm text-[#5C5A55]">
                        {u.department || 'General'}
                      </td>

                      <td className="py-2.5 text-xs sm:text-sm text-[#141413] tabular-nums">
                        <span className="bg-[#F4F3EE] border border-[#E6E4DD] px-2 py-0.5 rounded-md text-xs font-medium">
                          {nPhotos} {nPhotos === 1 ? 'photo' : 'photos'}
                        </span>
                      </td>

                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.active !== false ? 'text-[#166534]' : 'text-[#8A867E]'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.active !== false ? 'bg-[#166534]' : 'bg-[#8A867E]'}`} />
                          {u.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-2.5 text-right pr-2">
                        <button
                          onClick={() => openEditDrawer(u)}
                          className="px-3 py-1 bg-white hover:bg-[#FAF9F6] border border-[#DCD9D0] text-[#141413] rounded-lg text-xs font-medium transition-colors shadow-2xs"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        ) : (
          /* Today's Attendance Table */
          <table className="w-full text-left border-collapse min-w-[580px]">
            <thead>
              <tr className="border-b border-[#E6E4DD] text-xs font-semibold text-[#8A867E] uppercase tracking-wider">
                <th className="py-2.5 font-medium">Student</th>
                <th className="py-2.5 font-medium">Department</th>
                <th className="py-2.5 font-medium">Check-In Time</th>
                <th className="py-2.5 font-medium">Confidence</th>
                <th className="py-2.5 font-medium">Status</th>
                <th className="py-2.5 font-medium text-right pr-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
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
                    <td className="py-3"><div className="h-7 bg-[#E7E4DC] rounded-full w-18" /></td>
                    <td className="py-3 text-right"><div className="h-6 bg-[#E7E4DC] rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-sm text-[#8A867E]">
                    No student attendance recorded for today.
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
                      className="h-[58px] border-b border-[#E6E4DD] hover:bg-[#FAF9F6] transition-colors group"
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
                            {r.roll_number && (
                              <span className="text-[11px] text-[#8A867E] tabular-nums hidden md:inline">
                                ({r.roll_number})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 text-xs sm:text-sm text-[#5C5A55]">
                        {r.department || 'General'}
                      </td>

                      <td
                        className="py-2.5 text-xs sm:text-sm text-[#141413] tabular-nums"
                        title={formatFullTooltip(r.check_in_time)}
                      >
                        {isAbsent ? '—' : formatTime(r.check_in_time)}
                      </td>

                      <td className="py-2.5 text-xs sm:text-sm text-[#141413] tabular-nums">
                        {isAbsent || !r.confidence_score ? '—' : `${Number(r.confidence_score).toFixed(1)}%`}
                      </td>

                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center justify-center min-w-[70px] sm:min-w-[78px] h-6 sm:h-7 px-2.5 rounded-full text-white text-xs sm:text-[13px] font-medium leading-none ${statusBadgeColor}`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td className="py-2.5 text-right pr-2">
                        <button
                          onClick={() => openEditDrawer(r)}
                          className="px-2.5 py-1 bg-white hover:bg-[#FAF9F6] border border-[#DCD9D0] text-[#141413] rounded-lg text-xs font-medium transition-colors shadow-2xs opacity-85 group-hover:opacity-100"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Student Slide-Over Drawer / Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-7 border border-[#E6E4DD] shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-[#E6E4DD]">
              <div>
                <h3 className="font-serif font-bold text-xl text-[#141413]">
                  Edit Student: {editingUser.full_name || editingUser.user_id}
                </h3>
                <p className="text-xs text-[#5C5A55] mt-0.5">
                  ID: <span className="tabular-nums font-medium text-[#141413]">{editingUser.user_id}</span>
                </p>
              </div>
              <button
                onClick={closeEditDrawer}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A867E] hover:text-[#141413] hover:bg-[#F4F3EE] text-2xl leading-none transition-colors"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs: Details vs Face Photos */}
            <div className="flex border-b border-[#E6E4DD] my-4 gap-2">
              <button
                type="button"
                onClick={() => setEditTab('details')}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  editTab === 'details'
                    ? 'border-[#166534] text-[#141413]'
                    : 'border-transparent text-[#5C5A55] hover:text-[#141413]'
                }`}
              >
                1. Student Details
              </button>
              <button
                type="button"
                onClick={() => setEditTab('photos')}
                className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-[1px] flex items-center gap-1.5 ${
                  editTab === 'photos'
                    ? 'border-[#166534] text-[#141413]'
                    : 'border-transparent text-[#5C5A55] hover:text-[#141413]'
                }`}
              >
                <span>2. Enrolled Face Photos</span>
                <span className="text-[11px] bg-[#E7E4DC] text-[#141413] px-2 py-0.2 rounded-full tabular-nums">
                  {(editingUser.images || []).length || 1}
                </span>
              </button>
            </div>

            {/* TAB 1: Student Details Form */}
            {editTab === 'details' && (
              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#5C5A55] mb-1">Student ID (Immutable)</label>
                    <input
                      type="text"
                      disabled
                      value={editingUser.user_id}
                      className="w-full h-10 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#5C5A55] cursor-not-allowed tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5C5A55] mb-1">Roll Number</label>
                    <input
                      type="text"
                      value={editForm.roll_number}
                      onChange={e => setEditForm({ ...editForm, roll_number: e.target.value })}
                      placeholder="e.g. 21BCE1042"
                      className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534] tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5C5A55] mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.full_name}
                    onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    <label className="block text-xs font-medium text-[#5C5A55] mb-1">Class / Section</label>
                    <input
                      type="text"
                      value={editForm.class_id}
                      onChange={e => setEditForm({ ...editForm, class_id: e.target.value })}
                      placeholder="e.g. CSE-A"
                      className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#5C5A55] mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5C5A55] mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full h-10 bg-white border border-[#DCD9D0] rounded-lg px-3 text-sm text-[#141413] focus:outline-none focus:border-[#166534] tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#F4F3EE] rounded-xl border border-[#E6E4DD]">
                  <div>
                    <span className="text-xs font-medium text-[#141413] block">Active Status</span>
                    <span className="text-[11px] text-[#5C5A55]">Inactive students are excluded from automatic attendance marking</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                    className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                      editForm.active ? 'bg-[#166534]' : 'bg-[#C9C4B8]'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      editForm.active ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E6E4DD]">
                  <button
                    type="button"
                    onClick={closeEditDrawer}
                    className="px-4 py-2 border border-[#DCD9D0] rounded-full text-xs font-medium text-[#5C5A55] hover:text-[#141413]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="px-5 py-2 bg-[#141413] hover:bg-black text-white rounded-full text-xs font-medium shadow-sm transition-colors"
                  >
                    {savingUser ? 'Saving Changes...' : 'Save Student Details'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: Enrolled Face Photos Management */}
            {editTab === 'photos' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-xs font-semibold text-[#5C5A55] uppercase tracking-wider mb-2">
                    Current Registered Face Vectors ({(editingUser.images || []).length})
                  </h4>
                  {(editingUser.images || []).length === 0 ? (
                    <p className="text-xs text-[#8A867E] py-4 text-center bg-[#FAF9F6] rounded-xl border border-[#E6E4DD]">
                      No photos stored locally for this student. Add new angles below.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {(editingUser.images || []).map((b64, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-[#E6E4DD] bg-[#FAF9F6] aspect-square flex items-center justify-center">
                          <img
                            src={b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`}
                            alt={`Angle ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(idx)}
                            title="Delete this face angle"
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#864446] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add New Angle Section */}
                <div className="border-t border-[#E6E4DD] pt-4">
                  <h4 className="text-xs font-semibold text-[#141413] mb-2 flex items-center justify-between">
                    <span>Add New Face Angle</span>
                    <span className="text-[11px] font-normal text-[#5C5A55]">Upload file or capture via live camera</span>
                  </h4>

                  {/* Camera / Upload Controls */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                      type="file"
                      ref={editFileInputRef}
                      accept="image/*"
                      onChange={handleUploadNewPhoto}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current && editFileInputRef.current.click()}
                      className="px-3.5 py-1.5 bg-[#FAF9F6] hover:bg-[#F4F3EE] border border-[#DCD9D0] text-[#141413] rounded-lg text-xs font-medium transition-colors"
                    >
                      Upload Image File
                    </button>

                    {!editCameraActive ? (
                      <button
                        type="button"
                        onClick={() => startEditWebcam()}
                        className="px-3.5 py-1.5 bg-[#141413] hover:bg-black text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Start Live Camera
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopEditWebcam}
                        className="px-3.5 py-1.5 bg-[#864446] hover:bg-red-800 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Stop Camera
                      </button>
                    )}

                    {/* Camera Selector Dropdown */}
                    {availableCameras.length > 0 && (
                      <select
                        value={selectedCameraId}
                        onChange={e => {
                          setSelectedCameraId(e.target.value)
                          if (editCameraActive) startEditWebcam(e.target.value)
                        }}
                        className="text-xs bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-2.5 py-1.5 text-[#141413] focus:outline-none"
                      >
                        {availableCameras.map((c, i) => (
                          <option key={c.deviceId || i} value={c.deviceId}>
                            {c.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Live Video Viewfinder when Active */}
                  {editCameraActive && (
                    <div className="bg-[#161614] rounded-xl overflow-hidden p-2 flex flex-col items-center">
                      <video
                        ref={editVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-w-[340px] rounded-lg aspect-4/3 object-cover"
                      />
                      <button
                        type="button"
                        onClick={snapPhotoFromWebcam}
                        className="mt-2.5 px-5 py-1.5 bg-white hover:bg-[#FAF9F6] text-[#141413] rounded-full text-xs font-semibold shadow transition-colors"
                      >
                        Capture Snapshot
                      </button>
                    </div>
                  )}

                  {/* Preview Snapped Photo */}
                  {snappedPhoto && (
                    <div className="mt-3 p-3 bg-[#FAF9F6] rounded-xl border border-[#E6E4DD] flex items-center gap-3">
                      <img
                        src={`data:image/jpeg;base64,${snappedPhoto}`}
                        alt="Snapped angle"
                        className="w-16 h-16 rounded-lg object-cover border border-[#DCD9D0]"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-[#141413] block">Photo Captured</span>
                        <span className="text-[11px] text-[#5C5A55]">Ready to index into Rekognition User Vector</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSnappedPhoto(null)}
                          className="px-3 py-1.5 border border-[#DCD9D0] text-[#5C5A55] rounded-lg text-xs"
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={saveSnappedPhoto}
                          className="px-4 py-1.5 bg-[#166534] hover:bg-[#125029] text-white rounded-lg text-xs font-medium shadow-xs"
                        >
                          Index &amp; Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-3 border-t border-[#E6E4DD]">
                  <button
                    type="button"
                    onClick={closeEditDrawer}
                    className="px-5 py-2 bg-[#141413] hover:bg-black text-white rounded-full text-xs font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
