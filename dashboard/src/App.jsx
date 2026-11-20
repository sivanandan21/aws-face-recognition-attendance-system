import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import LiveKiosk from './components/LiveKiosk'
import Enrollment from './components/Enrollment'
import Settings from './components/Settings'
import Reports from './components/Reports'

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="min-h-screen bg-[#F5F4F0] flex justify-center items-stretch py-7 px-4 lg:px-9 font-sans selection:bg-[#C9C4B8] selection:text-[#141413]">
      {/* Architectural App Sheet */}
      <div className="w-full max-w-[1320px] bg-white border border-[#E6E4DD] rounded-[20px] shadow-[0_1px_3px_rgba(20,20,19,0.03)] grid grid-cols-[76px_1fr] overflow-hidden min-h-[760px]">
        {/* Left Icon-Only Rail */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Workspace Area */}
        <main className="flex-1 px-8 lg:px-12 py-9 overflow-y-auto">
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
