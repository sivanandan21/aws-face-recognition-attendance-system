import React, { useEffect, useRef, useState } from 'react'
import { enrollStudent } from '../services/api'

const POSE_LABELS = [
  '1. Frontal Pose',
  '2. Slight Left',
  '3. Slight Right',
  '4. Neutral',
  '5. Extra Angle'
]

export default function Enrollment({ onComplete }) {
  const [userId, setUserId] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('Computer Science & Engineering')
  const [email, setEmail] = useState('')
  const [photos, setPhotos] = useState([]) // Array of base64 strings (up to 5)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  // Camera State
  const [cameraActive, setCameraActive] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')
  const [selectedCameraName, setSelectedCameraName] = useState(localStorage.getItem('kiosk_selected_camera_name') || 'Logi C270 HD Webcam')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    async function getDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(videoInputs)
        if (videoInputs.length > 0) {
          const externalCam = videoInputs.find(c =>
            c.label.toLowerCase().includes('logitech') ||
            c.label.toLowerCase().includes('c270') ||
            c.label.toLowerCase().includes('c920') ||
            c.label.toLowerCase().includes('usb')
          )
          const chosen = externalCam || videoInputs[0]
          setSelectedCameraId(chosen.deviceId)
          setSelectedCameraName(chosen.label || 'Logi C270 HD Webcam')
        }
      } catch (err) {
        console.warn('Devices enum error:', err)
      }
    }
    getDevices()
  }, [])

  async function startWebcam(deviceId) {
    stopWebcam()
    const targetId = deviceId || selectedCameraId
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: targetId ? { deviceId: { exact: targetId } } : true,
        audio: false
      })
      streamRef.current = stream
      setCameraActive(true)
    } catch (err) {
      alert('Cannot start camera: ' + err.message)
      setCameraActive(false)
    }
  }

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(e => console.warn(e))
    }
  }, [cameraActive, selectedCameraId])

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    return () => stopWebcam()
  }, [])

  function snapCurrentAngle() {
    const video = videoRef.current
    if (!video || photos.length >= 5) return

    const canvas = document.createElement('canvas')
    canvas.width = Math.min(video.videoWidth || 640, 640)
    canvas.height = Math.round((canvas.width / (video.videoWidth || 640)) * (video.videoHeight || 480))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]

    setPhotos(prev => [...prev, b64].slice(0, 5))
  }

  function handleFileUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return

    files.forEach(file => {
      if (photos.length >= 5) return
      const reader = new FileReader()
      reader.onload = ev => {
        const b64 = ev.target.result.split(',')[1]
        setPhotos(prev => {
          if (prev.length >= 5) return prev
          return [...prev, b64]
        })
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  function handleClear() {
    setUserId('')
    setFullName('')
    setEmail('')
    setPhotos([])
    setStatusMsg(null)
    stopWebcam()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!userId.trim() || !fullName.trim()) {
      setStatusMsg({ type: 'error', text: 'Please fill in Student ID and Full Name.' })
      return
    }
    if (photos.length < 3) {
      setStatusMsg({ type: 'error', text: 'At least 3 face angles are required for accurate biometric matching.' })
      return
    }

    setLoading(true)
    setStatusMsg(null)

    try {
      await enrollStudent({
        user_id: userId.trim(),
        full_name: fullName.trim(),
        department,
        email: email.trim(),
        images: photos
      })

      setStatusMsg({ type: 'success', text: `Successfully enrolled ${fullName} with ${photos.length} biometric vectors!` })
      setTimeout(() => {
        if (onComplete) onComplete()
      }, 1500)
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Enrollment failed.' })
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = userId.trim() && fullName.trim() && photos.length >= 3

  return (
    <div className="flex flex-col">
      {/* Header Row */}
      <div className="flex justify-between items-start pb-6 border-b border-[#E6E4DD]">
        <div>
          <h1 className="font-serif font-bold text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            Student Enrollment
          </h1>
          <p className="text-sm text-[#5C5A55] mt-1">
            Register identity details and capture 3 to 5 multi-angle face vectors
          </p>
        </div>

        <div className="text-sm font-medium text-[#5C5A55] pt-2">
          Step 1 of 2 &bull; Profile &amp; Angles
        </div>
      </div>

      {statusMsg && (
        <div
          className={`mt-4 p-3.5 rounded-xl text-sm font-medium flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-[#E8F0EA] text-[#166534] border border-[#7B9478]/40'
              : 'bg-[#F9EBEB] text-[#864446] border border-[#864446]/40'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-xs font-bold ml-3">&times;</button>
        </div>
      )}

      {/* 2-Column Open Split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.38fr] gap-9 mt-6">
        {/* Left Column: Student Identity */}
        <div className="border-r border-[#E6E4DD] pr-9 flex flex-col justify-between">
          <div>
            <h2 className="font-semibold text-lg text-[#141413] mb-4">
              Student Identity
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* User ID */}
              <div>
                <label className="block text-xs font-medium text-[#141413] mb-1.5">
                  Student / User ID <span className="text-[#9F1239]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  placeholder="e.g. 21BCE1042"
                  className="w-full h-11 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3.5 text-sm text-[#141413] placeholder-[#8A867E] focus:outline-none focus:border-[#166534]"
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-[#141413] mb-1.5">
                  Full Name <span className="text-[#9F1239]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Rohit Kumar"
                  className="w-full h-11 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3.5 text-sm text-[#141413] placeholder-[#8A867E] focus:outline-none focus:border-[#166534]"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-medium text-[#141413] mb-1.5">
                  Department
                </label>
                <div className="relative">
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full h-11 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3.5 text-sm text-[#141413] appearance-none focus:outline-none focus:border-[#166534] cursor-pointer"
                  >
                    <option value="Computer Science & Engineering">Computer Science &amp; Engineering</option>
                    <option value="Electronics & Communication">Electronics &amp; Communication</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Civil Engineering">Civil Engineering</option>
                    <option value="Biotechnology">Biotechnology</option>
                  </select>
                  <svg
                    className="w-4 h-4 text-[#5C5A55] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
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

              {/* Email Address */}
              <div>
                <label className="block text-xs font-medium text-[#141413] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. rohit.kumar@vitstudent.ac.in"
                  className="w-full h-11 bg-[#F4F3EE] border border-[#DCD9D0] rounded-lg px-3.5 text-sm text-[#141413] placeholder-[#8A867E] focus:outline-none focus:border-[#166534]"
                />
              </div>
            </form>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-3 mt-6 pt-4">
            <button
              type="button"
              onClick={handleClear}
              className="px-6 py-2.5 rounded-full border border-[#8A8275] text-sm font-medium text-[#141413] hover:bg-[#FAF9F6] transition-colors"
            >
              Clear
            </button>

            <button
              type="button"
              disabled={!isFormValid || loading}
              onClick={handleSubmit}
              className={`flex-1 py-2.5 rounded-full text-sm font-medium text-white transition-colors ${
                isFormValid && !loading
                  ? 'bg-[#141413] hover:bg-black cursor-pointer shadow-sm'
                  : 'bg-[#BCB8AE] cursor-not-allowed'
              }`}
            >
              {loading ? 'Saving...' : 'Save & Index Profile'}
            </button>
          </div>
        </div>

        {/* Right Column: Biometric Angles */}
        <div className="flex flex-col">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="font-semibold text-lg text-[#141413]">
              Biometric Angles
            </h2>
            <span className="text-xs text-[#5C5A55] font-medium">
              {photos.length} of 5 captured &bull; Minimum 3 required
            </span>
          </div>

          {/* Progress Bar (8px rounded track) */}
          <div className="w-full h-2 rounded-full border border-[#166534] bg-white p-0.5 overflow-hidden">
            <div
              className="h-full bg-[#166534] rounded-full transition-all duration-300"
              style={{ width: `${(photos.length / 5) * 100}%` }}
            />
          </div>

          {/* Single Toolbar Row */}
          <div className="flex items-center gap-2.5 my-4">
            {/* Camera Selector Dropdown */}
            <div className="relative">
              <select
                value={selectedCameraId}
                onChange={e => {
                  const id = e.target.value
                  setSelectedCameraId(id)
                  const found = availableCameras.find(c => c.deviceId === id)
                  if (found) setSelectedCameraName(found.label)
                  if (cameraActive) startWebcam(id)
                }}
                className="appearance-none bg-[#F4F3EE] hover:bg-[#E7E4DC] border border-[#DCD9D0] text-[#141413] text-xs font-medium pl-3 pr-7 py-2 rounded-lg focus:outline-none cursor-pointer"
              >
                {availableCameras.length > 0 ? (
                  availableCameras.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">{selectedCameraName}</option>
                )}
              </select>
              <svg
                className="w-3.5 h-3.5 text-[#5C5A55] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
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

            {/* Start Live Webcam */}
            {cameraActive ? (
              <button
                type="button"
                onClick={stopWebcam}
                className="bg-[#864446] hover:bg-[#72383a] text-white text-xs font-medium px-4 py-2 rounded-full transition-colors"
              >
                Stop Webcam
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startWebcam()}
                className="bg-[#141413] hover:bg-black text-white text-xs font-medium px-4 py-2 rounded-full transition-colors shadow-sm"
              >
                Start Live Webcam
              </button>
            )}

            {/* Upload Files */}
            <button
              type="button"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="border border-[#8A8275] text-[#141413] hover:bg-[#FAF9F6] text-xs font-medium px-4 py-2 rounded-full transition-colors"
            >
              Upload Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Active Live Webcam Preview & Snap Trigger */}
          {cameraActive && (
            <div className="relative rounded-xl overflow-hidden bg-[#161614] mb-4 border border-[#DCD9D0] max-h-48 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-44 object-cover"
              />
              <button
                type="button"
                onClick={snapCurrentAngle}
                disabled={photos.length >= 5}
                className="absolute bottom-3 bg-[#141413]/90 hover:bg-black text-white text-xs font-semibold px-4 py-1.5 rounded-full border border-white/20 shadow-md backdrop-blur-sm"
              >
                📸 Snap Pose ({photos.length + 1}/5)
              </button>
            </div>
          )}

          {/* 5-Slot Pose Grid (3 on top row, 2 on bottom row) */}
          <div className="grid grid-cols-3 gap-3.5">
            {POSE_LABELS.slice(0, 3).map((label, idx) => {
              const photo = photos[idx]
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (cameraActive) snapCurrentAngle()
                    else if (!photo) fileInputRef.current && fileInputRef.current.click()
                  }}
                  className="relative bg-[#F6F5F0] border-[1.5px] border-dashed border-[#CFCBC0] rounded-xl h-[120px] flex flex-col items-center justify-center p-2 text-center cursor-pointer hover:bg-[#ECEAE3] transition-colors overflow-hidden group"
                >
                  {photo ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${photo}`}
                        alt={label}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removePhoto(idx)
                        }}
                        className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 hover:bg-black text-white rounded-full flex items-center justify-center text-xs leading-none"
                        title="Remove angle"
                      >
                        &times;
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-[#141413] mb-1.5">
                        {label}
                      </div>
                      <svg
                        className="w-5 h-5 text-[#8A867E] group-hover:text-[#141413] transition-colors"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3.5 mt-3.5">
            {POSE_LABELS.slice(3, 5).map((label, i) => {
              const idx = i + 3
              const photo = photos[idx]
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (cameraActive) snapCurrentAngle()
                    else if (!photo) fileInputRef.current && fileInputRef.current.click()
                  }}
                  className="relative bg-[#F6F5F0] border-[1.5px] border-dashed border-[#CFCBC0] rounded-xl h-[120px] flex flex-col items-center justify-center p-2 text-center cursor-pointer hover:bg-[#ECEAE3] transition-colors overflow-hidden group"
                >
                  {photo ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${photo}`}
                        alt={label}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removePhoto(idx)
                        }}
                        className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 hover:bg-black text-white rounded-full flex items-center justify-center text-xs leading-none"
                        title="Remove angle"
                      >
                        &times;
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-[#141413] mb-1.5">
                        {label}
                      </div>
                      <svg
                        className="w-5 h-5 text-[#8A867E] group-hover:text-[#141413] transition-colors"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
