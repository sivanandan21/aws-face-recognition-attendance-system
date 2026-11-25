import React from 'react'
import { LayoutDashboard, UserPlus, FileSpreadsheet, ShieldCheck, Activity, ScanFace } from 'lucide-react'

export default function Navbar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'overview', label: 'Overview & Feed', icon: LayoutDashboard },
    { id: 'kiosk', label: 'Live Face Check-In', icon: ScanFace },
    { id: 'enroll', label: 'Enroll Student', icon: UserPlus },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
  ]

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo & System Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
              Smart Attendance
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/20">
                Live Edge
              </span>
            </h1>
            <p className="text-xs text-slate-400">AWS Rekognition User Vectors + VEXDET</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* System Pulse Status */}
        <div className="hidden lg:flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          <span>ap-south-1 Gateway Active</span>
        </div>

      </div>
    </header>
  )
}
