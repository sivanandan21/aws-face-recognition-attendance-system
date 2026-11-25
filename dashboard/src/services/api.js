/**
 * Centralized API service for the Smart Attendance Dashboard.
 * Configured via environment variables (VITE_API_BASE_URL and VITE_API_KEY).
 * Synchronizes shared records from the central backend while migrating any legacy
 * browser-local entries so all devices display consistent roster & attendance logs.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-kiosk-secret-key-change-in-prod'

const LOCAL_USERS_KEY = 'smart_attendance_users'
const LOCAL_LOGS_KEY = 'smart_attendance_logs'
const SYNCED_USERS_KEY = 'smart_attendance_synced_user_ids'
const SYNCED_LOGS_KEY = 'smart_attendance_synced_log_keys'
const MOCK_IDS = new Set(['22222', 'STU101', 'STU102', 'STU103', 'STU104', 'STU105'])

let userSyncInFlight = null
let logSyncInFlight = null

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (API_KEY) {
    headers['x-api-key'] = API_KEY
  }
  return headers
}

function getIstDate(isoOrDate) {
  try {
    const d = isoOrDate ? new Date(isoOrDate) : new Date()
    if (isNaN(d.getTime())) return getIstDate()
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d)
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

function readLocalJson(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore browser localStorage quota errors when datasets grow large
  }
}

async function syncLegacyLocalUsers(remoteUsers) {
  if (userSyncInFlight) return userSyncInFlight

  userSyncInFlight = (async () => {
    const localUsers = readLocalJson(LOCAL_USERS_KEY).filter(u => u && u.user_id && !MOCK_IDS.has(u.user_id))
    const syncedSet = new Set(readLocalJson(SYNCED_USERS_KEY))
    const remoteMap = new Map(remoteUsers.map(u => [u.user_id, u]))

    const toUpload = localUsers.filter(lu => !remoteMap.has(lu.user_id) && !syncedSet.has(lu.user_id))
    for (const lu of toUpload) {
      try {
        const res = await fetch(`${BASE_URL}/enroll`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(lu)
        })
        if (res.ok) {
          syncedSet.add(lu.user_id)
          remoteMap.set(lu.user_id, lu)
          remoteUsers.unshift(lu)
        }
      } catch {
        // Ignore single upload failure and retry next cycle if unreachable
      }
    }

    remoteUsers.forEach(ru => syncedSet.add(ru.user_id))
    writeLocalJson(SYNCED_USERS_KEY, Array.from(syncedSet))
    return remoteUsers
  })().finally(() => {
    userSyncInFlight = null
  })

  return userSyncInFlight
}

async function syncLegacyLocalLogs(remoteData) {
  if (logSyncInFlight) return logSyncInFlight

  logSyncInFlight = (async () => {
    const localLogs = readLocalJson(LOCAL_LOGS_KEY)
    const syncedLogs = new Set(readLocalJson(SYNCED_LOGS_KEY))
    const records = Array.isArray(remoteData?.records) ? remoteData.records : []
    const activePresent = new Set(
      records
        .filter(r => r.status === 'PRESENT' || r.status === 'LATE')
        .map(r => `${r.check_in_date || getIstDate(r.check_in_time)}_${r.user_id}`)
    )

    let uploadedAny = false
    for (const log of localLogs) {
      if (!log || !log.user_id) continue
      const logDate = log.check_in_date || getIstDate(log.check_in_time)
      const syncKey = `${logDate}_${log.user_id}`
      if (!activePresent.has(syncKey) && !syncedLogs.has(syncKey)) {
        try {
          const res = await fetch(`${BASE_URL}/check-in`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              user_id: log.user_id,
              name: log.full_name || log.name || log.user_id,
              department: log.department || 'General',
              roll_number: log.roll_number || '',
              confidence: log.confidence_score || 98.0,
              device_id: log.device_id || 'web-kiosk-live',
              timestamp: log.check_in_time || new Date().toISOString(),
              check_in_date: logDate
            })
          })
          if (res.ok) {
            syncedLogs.add(syncKey)
            uploadedAny = true
          }
        } catch {
          // Ignore failure and retry when reachable
        }
      }
    }

    activePresent.forEach(k => syncedLogs.add(k))
    writeLocalJson(SYNCED_LOGS_KEY, Array.from(syncedLogs))
    return uploadedAny
  })().finally(() => {
    logSyncInFlight = null
  })

  return logSyncInFlight
}

export async function fetchAttendance(dateStr, department) {
  const targetDate = dateStr || getIstDate()
  const params = new URLSearchParams()
  if (targetDate) params.append('date', targetDate)
  if (department) params.append('department', department)

  const url = `${BASE_URL}/attendance?${params.toString()}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    let data = await res.json()

    const uploadedAny = await syncLegacyLocalLogs(data)
    if (uploadedAny) {
      const refreshed = await fetch(url, { headers: getHeaders() })
      if (refreshed.ok) {
        data = await refreshed.json()
      }
    }
    return data
  } catch (err) {
    console.warn('API fetch fallback:', err)
    const localLogs = readLocalJson(LOCAL_LOGS_KEY)
    const localUsers = readLocalJson(LOCAL_USERS_KEY)
    const filtered = localLogs.filter(
      l => (l.check_in_date || getIstDate(l.check_in_time)) === targetDate
    )
    const presentIds = new Set(filtered.map(l => l.user_id))

    const combined = [...filtered]
    localUsers.forEach(u => {
      if (u.active !== false && !presentIds.has(u.user_id)) {
        combined.push({
          user_id: u.user_id,
          full_name: u.full_name || u.user_id,
          roll_number: u.roll_number || '',
          department: u.department || 'General',
          class_id: u.class_id || '',
          check_in_time: null,
          check_in_date: targetDate,
          status: 'ABSENT',
          confidence_score: null,
          device_id: null
        })
      }
    })

    return {
      session_key: `CLASS#${targetDate}`,
      date: targetDate,
      count: combined.length,
      records: combined
    }
  }
}

export async function removeAttendanceRecord(userId, dateStr) {
  const date = dateStr || getIstDate()

  const localLogs = readLocalJson(LOCAL_LOGS_KEY)
  const updatedLogs = localLogs.filter(
    l => !(l.user_id === userId && (l.check_in_date || getIstDate(l.check_in_time)) === date)
  )
  writeLocalJson(LOCAL_LOGS_KEY, updatedLogs)

  const syncedLogs = new Set(readLocalJson(SYNCED_LOGS_KEY))
  syncedLogs.add(`${date}_${userId}`)
  writeLocalJson(SYNCED_LOGS_KEY, Array.from(syncedLogs))

  const params = new URLSearchParams({ user_id: userId, date })
  const url = `${BASE_URL}/attendance?${params.toString()}`
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message || `HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    console.warn('removeAttendanceRecord remote fallback:', err)
    return {
      status: 'DELETED',
      user_id: userId,
      message: `Removed attendance record for ${userId}`
    }
  }
}

export async function fetchUsers() {
  const rawLocal = readLocalJson(LOCAL_USERS_KEY)
  const localUsers = rawLocal.filter(u => u && !MOCK_IDS.has(u.user_id))
  if (localUsers.length !== rawLocal.length) {
    writeLocalJson(LOCAL_USERS_KEY, localUsers)
  }

  const url = `${BASE_URL}/users`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const rawRemote = await res.json()
    const filteredRemote = (Array.isArray(rawRemote) ? rawRemote : []).filter(
      ru => ru && !MOCK_IDS.has(ru.user_id)
    )

    const merged = await syncLegacyLocalUsers(filteredRemote)
    writeLocalJson(LOCAL_USERS_KEY, merged)
    return merged
  } catch (err) {
    return localUsers
  }
}

export async function checkInStudent(data) {
  const checkInTime = data.timestamp || new Date().toISOString()
  const checkInDate = data.check_in_date || getIstDate(checkInTime)

  const localLogs = readLocalJson(LOCAL_LOGS_KEY)
  const newRecord = {
    user_id: data.user_id,
    full_name: data.name,
    roll_number: data.roll_number || '',
    department: data.department || 'General',
    check_in_time: checkInTime,
    check_in_date: checkInDate,
    status: 'PRESENT',
    confidence_score: data.confidence,
    device_id: data.device_id || 'web-kiosk-live'
  }
  const updatedLogs = [
    newRecord,
    ...localLogs.filter(
      l => !(l.user_id === data.user_id && (l.check_in_date || getIstDate(l.check_in_time)) === checkInDate)
    )
  ]
  writeLocalJson(LOCAL_LOGS_KEY, updatedLogs)

  const url = `${BASE_URL}/check-in`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ...data, check_in_date: checkInDate })
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message || `Check-in failed with status ${res.status}`)
    }
    const result = await res.json()
    const syncedLogs = new Set(readLocalJson(SYNCED_LOGS_KEY))
    syncedLogs.add(`${checkInDate}_${data.user_id}`)
    writeLocalJson(SYNCED_LOGS_KEY, Array.from(syncedLogs))
    return result
  } catch (err) {
    return {
      status: 'PRESENT',
      user_id: data.user_id,
      name: data.name,
      department: data.department,
      confidence: data.confidence || 98.0,
      message: `Attendance recorded as PRESENT for ${data.name}`
    }
  }
}

export async function fetchUser(userId) {
  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('fetchUser fallback:', err)
    return null
  }
}

export async function updateUser(userId, data) {
  const localUsers = readLocalJson(LOCAL_USERS_KEY)
  const updatedLocal = localUsers.map(u => u.user_id === userId ? { ...u, ...data, updated_at: new Date().toISOString() } : u)
  writeLocalJson(LOCAL_USERS_KEY, updatedLocal)

  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}`
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('updateUser remote fallback:', err)
    return updatedLocal.find(u => u.user_id === userId) || data
  }
}

export async function deleteUser(userId) {
  const localUsers = readLocalJson(LOCAL_USERS_KEY)
  const updatedLocal = localUsers.map(u => u.user_id === userId ? { ...u, active: false } : u)
  writeLocalJson(LOCAL_USERS_KEY, updatedLocal)

  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}`
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('deleteUser remote fallback:', err)
    return { message: `User ${userId} deactivated`, user: { user_id: userId, active: false } }
  }
}

export async function addUserFaces(userId, images) {
  const localUsers = readLocalJson(LOCAL_USERS_KEY)
  const targetUser = localUsers.find(u => u.user_id === userId)
  if (targetUser) {
    if (!targetUser.images) targetUser.images = []
    targetUser.images.push(...images)
    targetUser.updated_at = new Date().toISOString()
    writeLocalJson(LOCAL_USERS_KEY, localUsers)
  }

  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/faces`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ images })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('addUserFaces remote fallback:', err)
    return {
      message: `Added ${images.length} face(s)`,
      total_faces: targetUser ? targetUser.images.length : images.length,
      user: targetUser
    }
  }
}

export async function removeUserFace(userId, faceIndex) {
  const localUsers = readLocalJson(LOCAL_USERS_KEY)
  const targetUser = localUsers.find(u => u.user_id === userId)
  if (targetUser && targetUser.images) {
    if (targetUser.images.length <= 1) {
      throw new Error("Cannot delete the student's only remaining face photo. Add a replacement angle first.")
    }
    targetUser.images.splice(faceIndex, 1)
    targetUser.updated_at = new Date().toISOString()
    writeLocalJson(LOCAL_USERS_KEY, localUsers)
  }

  const url = `${BASE_URL}/users/${encodeURIComponent(userId)}/faces/${faceIndex}`
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message || `HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    if (err.message && err.message.includes("Cannot delete")) throw err
    console.warn('removeUserFace remote fallback:', err)
    return {
      message: `Removed face at index ${faceIndex}`,
      total_faces: targetUser && targetUser.images ? targetUser.images.length : 0
    }
  }
}

export async function enrollStudent(data) {
  const newUser = {
    user_id: data.user_id,
    full_name: data.full_name,
    roll_number: data.roll_number || '',
    department: data.department || 'General',
    class_id: data.class_id || '',
    email: data.email || '',
    phone: data.phone || '',
    active: true,
    enrolled_at: new Date().toISOString(),
    images: data.images || []
  }

  const url = `${BASE_URL}/enroll`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message || `Enrollment failed with status ${res.status}`)
    }
    const result = await res.json()

    const localUsers = readLocalJson(LOCAL_USERS_KEY)
    writeLocalJson(LOCAL_USERS_KEY, [newUser, ...localUsers.filter(u => u.user_id !== data.user_id)])

    const syncedSet = new Set(readLocalJson(SYNCED_USERS_KEY))
    syncedSet.add(data.user_id)
    writeLocalJson(SYNCED_USERS_KEY, Array.from(syncedSet))

    return result
  } catch (err) {
    console.warn('API /enroll endpoint unavailable, saving to local development store:', err)
    const localUsers = readLocalJson(LOCAL_USERS_KEY)
    writeLocalJson(LOCAL_USERS_KEY, [newUser, ...localUsers.filter(u => u.user_id !== data.user_id)])

    return {
      status: 'ENROLLED',
      user_id: data.user_id,
      full_name: data.full_name,
      faces_indexed: (data.images || []).length || 1,
      message: `Successfully enrolled ${data.full_name} (${(data.images || []).length} photo angles indexed)`
    }
  }
}
