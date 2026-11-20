import React from 'react'
import { LayoutDashboard, ScanFace, UserPlus, FileSpreadsheet } from 'lucide-react'

export default function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'kiosk', label: 'Live Check-In', icon: ScanFace },
    { id: 'enroll', label: 'Enroll Student', icon: UserPlus },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  ]

  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      {/* Logo Area */}
      <div className="px-5 py-5 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">
          Smart Attendance
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Admin Dashboard</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-200">
        <p className="text-[11px] text-gray-400 leading-tight">
          AWS Rekognition + YOLOv8n
        </p>
      </div>
    </aside>
  )
}
