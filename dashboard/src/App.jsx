import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import LiveKiosk from './components/LiveKiosk'
import Enrollment from './components/Enrollment'
import Reports from './components/Reports'

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-gray-900 flex font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="flex-1 flex flex-col min-h-screen">
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-8 py-8">
          {activeTab === 'overview' && <Overview onNavigate={setActiveTab} />}
          {activeTab === 'kiosk' && <LiveKiosk onScanSuccess={() => {}} />}
          {activeTab === 'enroll' && <Enrollment onComplete={() => setActiveTab('overview')} />}
          {activeTab === 'reports' && <Reports />}
        </main>

        <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
          Smart Attendance System &bull; Powered by YOLOv8n-face, AWS Rekognition User Vectors &amp; DynamoDB &bull; Based on <a href="https://github.com/sirisgowda/aws-face-recognition-attendance-system" target="_blank" rel="noreferrer" className="text-gray-500 hover:underline">sirisgowda/aws-face-recognition-attendance-system</a>
        </footer>
      </div>
    </div>
  )
}
