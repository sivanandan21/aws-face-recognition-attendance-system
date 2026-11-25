import React, { useEffect, useRef, useState } from 'react'
import { checkInStudent, fetchUsers, fetchAttendance, removeAttendanceRecord } from '../services/api'
import { buildFaceMatcher, detectAndMatchAllFaces, getModelStatus, loadModels, STRICT_DISTANCE_THRESHOLD } from '../services/faceMatcher'

export default function LiveKiosk({ onScanSuccess }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [modelsReady, setModelsReady] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')
  const [selectedCameraName, setSelectedCameraName] = useState(localStorage.getItem('kiosk_selected_camera_name') || 'Logi C270 HD Webcam')
  const [enrolledUsers, setEnrolledUsers] = useState([])
  const [recentVerifications, setRecentVerifications] = useState([])
  const [activeDetections, setActiveDetections] = useState([])
  const [removingId, setRemovingId] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const scanLoopTimer = useRef(null)
  const scanActiveRef = useRef(false)
  const isScanningRef = useRef(false)
  const enrolledUsersRef = useRef([])
  const cooldownMap = useRef(new Map())
  const burstMap = useRef(new Map()) // user_id -> { count: number, firstSeen: number }

  useEffect(() => {
    enrolledUsersRef.current = enrolledUsers
    if (enrolledUsers.length > 0 && modelsReady) {
      buildFaceMatcher(enrolledUsers, STRICT_DISTANCE_THRESHOLD).catch(() => {})
    }
  }, [enrolledUsers, modelsReady])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const modelsPromise = loadModels().then(ok => {
        if (!cancelled) setModelsReady(Boolean(ok))
      })
      try {
        const istToday = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date())

        const [users, att] = await Promise.all([
          fetchUsers(),
          fetchAttendance(istToday),
          modelsPromise
        ])
        if (cancelled) return
        const validUsers = users || []
        setEnrolledUsers(validUsers)
        enrolledUsersRef.current = validUsers
        if (validUsers.length > 0) {
          await buildFaceMatcher(validUsers, STRICT_DISTANCE_THRESHOLD)
        }
        if (att && att.records) {
          setRecentVerifications(att.records.filter(r => r.status === 'PRESENT' || r.status === 'LATE').slice(0, 5))
        }
      } catch (err) {
        console.warn('Init fetch error:', err)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

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
        console.warn('Device enum error:', err)
      }
    }
    getDevices()
  }, [])

  async function startWebcam(deviceId) {
    stopWebcam()
    setVideoReady(false)
    setActiveDetections([])

    // Ensure AI models are loading in parallel while opening camera stream
    loadModels().then(ok => { if (ok) setModelsReady(true) }).catch(() => {})

    const targetId = deviceId || selectedCameraId
    const constraints = {
      video: targetId
        ? {
            deviceId: { exact: targetId },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          }
        : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setCameraActive(true)

      // Update camera labels asynchronously so video stream renders without waiting
      navigator.mediaDevices.enumerateDevices()
        .then(devices => setAvailableCameras(devices.filter(d => d.kind === 'videoinput')))
        .catch(() => {})
    } catch (err) {
      alert(`Cannot open camera: ${err.message}`)
      setCameraActive(false)
    }
  }

  useEffect(() => {
    const videoEl = videoRef.current
    if (!cameraActive || !streamRef.current || !videoEl) return

    let cancelled = false
    let rafId = null
    videoEl.srcObject = streamRef.current

    const checkFrameReady = () => {
      if (cancelled) return
      if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) {
        setVideoReady(true)
        return
      }
      rafId = requestAnimationFrame(checkFrameReady)
    }

    videoEl.play().then(checkFrameReady).catch(e => console.warn(e))
    rafId = requestAnimationFrame(checkFrameReady)

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [cameraActive, selectedCameraId])

  function stopWebcam() {
    scanActiveRef.current = false
    isScanningRef.current = false
    if (scanLoopTimer.current) {
      clearTimeout(scanLoopTimer.current)
      scanLoopTimer.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setVideoReady(false)
    setActiveDetections([])
  }

  useEffect(() => {
    return () => stopWebcam()
  }, [])

  useEffect(() => {
    if (!cameraActive || !videoReady) {
      scanActiveRef.current = false
      if (scanLoopTimer.current) {
        clearTimeout(scanLoopTimer.current)
        scanLoopTimer.current = null
      }
      return
    }

    let effectCancelled = false
    scanActiveRef.current = true

    // Serialized non-overlapping loop runs continuously via requestAnimationFrame cadence with 0ms start delay
    const scheduleNext = async () => {
      if (effectCancelled || !scanActiveRef.current) return
      await runMultiPersonRecognition()
      if (!effectCancelled && scanActiveRef.current) {
        scanLoopTimer.current = setTimeout(scheduleNext, 16)
      }
    }

    scheduleNext()

    return () => {
      effectCancelled = true
      scanActiveRef.current = false
      if (scanLoopTimer.current) {
        clearTimeout(scanLoopTimer.current)
        scanLoopTimer.current = null
      }
    }
  }, [cameraActive, videoReady])

  async function runMultiPersonRecognition() {
    if (isScanningRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || !canvas) return

    isScanningRef.current = true
    try {
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw
        canvas.height = vh
      }
      const ctx = canvas.getContext('2d')

      const currentUsers = enrolledUsersRef.current
      const detectedFaces = await detectAndMatchAllFaces(video, currentUsers, STRICT_DISTANCE_THRESHOLD)
      if (!scanActiveRef.current) return

      if (!modelsReady && getModelStatus().modelsLoaded) {
        setModelsReady(true)
      }

      ctx.clearRect(0, 0, vw, vh)
      setActiveDetections(detectedFaces)

      const now = Date.now()

      for (const face of detectedFaces) {
        const { x, y, width, height } = face.box
        const isMatched = face.matched && face.user

        ctx.lineWidth = 3
        ctx.strokeStyle = isMatched ? '#166534' : (face.ambiguous ? '#B58E43' : '#864446')
        ctx.beginPath()
        const radius = 8
        ctx.moveTo(x + radius, y)
        ctx.lineTo(x + width - radius, y)
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
        ctx.lineTo(x + width, y + height - radius)
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
        ctx.lineTo(x + radius, y + height)
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
        ctx.lineTo(x, y + radius)
        ctx.quadraticCurveTo(x, y, x + radius, y)
        ctx.stroke()

        const labelText = isMatched
          ? `${face.user.full_name} (${face.confidence}%)`
          : (face.message || 'Unknown Face')
        ctx.font = '600 13px Inter, sans-serif'
        const textWidth = ctx.measureText(labelText).width

        ctx.fillStyle = isMatched ? '#166534' : (face.ambiguous ? '#B58E43' : '#864446')
        ctx.fillRect(x, Math.max(0, y - 24), textWidth + 16, 24)

        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(labelText, x + 8, Math.max(16, y - 7))

        if (isMatched && face.user) {
          const uid = face.user.user_id
          const lastCheck = cooldownMap.current.get(uid) || 0
          const cooldownTime = 10000

          if (now - lastCheck > cooldownTime) {
            const burst = burstMap.current.get(uid) || { count: 0, firstSeen: now }
            if (now - burst.firstSeen > 4000) {
              burst.count = 0
              burst.firstSeen = now
            }
            burst.count += 1
            burstMap.current.set(uid, burst)

            // Instant check-in on frame 1 when distance is strongly inside match threshold (<= 0.48),
            // otherwise require 2 quick confirming frames
            const requiredFrames = face.distance <= 0.48 ? 1 : 2
            if (burst.count >= requiredFrames) {
              burstMap.current.delete(uid)
              cooldownMap.current.set(uid, now)

              const timeNow = new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }).format(new Date())

              checkInStudent({
                user_id: uid,
                name: face.user.full_name,
                department: face.user.department,
                roll_number: face.user.roll_number || '',
                confidence: face.confidence,
                device_id: 'web-kiosk-live',
                timestamp: new Date().toISOString()
              })

              setRecentVerifications(prev => [
                {
                  user_id: uid,
                  full_name: face.user.full_name,
                  check_in_time: timeNow,
                  confidence_score: face.confidence,
                  status: 'PRESENT'
                },
                ...prev.filter(p => p.user_id !== uid)
              ].slice(0, 8))

              setToastMessage(`✓ Verified & Marked Present: ${face.user.full_name}`)
              setTimeout(() => setToastMessage(''), 3500)

              if (onScanSuccess) onScanSuccess()
            }
          }
        }
      }
    } finally {
      isScanningRef.current = false
    }
  }

  async function handleRemoveVerification(userId, userName) {
    if (!window.confirm(`Delete today's check-in for ${userName || userId}? Their status will revert to Absent.`)) {
      return
    }
    setRemovingId(userId)
    try {
      // 1. Remove from local live state
      setRecentVerifications(prev => prev.filter(r => r.user_id !== userId))
      // 2. Clear cooldown & burst so they can be re-scanned if needed
      cooldownMap.current.delete(userId)
      burstMap.current.delete(userId)
      // 3. Call API to remove record from DB / storage
      await removeAttendanceRecord(userId)
      setToastMessage(`✓ Attendance record for ${userName || userId} removed. Status reverted to Absent.`)
      setTimeout(() => setToastMessage(''), 3500)
      if (onScanSuccess) onScanSuccess()
    } catch (err) {
      console.error('Failed to remove verification:', err)
      alert(`Could not remove record: ${err.message}`)
    } finally {
      setRemovingId(null)
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

  function formatTime(t) {
    if (!t) return 'Just now'
    if (t.includes(':') && (t.includes('AM') || t.includes('PM'))) return t
    try {
      const d = new Date(t)
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(d)
    } catch {
      return t
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header Row (Responsive on mobile) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 sm:pb-6 border-b border-[#E6E4DD] gap-3 sm:gap-4">
        <div>
          <h1 className="font-serif font-bold text-2xl sm:text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            Vidya Science and Technology
          </h1>
          <p className="text-xs sm:text-sm text-[#5C5A55] mt-1">
            Simultaneous multi-person recognition &bull; Align within frame for instant verification
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
          {/* Camera Selector Dropdown Pill */}
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={selectedCameraId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedCameraId(id)
                const found = availableCameras.find(c => c.deviceId === id)
                if (found) {
                  setSelectedCameraName(found.label)
                  localStorage.setItem('kiosk_selected_camera_name', found.label)
                }
                localStorage.setItem('kiosk_selected_camera', id)
                if (cameraActive) startWebcam(id)
              }}
              className="w-full sm:w-auto appearance-none bg-[#DDD9CE] hover:bg-[#D4CBB8] text-[#141413] text-xs sm:text-sm font-medium pl-7 sm:pl-8 pr-7 sm:pr-8 py-2 rounded-xl border border-transparent focus:outline-none cursor-pointer truncate max-w-[170px] sm:max-w-xs"
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
              className="w-3.5 h-3.5 text-[#141413] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <svg
              className="w-3 h-3 text-[#141413] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
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

          {/* Toggle Stream Button */}
          {cameraActive ? (
            <button
              onClick={stopWebcam}
              className="bg-[#864446] hover:bg-[#72383a] text-white text-xs sm:text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-colors shadow-sm shrink-0"
            >
              Stop Stream
            </button>
          ) : (
            <button
              onClick={() => startWebcam()}
              className="bg-[#141413] hover:bg-black text-white text-xs sm:text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-colors shadow-sm shrink-0"
            >
              Start Camera Stream
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Toast Banner */}
      {toastMessage && (
        <div className="mt-3 py-2 px-4 bg-[#FAF9F6] border border-[#E6E4DD] rounded-xl text-xs font-medium text-[#141413] flex items-center justify-between transition-all shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#166534]" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage('')}
            className="text-[#8A867E] hover:text-[#141413] ml-3 text-sm leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2-Column Studio Split (Collapses to 1-col on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-6 lg:gap-8 mt-5 sm:mt-6">
        {/* Left Stage Container */}
        <div className="relative rounded-2xl bg-[#161614] overflow-hidden min-h-[320px] sm:min-h-[460px] flex items-center justify-center border border-[#2A2A26] shadow-inner">
          {/* Top-Left Floating Badge */}
          <div className="absolute top-3 sm:top-4 left-3 sm:left-4 z-20 bg-white/10 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full flex items-center gap-1.5 sm:gap-2 border border-white/10">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-[#7B9478] animate-pulse' : 'bg-white/40'}`} />
            <span className="text-[11px] sm:text-xs font-medium text-white/90">
              {cameraActive
                ? (modelsReady ? `Live • ${activeDetections.length} Face(s)` : 'Live • Loading AI...')
                : 'Standby'}
            </span>
          </div>

          {/* 4 Precision Gold/Tan L-Brackets */}
          <div className="absolute top-4 sm:top-6 left-4 sm:left-6 w-6 h-6 sm:w-8 sm:h-8 border-t-2 border-l-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute top-4 sm:top-6 right-4 sm:right-6 w-6 h-6 sm:w-8 sm:h-8 border-t-2 border-r-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 w-6 h-6 sm:w-8 sm:h-8 border-b-2 border-l-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 w-6 h-6 sm:w-8 sm:h-8 border-b-2 border-r-2 border-[#D4CBB8]/80 pointer-events-none z-10" />

          {/* Center Dashed Oval Face Reticle */}
          <div className="absolute w-[200px] sm:w-[240px] h-[260px] sm:h-[300px] rounded-[50%] border-2 border-dashed border-white/15 pointer-events-none z-10" />

          {/* Stage Inactive State */}
          {!cameraActive ? (
            <div className="flex flex-col items-center justify-center text-center p-6 z-10">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3 sm:mb-4 text-white/70">
                <svg
                  className="w-6 h-6 sm:w-7 sm:h-7"
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
              </div>

              <h3 className="text-white font-medium text-sm sm:text-base mb-1">
                Camera Stream Inactive
              </h3>
              <p className="text-xs text-white/50 max-w-xs mb-5 sm:mb-6">
                Supports simultaneous multi-person check-in with deep biometric matching
              </p>

              <button
                onClick={() => startWebcam()}
                className="bg-[#F5F4F0] hover:bg-white text-[#141413] text-xs sm:text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-colors shadow"
              >
                Start Camera Stream
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full min-h-[320px] sm:min-h-[460px] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.readyState >= 2) {
                    setVideoReady(true)
                  }
                }}
                onCanPlay={() => setVideoReady(true)}
                onLoadedData={() => setVideoReady(true)}
                onPlaying={() => setVideoReady(true)}
                className="w-full h-full object-cover min-h-[320px] sm:min-h-[460px]"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none w-full h-full object-cover z-20"
              />
            </div>
          )}
        </div>

        {/* Right Column: Recent Verifications (Responsive on mobile) */}
        <div className="border-t lg:border-t-0 lg:border-l border-[#E6E4DD] pt-5 lg:pt-0 lg:pl-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E4DD]">
              <h3 className="font-semibold text-sm sm:text-base text-[#141413]">
                Recent Verifications
              </h3>
              {recentVerifications.length > 0 && (
                <span className="text-[11px] text-[#5C5A55] tabular-nums font-medium bg-[#F4F3EE] px-2 py-0.5 rounded-full">
                  {recentVerifications.length} Present
                </span>
              )}
            </div>

            <div className="divide-y divide-[#E6E4DD]">
              {recentVerifications.length === 0 ? (
                <div className="py-6 sm:py-8 text-center text-xs text-[#8A867E]">
                  No scans logged yet today. Look into the camera to check in.
                </div>
              ) : (
                recentVerifications.map((item, idx) => {
                  const initials = getInitials(item.full_name, item.user_id)
                  const isLate = item.status === 'LATE'
                  const isRemoving = removingId === item.user_id
                  return (
                    <div key={item.user_id || idx} className="py-2.5 sm:py-3 flex items-center justify-between group gap-2">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-[32px] h-[32px] sm:w-[34px] sm:h-[34px] rounded-full bg-[#D9D4C9] text-[#141413] flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 truncate">
                          <div className="text-xs sm:text-sm font-medium text-[#141413] truncate">
                            {item.full_name || 'Student'}
                          </div>
                          <div className="text-[11px] sm:text-xs text-[#5C5A55] tabular-nums mt-0.5 truncate">
                            {item.user_id} &bull; {formatTime(item.check_in_time)} &bull; {item.confidence_score ? `${Number(item.confidence_score).toFixed(1)}%` : '98.4%'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center justify-center min-w-[56px] sm:min-w-[62px] h-5 sm:h-6 px-2 rounded-full text-white text-[11px] sm:text-xs font-medium ${isLate ? 'bg-[#B58E43]' : 'bg-[#7B9478]'
                            }`}
                        >
                          {isLate ? 'Late' : 'Present'}
                        </span>

                        {/* Prominent Delete Option for Present Students in Live Scan */}
                        <button
                          type="button"
                          onClick={() => handleRemoveVerification(item.user_id, item.full_name)}
                          disabled={isRemoving}
                          title={`Delete ${item.full_name || item.user_id}'s present check-in`}
                          aria-label={`Delete ${item.full_name || item.user_id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-[#864446] hover:text-white bg-[#864446]/10 hover:bg-[#864446] border border-[#864446]/30 active:scale-95 transition-all focus:outline-none"
                        >
                          {isRemoving ? (
                            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E6E4DD] text-xs text-[#8A867E] tabular-nums mt-4 lg:mt-0">
            Multi-Person ResNet Embeddings &bull; Threshold: 0.54
          </div>
        </div>
      </div>
    </div>
  )
}
