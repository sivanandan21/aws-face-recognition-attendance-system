import React, { useEffect, useRef, useState } from 'react'
import { Camera, Upload, Check, AlertCircle, Trash2, UserPlus, RefreshCw, Video } from 'lucide-react'
import { enrollStudent } from '../services/api'

export default function Enrollment({ onComplete }) {
  const [userId, setUserId] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('Computer Science')
  const [email, setEmail] = useState('')
  const [photos, setPhotos] = useState([]) // Array of base64 strings
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)
  
  // Camera State
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(localStorage.getItem('kiosk_selected_camera') || '')

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // Enumerate video devices on mount
  useEffect(() => {
    async function getDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(videoInputs)
        if (videoInputs.length > 0) {
          // If there's an external camera or multiple, prioritize the second one or one with 'logitech'/'usb'
          const externalCam = videoInputs.find(c => 
            c.label.toLowerCase().includes('logitech') || 
            c.label.toLowerCase().includes('usb') ||
            c.label.toLowerCase().includes('external')
          )
          setSelectedCameraId(externalCam ? externalCam.deviceId : videoInputs[0].deviceId)
        }
      } catch (err) {
        console.warn('Error enumerating devices:', err)
      }
    }
    getDevices()
  }, [])

  // Whenever cameraActive is true and videoRef mounts, bind the stream
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(err => console.warn('Video play error:', err))
    }
  }, [cameraActive, selectedCameraId])

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopWebcam()
    }
  }, [])

  async function startWebcam(deviceId) {
    stopWebcam()
    setVideoReady(false)
    setStatusMsg(null)

    const targetDeviceId = deviceId || selectedCameraId
    const constraints = {
      video: targetDeviceId
        ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setCameraActive(true)

      // Refresh camera labels if permission was just granted
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter(d => d.kind === 'videoinput')
      setAvailableCameras(videoInputs)
      if (!targetDeviceId && videoInputs.length > 0) {
        setSelectedCameraId(videoInputs[0].deviceId)
      }
    } catch (err) {
      console.error('Webcam access error:', err)
      setStatusMsg({
        type: 'error',
        text: `Unable to access camera: ${err.message}. Ensure no other app (like another OpenCV process or Zoom) has locked it.`
      })
      setCameraActive(false)
    }
  }

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setVideoReady(false)
  }

  function handleCameraSwitch(newDeviceId) {
    setSelectedCameraId(newDeviceId)
    localStorage.setItem('kiosk_selected_camera', newDeviceId)
    if (cameraActive) {
      startWebcam(newDeviceId)
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatusMsg({
        type: 'error',
        text: 'Camera feed is still initializing. Please wait a few seconds until the preview is visible.'
      })
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    // Draw the current video frame onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const base64Data = canvas.toDataURL('image/jpeg', 0.95).split(',')[1]

    if (photos.length < 5) {
      setPhotos(prev => [...prev, base64Data])
      setStatusMsg({
        type: 'success',
        text: `Photo #${photos.length + 1} captured successfully!`
      })
    }
  }

  function handleFileUpload(e) {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const b64 = event.target.result.split(',')[1]
        setPhotos(prev => (prev.length < 5 ? [...prev, b64] : prev))
      }
      reader.readAsDataURL(file)
    })
  }

  function removePhoto(idx) {
    setPhotos(photos.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!userId.trim() || !fullName.trim()) {
      setStatusMsg({ type: 'error', text: 'Student ID and Full Name are required.' })
      return
    }
    if (photos.length === 0) {
      setStatusMsg({ type: 'error', text: 'Please capture or upload at least 1 photo (3-5 recommended).' })
      return
    }

    setLoading(true)
    setStatusMsg(null)

    try {
      const res = await enrollStudent({
        user_id: userId.trim(),
        full_name: fullName.trim(),
        department,
        email: email.trim(),
        images: photos
      })
      setStatusMsg({
        type: 'success',
        text: `Enrolled successfully! Indexed ${res.faces_indexed} face vectors.`
      })
      stopWebcam()
      setTimeout(() => {
        if (onComplete) onComplete()
      }, 1500)
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Enrollment request failed' })
    } finally {
      setLoading(false)
    }
  }

  const angleLabels = [
    '1. Frontal Pose',
    '2. Slight Left Angle',
    '3. Slight Right Angle',
    '4. Natural Expression',
    '5. Extra Angle'
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <span>Student Enrollment</span>
          <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-mono">
            Rekognition Vectors
          </span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Capture 3 to 5 multi-angle face photos to build the student vector profile.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {statusMsg.type === 'success' ? <Check className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Metadata Inputs */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Student / User ID *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 21BCE1042"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rohit Kumar"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            >
              <option value="Computer Science">Computer Science &amp; Engineering</option>
              <option value="Information Technology">Information Technology</option>
              <option value="Electronics">Electronics &amp; Communication</option>
              <option value="Mechanical">Mechanical Engineering</option>
              <option value="Civil">Civil Engineering</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. rohit.kumar@vitstudent.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>
        </div>

        {/* Multi-angle Photo Studio */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">Multi-Angle Enrollment Photos ({photos.length}/5)</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Take photos with slight angle variations to maximize recognition accuracy.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Camera Source Selector */}
              {availableCameras.length > 0 && (
                <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2 py-1">
                  <Video className="h-3.5 w-3.5 text-gray-400" />
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraSwitch(e.target.value)}
                    className="bg-transparent text-xs text-gray-700 focus:outline-none max-w-[150px] truncate"
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
                  type="button"
                  onClick={() => startWebcam()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium shadow-sm transition"
                >
                  <Camera className="h-4 w-4" />
                  <span>Start Live Webcam</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopWebcam}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-medium transition"
                >
                  <span>Stop Camera</span>
                </button>
              )}

              <label className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium cursor-pointer transition">
                <Upload className="h-4 w-4" />
                <span>Upload Files</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Active Camera View */}
          {cameraActive && (
            <div className="border border-gray-200 rounded-xl bg-gray-50 p-4 flex flex-col items-center">
              <div className="relative rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center min-h-[280px] w-full max-w-lg shadow-sm">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  onCanPlay={() => setVideoReady(true)}
                  className={`w-full max-h-72 object-cover transition-opacity duration-300 ${
                    videoReady ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {!videoReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="text-xs">Initializing camera feed...</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!videoReady || photos.length >= 5}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-sm transition disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  <span>Capture Angle #{photos.length + 1}</span>
                </button>
              </div>
            </div>
          )}

          {/* Photo Gallery Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map((idx) => {
              const photo = photos[idx]
              return (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex flex-col items-center justify-center aspect-[4/5] relative group"
                >
                  {photo ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${photo}`}
                        alt={`Angle ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-red-600 text-white opacity-0 group-hover:opacity-100 transition shadow-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="absolute bottom-1 left-2 text-[10px] font-medium text-emerald-700 bg-white/90 px-1.5 py-0.5 rounded">
                        Angle {idx + 1}
                      </span>
                    </>
                  ) : (
                    <div className="text-center p-3 text-gray-400">
                      <Camera className="h-6 w-6 mx-auto mb-1 opacity-40" />
                      <span className="text-[11px] block">{angleLabels[idx]}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || photos.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-sm transition disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            <span>{loading ? 'Indexing User Vectors...' : 'Enroll Student in AWS'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
