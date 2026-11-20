import React from 'react'

export function FaceBrandLogo({ className = "w-9 h-9" }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* 4 Corner Viewfinder Brackets */}
      <path d="M5 12V7C5 5.89543 5.89543 5 7 5H12" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M24 5H29C30.1046 5 31 5.89543 31 7V12" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M31 24V29C31 30.1046 30.1046 31 29 31H24" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 31H7C5.89543 31 5 30.1046 5 29V24" stroke="#141413" strokeWidth="1.8" strokeLinecap="round" />
      
      {/* Eyebrows */}
      <path d="M10.5 13H14.5" stroke="#141413" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21.5 13H25.5" stroke="#141413" strokeWidth="1.6" strokeLinecap="round" />
      
      {/* Eyes */}
      <circle cx="12.5" cy="16.5" r="1.1" fill="#141413" />
      <circle cx="23.5" cy="16.5" r="1.1" fill="#141413" />
      
      {/* Nose */}
      <path d="M18 15V20.5H16.5" stroke="#141413" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Mouth */}
      <path d="M13 24.5C14.5 25.5 21.5 25.5 23 24.5" stroke="#141413" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function GridIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
    </svg>
  )
}

function GaugeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a10 10 0 1 0 10 10" />
      <path d="M12 12l4.5-4.5" />
      <circle cx="12" cy="12" r="1.8" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ReportIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <circle cx="12" cy="9.5" r="2.5" />
      <path d="M7.5 16.5c0-1.8 2-2.8 4.5-2.8s4.5 1 4.5 2.8" />
    </svg>
  )
}

export default function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'overview', label: "Today's Attendance", icon: GridIcon },
    { id: 'kiosk', label: 'Live Kiosk Check-In', icon: GaugeIcon },
    { id: 'enroll', label: 'Student Enrollment', icon: UserIcon },
    { id: 'settings', label: 'System Settings', icon: SettingsIcon },
    { id: 'reports', label: 'Attendance Reports', icon: ReportIcon },
  ]

  return (
    <aside className="w-[76px] shrink-0 bg-[#FAF9F6] border-r border-[#E6E4DD] flex flex-col items-center py-6 select-none">
      {/* Brand Icon Mark */}
      <div className="mb-11 mt-1 cursor-pointer" onClick={() => setActiveTab('overview')} title="Smart Attendance">
        <FaceBrandLogo className="w-9 h-9" />
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col items-center gap-[18px]">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
              title={item.label}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 relative ${
                isActive
                  ? 'bg-[#141413] text-white shadow-[0_6px_14px_rgba(20,20,19,0.18)]'
                  : 'bg-transparent text-[#5C5A55] hover:bg-[#ECEAE3] hover:text-[#141413]'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
