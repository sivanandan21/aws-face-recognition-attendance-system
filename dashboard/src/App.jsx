import React, { useState } from 'react'
import Sidebar, { FaceBrandLogo } from './components/Sidebar'
import Overview from './components/Overview'
import LiveKiosk from './components/LiveKiosk'
import Enrollment from './components/Enrollment'
import Settings from './components/Settings'
import Reports from './components/Reports'

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="min-h-screen bg-[#F5F4F0] flex justify-center items-stretch p-2 sm:p-4 lg:py-7 lg:px-9 pb-20 md:pb-7 font-sans selection:bg-[#C9C4B8] selection:text-[#141413]">
      {/* Architectural App Sheet */}
      <div className="w-full max-w-[1320px] bg-white border border-[#E6E4DD] rounded-2xl md:rounded-[20px] shadow-[0_1px_3px_rgba(20,20,19,0.03)] flex flex-col md:grid md:grid-cols-[76px_1fr] overflow-hidden min-h-[760px]">
        {/* Mobile Top Header Brand Bar (visible < md) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3.5 border-b border-[#E6E4DD] bg-[#FAF9F6]">
          <div className="flex items-center gap-2.5">
            <FaceBrandLogo className="w-7 h-7" />
            <span className="font-serif font-bold text-lg text-[#141413]">Smart Attendance</span>
          </div>
          <span className="text-[11px] font-medium text-[#166534] bg-[#E8F0EA] px-2.5 py-1 rounded-full">
            Online
          </span>
        </div>

        {/* Left Icon-Only Rail (desktop) + Mobile Bottom Bar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Workspace Area */}
        <main className="flex-1 px-4 sm:px-8 lg:px-12 py-5 sm:py-9 overflow-y-auto">
          {activeTab === 'overview' && <Overview onNavigate={setActiveTab} />}
          {activeTab === 'kiosk' && <LiveKiosk onScanSuccess={() => {}} />}
          {activeTab === 'enroll' && <Enrollment onComplete={() => setActiveTab('overview')} />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'reports' && <Reports />}
        </main>
      </div>
    </div>
  )
}
