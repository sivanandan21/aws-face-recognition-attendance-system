import React, { useState, useEffect } from 'react'
import Sidebar, { FaceBrandLogo } from './components/Sidebar'
import Overview from './components/Overview'
import LiveKiosk from './components/LiveKiosk'
import Enrollment from './components/Enrollment'
import Settings from './components/Settings'
import Reports from './components/Reports'
import { loadModels } from './services/faceMatcher'

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [istTime, setIstTime] = useState('')

  useEffect(() => {
    // Pre-warm face recognition models in background so Live Kiosk starts detecting immediately
    const timer = setTimeout(() => {
      loadModels().catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      const formatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(now)
      setIstTime(`${formatted} IST`)
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F4F0] flex justify-center items-stretch p-2 sm:p-4 lg:py-7 lg:px-9 pb-20 md:pb-7 font-sans selection:bg-[#C9C4B8] selection:text-[#141413]">
      {/* Architectural App Sheet */}
      <div className="w-full max-w-[1320px] bg-white border border-[#E6E4DD] rounded-2xl md:rounded-[20px] shadow-[0_1px_3px_rgba(20,20,19,0.03)] flex flex-col md:grid md:grid-cols-[76px_1fr] overflow-hidden min-h-[760px]">
        {/* Mobile Top Header Brand Bar (visible < md) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[#E6E4DD] bg-[#FAF9F6]">
          <div className="flex items-center gap-2">
            <FaceBrandLogo className="w-7 h-7" />
            <span className="font-serif font-bold text-base text-[#141413]">Smart Attendance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[#141413] tabular-nums bg-[#ECEAE3] px-2.5 py-1 rounded-full">
              {istTime.split(',')[1] || istTime}
            </span>
            <span className="text-[11px] font-medium text-[#166534] bg-[#E8F0EA] px-2 py-1 rounded-full">
              Online
            </span>
          </div>
        </div>

        {/* Left Icon-Only Rail (desktop) + Mobile Bottom Bar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Workspace Column with Desktop Real-Time Top Strip */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Clock & Status Strip on Desktop */}
          <div className="hidden md:flex items-center justify-between px-8 lg:px-12 py-2.5 border-b border-[#E6E4DD] bg-[#FAF9F6]/80 text-xs text-[#5C5A55]">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#166534]" />
              <span className="font-medium text-[#141413]">AWS ap-south-1 (Mumbai)</span>
              <span>&bull;</span>
              <span>Biometric Node Ready</span>
            </div>
            <div className="flex items-center gap-2 font-medium text-[#141413] tabular-nums">
              <svg className="w-3.5 h-3.5 text-[#5C5A55]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{istTime || 'Synchronizing IST...'}</span>
            </div>
          </div>

          {/* Main Workspace Area */}
          <main className="flex-1 px-4 sm:px-8 lg:px-12 py-5 sm:py-8 overflow-y-auto">
            {activeTab === 'overview' && <Overview onNavigate={setActiveTab} />}
            {activeTab === 'kiosk' && <LiveKiosk onScanSuccess={() => {}} />}
            {activeTab === 'enroll' && <Enrollment onComplete={() => setActiveTab('overview')} />}
            {activeTab === 'settings' && <Settings />}
            {activeTab === 'reports' && <Reports />}
          </main>
        </div>
      </div>
    </div>
  )
}
