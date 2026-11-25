import React, { useState, useEffect } from 'react'

export default function Settings() {
  const [cutoffTime, setCutoffTime] = useState(localStorage.getItem('kiosk_cutoff_time') || '09:15 AM IST')
  const [matchThreshold, setMatchThreshold] = useState(parseFloat(localStorage.getItem('kiosk_match_threshold') || '95.0'))
  const [minAngles, setMinAngles] = useState(parseInt(localStorage.getItem('kiosk_min_angles') || '3'))
  const [autoMarkAbsent, setAutoMarkAbsent] = useState(localStorage.getItem('kiosk_auto_absent') !== 'false')
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(localStorage.getItem('kiosk_selected_camera_name') || 'Logi C270 HD Webcam')
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    async function loadCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        if (videoInputs.length > 0) {
          setAvailableCameras(videoInputs)
        }
      } catch (err) {
        console.warn('Cameras enum err:', err)
      }
    }
    loadCameras()
  }, [])

  function handleSave() {
    localStorage.setItem('kiosk_cutoff_time', cutoffTime)
    localStorage.setItem('kiosk_match_threshold', matchThreshold.toString())
    localStorage.setItem('kiosk_min_angles', minAngles.toString())
    localStorage.setItem('kiosk_auto_absent', autoMarkAbsent.toString())
    localStorage.setItem('kiosk_selected_camera_name', selectedCamera)

    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2500)
  }

  return (
    <div className="flex flex-col">
      {/* Header Row */}
      <div className="flex justify-between items-start pb-6 border-b border-[#E6E4DD]">
        <div>
          <h1 className="font-serif font-bold text-[34px] leading-tight tracking-[-0.02em] text-[#141413]">
            System Settings
          </h1>
          <p className="text-sm text-[#5C5A55] mt-1">
            Configure attendance cutoffs, biometric thresholds, and kiosk hardware
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedToast && (
            <span className="text-xs font-medium text-[#166534] bg-[#E8F0EA] px-3 py-1.5 rounded-full animate-fade">
              Settings Saved
            </span>
          )}
          <button
            onClick={handleSave}
            className="bg-[#141413] hover:bg-black text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span>+ Save Changes</span>
          </button>
        </div>
      </div>

      {/* 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-7">
        {/* Left Column: Attendance & Biometrics */}
        <div className="flex flex-col">
          <div className="mb-5">
            <h2 className="font-serif font-semibold text-[22px] tracking-[-0.015em] text-[#141413]">
              Attendance &amp; Biometrics
            </h2>
            <p className="text-xs text-[#5C5A55] mt-0.5">
              Session rules and recognition accuracy
            </p>
          </div>

          <div className="space-y-3.5">
            {/* Setting 1: Daily Late Cutoff Time */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col justify-between">
              <label className="text-sm font-medium text-[#141413] mb-2.5">
                Daily Late Cutoff Time
              </label>
              <input
                type="text"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                placeholder="09:15 AM IST"
                className="w-full max-w-[200px] bg-white border border-[#DCD9D0] rounded-lg px-3.5 py-2 text-sm text-[#141413] font-medium focus:outline-none focus:border-[#166534] tabular-nums"
              />
            </div>

            {/* Setting 2: Rekognition Match Threshold */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-[#141413]">
                  Rekognition Match Threshold
                </label>
                <span className="text-sm font-semibold text-[#141413] tabular-nums">
                  {matchThreshold.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="80"
                max="99"
                step="0.5"
                value={matchThreshold}
                onChange={(e) => setMatchThreshold(parseFloat(e.target.value))}
                className="pine-slider w-full cursor-pointer accent-[#166534]"
              />
            </div>

            {/* Setting 3: Minimum Enrollment Angles */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <label className="text-sm font-medium text-[#141413] mb-2.5">
                Minimum Enrollment Angles
              </label>
              <div className="flex items-center gap-2">
                {[3, 4, 5].map((count) => {
                  const isActive = minAngles === count
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setMinAngles(count)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-[#C9C4B8] text-[#141413]'
                          : 'bg-white text-[#5C5A55] hover:bg-[#E7E4DC]'
                      }`}
                    >
                      {count} Angles
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Setting 4: Auto-Mark Absent After Session */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex justify-between items-center">
              <label className="text-sm font-medium text-[#141413]">
                Auto-Mark Absent After Session
              </label>
              <button
                type="button"
                onClick={() => setAutoMarkAbsent(!autoMarkAbsent)}
                className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                  autoMarkAbsent ? 'bg-[#166534]' : 'bg-[#DCD9D0]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    autoMarkAbsent ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Hardware & Cloud Pipeline */}
        <div className="flex flex-col">
          <div className="mb-5">
            <h2 className="font-serif font-semibold text-[22px] tracking-[-0.015em] text-[#141413]">
              Hardware &amp; Cloud Pipeline
            </h2>
            <p className="text-xs text-[#5C5A55] mt-0.5">
              Camera source and AWS sync status
            </p>
          </div>

          <div className="space-y-3.5">
            {/* Setting 1: Default Kiosk Camera */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <label className="text-sm font-medium text-[#141413] mb-2.5">
                Default Kiosk Camera
              </label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full bg-white border border-[#DCD9D0] rounded-lg px-3.5 py-2 text-sm text-[#141413] font-medium focus:outline-none focus:border-[#166534]"
              >
                <option value="Logi C270 HD Webcam">Logi C270 HD Webcam</option>
                {availableCameras.map((cam, idx) => (
                  <option key={cam.deviceId || idx} value={cam.label || `Camera ${idx + 1}`}>
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Setting 2: Face Detection Model */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <label className="text-sm font-medium text-[#141413] mb-2.5">
                Face Detection Model
              </label>
              <div className="bg-[#E7E4DC]/60 border border-[#DCD9D0] rounded-lg px-3.5 py-2 text-sm text-[#5C5A55] font-medium">
                VEXDET (RF-DETR Small) &bull; Apache-2.0 Enhanced Engine
              </div>
            </div>

            {/* Setting 3: AWS Rekognition Collection */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <label className="text-sm font-medium text-[#141413] mb-1.5">
                AWS Rekognition Collection
              </label>
              <div className="flex justify-between items-center text-sm font-medium text-[#141413]">
                <span>smart-attendance-vectors &bull; Connected</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#7B9478]" />
              </div>
            </div>

            {/* Setting 4: DynamoDB Table */}
            <div className="bg-[#F4F3EE] rounded-xl p-4 flex flex-col">
              <label className="text-sm font-medium text-[#141413] mb-1.5">
                DynamoDB Table
              </label>
              <div className="flex justify-between items-center text-sm font-medium text-[#141413]">
                <span>AttendanceLogs &bull; Healthy</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#7B9478]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
