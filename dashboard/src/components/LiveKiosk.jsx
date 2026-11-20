import React, { useEffect, useRef, useState } from 'react'
import { ScanFace, Camera, CheckCircle2, Video, RefreshCw, ShieldCheck, Zap, AlertTriangle, ShieldAlert } from 'lucide-react'
import { checkInStudent, fetchUsers } from '../services/api'
import { matchLiveFaceAgainstEnrolled, loadModels } from '../services/faceMatcher'

export default function LiveKiosk({ onScanSuccess }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')
  const [modelsReady, setModelsReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [autoScan, setAutoScan] = useState(false)
  const [enrolledUsers, setEnrolledUsers] = useState([])

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const autoScanTimer = useRef(null)

  // Pre-load recognition models and enrolled users on mount
  useEffect(() => {
    async function init() {
      loadModels().then(() => setModelsReady(true)).catch(() => setModelsReady(true))
      const users = await fetchUsers()
      setEnrolledUsers(users || [])
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
            c.label.toLowerCase().includes('usb') ||
            c.label.toLowerCase().includes('external')
          )
          setSelectedCameraId(externalCam ? externalCam.deviceId : videoInputs[0].deviceId)
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
      if (!targetId && videoInputs.length > 0) {
        setSelectedCameraId(videoInputs[0].deviceId)
      }
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

  // Auto scan interval
  useEffect(() => {
    if (autoScan && cameraActive && videoReady) {
      autoScanTimer.current = setInterval(() => {
        performScan()
      }, 5000)
    } else {
      if (autoScanTimer.current) {
        clearInterval(autoScanTimer.current)
        autoScanTimer.current = null
      }
    }
    return () => {
      if (autoScanTimer.current) clearInterval(autoScanTimer.current)
    }
  }, [autoScan, cameraActive, videoReady, enrolledUsers])

  async function performScan() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || scanning) return

    setScanning(true)
    setScanResult(null)

    const vw = video.videoWidth
    const vh = video.videoHeight

    // Capture clean frame snapshot for server attendance record
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(vw, 640)
    canvas.height = Math.round((canvas.width / vw) * vh)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const b64 = canvas.toDataURL('image/jpeg', 0.90).split(',')[1]

    try {
      // 1. Refresh latest enrolled users
      const users = await fetchUsers()
      setEnrolledUsers(users || [])

      // 2. Perform Biometric Feature Matching against all registered students using live video stream
      const matchResult = await matchLiveFaceAgainstEnrolled(video, users, 0.60)

      if (matchResult.matched && matchResult.user) {
        // MATCH CONFIRMED: Mark this specific student as PRESENT
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
          message: `Identity confirmed: ${matchResult.user.full_name} (${matchResult.confidence}% confidence)`
        })

        if (onScanSuccess) onScanSuccess(res)
      } else {
        // UNRECOGNIZED FACE: Reject with Error Banner
        setScanResult({
          status: 'UNKNOWN_FACE',
          confidence: matchResult.confidence,
          bestCandidate: matchResult.bestCandidate,
          message: matchResult.bestCandidate !== 'None' 
            ? `Face does not match registered profile (${matchResult.confidence}% match). Access Denied.`
            : 'Unregistered face detected. Access Denied.'
        })
      }
    } catch (err) {
      console.error('Scan error:', err)
      setScanResult({
        status: 'UNKNOWN_FACE',
        confidence: 0,
        message: 'Scan error: ' + err.message
      })
    } finally {
      setScanning(false)
    }
  }

  const isMatched = scanResult && scanResult.status === 'PRESENT'
  const isRejected = scanResult && scanResult.status === 'UNKNOWN_FACE'

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ScanFace className="h-6 w-6 text-gray-500" />
            <span>Live Kiosk Face Check-In</span>
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-mono">
              Active
            </span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Frame your face in the reticle. Enrolled students are marked PRESENT; unrecognized faces are rejected.
          </p>
        </div>

        {/* Camera Selector and Start Button */}
        <div className="flex flex-wrap items-center gap-3">
          {availableCameras.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5">
              <Video className="h-4 w-4 text-gray-400" />
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedCameraId(id)
                  localStorage.setItem('kiosk_selected_camera', id)
                  if (cameraActive) startWebcam(id)
                }}
                className="bg-transparent text-xs text-gray-700 focus:outline-none max-w-[160px] truncate"
              >
                {availableCameras.map((cam, idx) => (
                  <option key={cam.deviceId || idx} value={cam.deviceId}>
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!cameraActive ? (
            <button
              onClick={() => startWebcam()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition"
            >
              <Camera className="h-4 w-4" />
              <span>Start Camera Stream</span>
            </button>
          ) : (
            <button
              onClick={stopWebcam}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-medium transition"
            >
              <span>Stop Stream</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Live Frame */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col items-center relative overflow-hidden">
        {cameraActive ? (
          <div className="relative rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center w-full max-w-2xl aspect-video shadow-sm border border-gray-200">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
              className="w-full h-full object-cover"
            />

            {/* Target Reticle Overlay */}
            {videoReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-64 h-64 border-2 rounded-2xl relative transition-all duration-300 flex items-center justify-center ${
                    isMatched
                      ? 'border-emerald-500 shadow-sm'
                      : isRejected
                      ? 'border-red-500 shadow-sm'
                      : 'border-dashed border-gray-400'
                  }`}
                >
                  <div
                    className={`absolute -top-3 left-4 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm ${
                      isMatched ? 'bg-emerald-600' : isRejected ? 'bg-red-600' : 'bg-gray-600'
                    }`}
                  >
                    {isMatched ? 'IDENTITY VERIFIED' : isRejected ? 'FACE REJECTED' : 'ALIGN FACE IN BOX'}
                  </div>
                  <div className="h-px w-full bg-gray-300 absolute top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                <span className="text-sm">Connecting camera stream...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-2xl aspect-video rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-gray-50">
            <Camera className="h-12 w-12 text-gray-300 mb-3" />
            <h4 className="text-base font-semibold text-gray-600">Camera Stream Inactive</h4>
            <p className="text-xs text-gray-400 max-w-sm mt-1">
              Click &quot;Start Camera Stream&quot; to begin face recognition check-in with your Logitech or laptop camera.
            </p>
          </div>
        )}

        {/* Scan Controls */}
        {cameraActive && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              onClick={performScan}
              disabled={!videoReady || scanning}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-sm transition disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              <span>{scanning ? 'Verifying Biometrics...' : 'Scan Face & Check-In'}</span>
            </button>

            <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-300 px-3 py-2 rounded-lg text-xs text-gray-600">
              <input
                type="checkbox"
                checked={autoScan}
                onChange={(e) => setAutoScan(e.target.checked)}
                className="rounded border-gray-300 text-slate-900 focus:ring-slate-500"
              />
              <span>Auto-scan every 5 seconds</span>
            </label>
          </div>
        )}
      </div>

      {/* Recognition Result Banner: MATCHED (PRESENT) */}
      {isMatched && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                  PRESENT
                </span>
                <span className="text-sm font-mono text-emerald-700 font-bold">{scanResult.user_id}</span>
              </div>
              <h3 className="text-xl font-extrabold text-gray-900 mt-1">{scanResult.name}</h3>
              <p className="text-xs text-gray-500">
                {scanResult.department} &bull; Match Confidence: <span className="font-mono text-emerald-700 font-bold">{scanResult.confidence}%</span>
              </p>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end text-xs text-gray-500 font-mono">
            <span>Session: CLASS#{new Date().toISOString().split('T')[0]}</span>
            <span className="text-emerald-700 mt-1 flex items-center gap-1 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Recorded in Attendance Logs
            </span>
          </div>
        </div>
      )}

      {/* Recognition Result Banner: UNKNOWN / REJECTED */}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center">
              <ShieldAlert className="h-7 w-7 text-red-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-600 text-white">
                  ACCESS DENIED
                </span>
                <span className="text-xs font-mono text-red-700">Confidence: {scanResult.confidence}% &bull; Unregistered Face</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mt-1">Unknown Face &bull; Attendance NOT Marked</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {scanResult.message}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end text-xs text-red-600 font-mono">
            <span className="flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Security Alert Triggered
            </span>
            <span className="text-gray-400 mt-1">Unregistered Access Attempt</span>
          </div>
        </div>
      )}
    </div>
  )
}
