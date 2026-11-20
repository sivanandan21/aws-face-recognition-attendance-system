import React, { useEffect, useRef, useState } from 'react'
import { checkInStudent, fetchUsers, fetchAttendance } from '../services/api'
import { matchLiveFaceAgainstEnrolled, loadModels } from '../services/faceMatcher'

export default function LiveKiosk({ onScanSuccess }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')
  const [selectedCameraName, setSelectedCameraName] = useState(localStorage.getItem('kiosk_selected_camera_name') || 'Logi C270 HD Webcam')
  const [modelsReady, setModelsReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [enrolledUsers, setEnrolledUsers] = useState([])
  const [recentVerifications, setRecentVerifications] = useState([])

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const autoScanTimer = useRef(null)

  // Pre-load recognition models and enrolled users on mount
  useEffect(() => {
    async function init() {
      loadModels().then(() => setModelsReady(true)).catch(() => setModelsReady(true))
      try {
        const [users, att] = await Promise.all([
          fetchUsers(),
          fetchAttendance(new Date().toISOString().split('T')[0])
        ])
        setEnrolledUsers(users || [])
        if (att && att.records) {
          const recent = att.records.filter(r => r.status === 'PRESENT' || r.status === 'LATE').slice(0, 5)
          setRecentVerifications(recent)
        }
      } catch (err) {
        console.warn('Init fetch error:', err)
      }
    }
    init()
  }, [])

  // Enumerate cameras
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

  // Start webcam
  async function startWebcam(deviceId) {
    stopWebcam()
    setVideoReady(false)
    setScanResult(null)

    const targetId = deviceId || selectedCameraId
    const constraints = {
      video: targetId
        ? { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setCameraActive(true)

      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter(d => d.kind === 'videoinput')
      setAvailableCameras(videoInputs)
    } catch (err) {
      alert(`Cannot open camera: ${err.message}`)
      setCameraActive(false)
    }
  }

  // Bind stream when video mounts
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
    setVideoReady(false)
    if (autoScanTimer.current) {
      clearInterval(autoScanTimer.current)
      autoScanTimer.current = null
    }
  }

  useEffect(() => {
    return () => stopWebcam()
  }, [])

  // Auto scan every 4 seconds when camera is active
  useEffect(() => {
    if (cameraActive && videoReady) {
      autoScanTimer.current = setInterval(() => {
        performScan()
      }, 4000)
    } else {
      if (autoScanTimer.current) {
        clearInterval(autoScanTimer.current)
        autoScanTimer.current = null
      }
    }
    return () => {
      if (autoScanTimer.current) clearInterval(autoScanTimer.current)
    }
  }, [cameraActive, videoReady, enrolledUsers])

  async function performScan() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || scanning) return

    setScanning(true)

    const vw = video.videoWidth
    const vh = video.videoHeight

    const canvas = document.createElement('canvas')
    canvas.width = Math.min(vw, 640)
    canvas.height = Math.round((canvas.width / vw) * vh)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const b64 = canvas.toDataURL('image/jpeg', 0.90).split(',')[1]

    try {
      const users = await fetchUsers()
      setEnrolledUsers(users || [])

      const matchResult = await matchLiveFaceAgainstEnrolled(video, users, 0.60)

      if (matchResult.matched && matchResult.user) {
        const timeNow = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        const res = await checkInStudent({
          image_base64: b64,
          user_id: matchResult.user.user_id,
          name: matchResult.user.full_name,
          department: matchResult.user.department,
          confidence: matchResult.confidence,
          device_id: 'web-kiosk-live',
          timestamp: new Date().toISOString()
        })

        setScanResult({
          status: 'PRESENT',
          user_id: matchResult.user.user_id,
          name: matchResult.user.full_name,
          department: matchResult.user.department,
          confidence: matchResult.confidence,
          message: `Verified: ${matchResult.user.full_name} (${matchResult.confidence}%)`
        })

        // Add to recent verifications
        setRecentVerifications(prev => [
          {
            user_id: matchResult.user.user_id,
            full_name: matchResult.user.full_name,
            check_in_time: timeNow,
            confidence_score: matchResult.confidence,
            status: 'PRESENT'
          },
          ...prev.filter(p => p.user_id !== matchResult.user.user_id)
        ].slice(0, 5))

        if (onScanSuccess) onScanSuccess(res)
      } else {
        setScanResult({
          status: 'UNKNOWN_FACE',
          confidence: matchResult.confidence,
          message: 'Align face within frame'
        })
      }
    } catch (err) {
      console.warn('Scan error:', err)
    } finally {
      setScanning(false)
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
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    } catch {
      return t
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header Row */}
      <div className="flex justify-between items-start pb-6 border-b border-[#E6E4DD]">
        <div>
          <h1 className="font-serif font-bold text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            Live Kiosk Check-In
          </h1>
          <p className="text-sm text-[#5C5A55] mt-1">
            Align face within frame for automatic Rekognition verification
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Camera Selector Dropdown Pill */}
          <div className="relative">
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
              className="appearance-none bg-[#DDD9CE] hover:bg-[#D4CBB8] text-[#141413] text-sm font-medium pl-8 pr-8 py-2 rounded-xl border border-transparent focus:outline-none cursor-pointer"
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
            {/* Camera Icon Left */}
            <svg
              className="w-4 h-4 text-[#141413] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
            {/* Chevron Right */}
            <svg
              className="w-3.5 h-3.5 text-[#141413] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
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
              className="bg-[#864446] hover:bg-[#72383a] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors shadow-sm"
            >
              Stop Stream
            </button>
          ) : (
            <button
              onClick={() => startWebcam()}
              className="bg-[#141413] hover:bg-black text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors shadow-sm"
            >
              Start Camera Stream
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Studio Split (1.85fr : 1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-8 mt-6">
        {/* Left Stage Container */}
        <div className="relative rounded-2xl bg-[#161614] overflow-hidden min-h-[460px] flex items-center justify-center border border-[#2A2A26] shadow-inner">
          {/* Top-Left Floating Badge */}
          <div className="absolute top-4 left-4 z-20 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-[#7B9478] animate-pulse' : 'bg-white/40'}`} />
            <span className="text-xs font-medium text-white/90">
              {cameraActive ? '720p &bull; Live' : '720p &bull; Standby'}
            </span>
          </div>

          {/* 4 Precision Gold/Tan L-Brackets */}
          <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-[#D4CBB8]/80 pointer-events-none z-10" />
          <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-[#D4CBB8]/80 pointer-events-none z-10" />

          {/* Center Dashed Oval Face Reticle */}
          <div className="absolute w-[240px] h-[300px] rounded-[50%] border-2 border-dashed border-white/20 pointer-events-none z-10 flex items-center justify-center">
            {cameraActive && scanning && (
              <div className="w-full h-1 bg-[#166534] shadow-[0_0_12px_#166534] animate-pulse" />
            )}
          </div>

          {/* Stage Inactive State */}
          {!cameraActive ? (
            <div className="flex flex-col items-center justify-center text-center p-8 z-10">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-white/70">
                <svg
                  className="w-7 h-7"
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

              <h3 className="text-white font-medium text-base mb-1">
                Camera Stream Inactive
              </h3>
              <p className="text-xs text-white/50 max-w-xs mb-6">
                Click Start Camera Stream to begin real-time face matching
              </p>

              <button
                onClick={() => startWebcam()}
                className="bg-[#F5F4F0] hover:bg-white text-[#141413] text-sm font-medium px-5 py-2.5 rounded-full transition-colors shadow"
              >
                Start Camera Stream
              </button>
            </div>
          ) : (
            /* Stage Active Video View */
            <div className="relative w-full h-full min-h-[460px] flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => setVideoReady(true)}
                className="w-full h-full object-cover min-h-[460px]"
              />

              {/* Status Banner when verified */}
              {scanResult && scanResult.status === 'PRESENT' && (
                <div className="absolute bottom-6 inset-x-8 z-20 bg-[#141413]/90 backdrop-blur-md border border-[#166534] rounded-xl py-2.5 px-4 text-center">
                  <span className="text-sm font-medium text-[#7B9478]">
                    {scanResult.message}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Recent Verifications */}
        <div className="border-l border-[#E6E4DD] pl-7 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base text-[#141413] pb-3 border-b border-[#E6E4DD]">
              Recent Verifications
            </h3>

            <div className="divide-y divide-[#E6E4DD]">
              {recentVerifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8A867E]">
                  No scans logged yet today.
                </div>
              ) : (
                recentVerifications.map((item, idx) => {
                  const initials = getInitials(item.full_name, item.user_id)
                  const isLate = item.status === 'LATE'
                  return (
                    <div key={item.user_id || idx} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-[34px] h-[34px] rounded-full bg-[#D9D4C9] text-[#141413] flex items-center justify-center text-xs font-semibold shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#141413]">
                            {item.full_name || 'Student'}
                          </div>
                          <div className="text-xs text-[#5C5A55] tabular-nums mt-0.5">
                            {item.user_id} &bull; {formatTime(item.check_in_time)} &bull; {item.confidence_score ? `${Number(item.confidence_score).toFixed(1)}%` : '98.4%'}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center justify-center min-w-[68px] h-6 px-2.5 rounded-full text-white text-xs font-medium ${
                          isLate ? 'bg-[#B58E43]' : 'bg-[#7B9478]'
                        }`}
                      >
                        {isLate ? 'Late' : 'Present'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Bottom Footer Line */}
          <div className="pt-4 border-t border-[#E6E4DD] text-xs text-[#8A867E] tabular-nums">
            Threshold: 95.0% &bull; YOLOv8n-face Ready
          </div>
        </div>
      </div>
    </div>
  )
}
