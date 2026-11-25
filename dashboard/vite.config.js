import fs from 'fs'
import os from 'os'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DATA_DIR = process.env.ATTENDANCE_DATA_DIR || path.join(os.homedir(), '.smart-attendance-db')
const STORE_FILE = path.join(DATA_DIR, 'store.json')

function getIstDate(isoOrDate) {
  try {
    const d = isoOrDate ? new Date(isoOrDate) : new Date()
    if (isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date())
    }
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

function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (!fs.existsSync(STORE_FILE)) {
      return { users: [], attendanceRecords: [] }
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      attendanceRecords: Array.isArray(parsed.attendanceRecords) ? parsed.attendanceRecords : []
    }
  } catch (err) {
    console.warn('[persistent-api] Could not read store, starting clean:', err.message)
    return { users: [], attendanceRecords: [] }
  }
}

function saveStore(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmpFile = `${STORE_FILE}.tmp`
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8')
    fs.renameSync(tmpFile, STORE_FILE)
  } catch (err) {
    console.error('[persistent-api] Failed to persist store:', err.message)
  }
}

// Persistent file-backed API middleware so enrolled students & logs survive restarts
// and stay synchronized across all connected browsers and devices.
function persistentApiPlugin() {
  const state = loadStore()

  function createMiddleware() {
    return (req, res, next) => {
      const url = new URL(req.url, 'http://localhost:3000')

      if (url.pathname === '/enroll' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const existing = state.users.find(u => u.user_id === data.user_id)
            const newUser = {
              user_id: data.user_id,
              full_name: data.full_name ?? existing?.full_name ?? data.user_id,
              roll_number: data.roll_number ?? existing?.roll_number ?? '',
              department: data.department || existing?.department || 'General',
              class_id: data.class_id ?? existing?.class_id ?? '',
              email: data.email ?? existing?.email ?? '',
              phone: data.phone ?? existing?.phone ?? '',
              active: data.active !== undefined ? data.active : (existing?.active ?? true),
              enrolled_at: data.enrolled_at || existing?.enrolled_at || new Date().toISOString(),
              images: (data.images && data.images.length > 0) ? data.images : (existing?.images || [])
            }
            state.users = state.users.filter(u => u.user_id !== data.user_id)
            state.users.unshift(newUser)
            saveStore(state)

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 201
            res.end(JSON.stringify({
              status: 'ENROLLED',
              user_id: newUser.user_id,
              full_name: newUser.full_name,
              faces_indexed: newUser.images.length || 1,
              message: `Successfully enrolled ${newUser.full_name}. Biometric template stored.`
            }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // Kiosk Live Check-In endpoint
      if (url.pathname === '/check-in' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')

            if (data.status === 'UNKNOWN_FACE') {
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 404
              res.end(JSON.stringify({
                status: 'UNKNOWN_FACE',
                message: 'Face not recognized in authorized database.'
              }))
              return
            }

            const matchedUser = state.users.find(u => u.user_id === data.user_id) || {
              user_id: data.user_id || 'STU101',
              full_name: data.name || 'Student',
              roll_number: data.roll_number || '',
              department: data.department || 'General'
            }

            const tsIso = data.captured_at || data.timestamp || new Date().toISOString()
            const checkInDate = data.check_in_date || getIstDate(tsIso)
            const checkinRecord = {
              user_id: matchedUser.user_id,
              full_name: matchedUser.full_name,
              roll_number: matchedUser.roll_number || '',
              department: matchedUser.department || 'General',
              check_in_time: tsIso,
              check_in_date: checkInDate,
              status: data.status || 'PRESENT',
              confidence_score: data.confidence || 98.6,
              device_id: data.device_id || 'kiosk-01'
            }

            state.attendanceRecords = state.attendanceRecords.filter(r => {
              const rDate = r.check_in_date || getIstDate(r.check_in_time)
              return !(r.user_id === matchedUser.user_id && rDate === checkInDate)
            })
            state.attendanceRecords.unshift(checkinRecord)
            saveStore(state)

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({
              status: checkinRecord.status,
              user_id: matchedUser.user_id,
              name: matchedUser.full_name,
              roll_number: matchedUser.roll_number || '',
              department: matchedUser.department,
              confidence: checkinRecord.confidence_score,
              check_in_date: checkInDate,
              message: `Attendance recorded as ${checkinRecord.status} for ${matchedUser.full_name}`
            }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      if (url.pathname === '/attendance' && req.method === 'GET') {
        const dateParam = url.searchParams.get('date') || getIstDate()
        const deptParam = url.searchParams.get('department')

        const userMap = new Map(state.users.map(u => [u.user_id, u]))
        const dayRecords = state.attendanceRecords
          .filter(r => (r.check_in_date || getIstDate(r.check_in_time)) === dateParam)
          .map(r => {
            const u = userMap.get(r.user_id)
            return u ? {
              ...r,
              full_name: u.full_name || r.full_name,
              department: u.department || r.department,
              roll_number: u.roll_number ?? r.roll_number ?? ''
            } : r
          })

        const presentUserIds = new Set(dayRecords.map(r => r.user_id))
        const absentRecords = state.users
          .filter(u => u.active !== false && !presentUserIds.has(u.user_id))
          .map(u => ({
            user_id: u.user_id,
            full_name: u.full_name || u.user_id,
            roll_number: u.roll_number || '',
            department: u.department || 'General',
            check_in_time: null,
            check_in_date: dateParam,
            status: 'ABSENT',
            confidence_score: null,
            device_id: null
          }))
        let merged = [...dayRecords, ...absentRecords]

        if (deptParam) {
          merged = merged.filter(r => r.department === deptParam)
        }
        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 200
        res.end(JSON.stringify({
          session_key: `CLASS#${dateParam}`,
          date: dateParam,
          count: merged.length,
          records: merged
        }))
        return
      }

      if (url.pathname === '/attendance' && req.method === 'DELETE') {
        const userIdParam = url.searchParams.get('user_id')
        const dateParam = url.searchParams.get('date') || getIstDate()
        if (!userIdParam) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing user_id parameter' }))
          return
        }
        state.attendanceRecords = state.attendanceRecords.filter(r => {
          const rDate = r.check_in_date || getIstDate(r.check_in_time)
          return !(r.user_id === userIdParam && rDate === dateParam)
        })
        saveStore(state)

        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 200
        res.end(JSON.stringify({
          status: 'DELETED',
          message: `Attendance record for ${userIdParam} removed`,
          user_id: userIdParam
        }))
        return
      }

      if (url.pathname === '/users' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json')
        res.statusCode = 200
        res.end(JSON.stringify(state.users))
        return
      }

      // GET /users/:user_id — Single user details
      const singleUserMatch = url.pathname.match(/^\/users\/([^/]+)$/)
      if (singleUserMatch && req.method === 'GET') {
        const userId = decodeURIComponent(singleUserMatch[1])
        const user = state.users.find(u => u.user_id === userId)
        res.setHeader('Content-Type', 'application/json')
        if (!user) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'User not found' }))
        } else {
          res.statusCode = 200
          res.end(JSON.stringify(user))
        }
        return
      }

      // PUT /users/:user_id — Update user details
      if (singleUserMatch && req.method === 'PUT') {
        const userId = decodeURIComponent(singleUserMatch[1])
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const user = state.users.find(u => u.user_id === userId)
            if (!user) {
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'User not found' }))
              return
            }
            if (data.full_name !== undefined) user.full_name = data.full_name
            if (data.department !== undefined) user.department = data.department
            if (data.email !== undefined) user.email = data.email
            if (data.roll_number !== undefined) user.roll_number = data.roll_number
            if (data.class_id !== undefined) user.class_id = data.class_id
            if (data.phone !== undefined) user.phone = data.phone
            if (data.active !== undefined) user.active = data.active
            user.updated_at = new Date().toISOString()

            state.attendanceRecords = state.attendanceRecords.map(r => {
              if (r.user_id === userId) {
                return {
                  ...r,
                  full_name: user.full_name,
                  department: user.department,
                  roll_number: user.roll_number
                }
              }
              return r
            })
            saveStore(state)

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify(user))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // DELETE /users/:user_id — Deactivate user (soft delete)
      if (singleUserMatch && req.method === 'DELETE') {
        const userId = decodeURIComponent(singleUserMatch[1])
        const user = state.users.find(u => u.user_id === userId)
        res.setHeader('Content-Type', 'application/json')
        if (!user) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'User not found' }))
        } else {
          user.active = false
          saveStore(state)
          res.statusCode = 200
          res.end(JSON.stringify({ message: `User ${userId} deactivated`, user }))
        }
        return
      }

      // POST /users/:user_id/faces — Add face photos
      const addFacesMatch = url.pathname.match(/^\/users\/([^/]+)\/faces$/)
      if (addFacesMatch && req.method === 'POST') {
        const userId = decodeURIComponent(addFacesMatch[1])
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            const user = state.users.find(u => u.user_id === userId)
            if (!user) {
              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'User not found' }))
              return
            }
            if (!user.images) user.images = []
            const newImages = data.images || []
            user.images.push(...newImages)
            user.updated_at = new Date().toISOString()
            saveStore(state)

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({ message: `Added ${newImages.length} face(s)`, total_faces: user.images.length, user }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // DELETE /users/:user_id/faces/:face_index — Remove a face photo by index
      const removeFaceMatch = url.pathname.match(/^\/users\/([^/]+)\/faces\/(\d+)$/)
      if (removeFaceMatch && req.method === 'DELETE') {
        const userId = decodeURIComponent(removeFaceMatch[1])
        const faceIndex = parseInt(removeFaceMatch[2], 10)
        const user = state.users.find(u => u.user_id === userId)
        res.setHeader('Content-Type', 'application/json')
        if (!user) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'User not found' }))
        } else if (!user.images || user.images.length <= 1) {
          res.statusCode = 400
          res.end(JSON.stringify({
            error: 'CannotDeleteLastFace',
            message: "Cannot delete the student's only remaining face photo. Add a replacement angle first."
          }))
        } else if (faceIndex < 0 || faceIndex >= user.images.length) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid face index' }))
        } else {
          user.images.splice(faceIndex, 1)
          user.updated_at = new Date().toISOString()
          saveStore(state)
          res.statusCode = 200
          res.end(JSON.stringify({ message: `Removed face at index ${faceIndex}`, total_faces: user.images.length }))
        }
        return
      }

      next()
    }
  }

  return {
    name: 'persistent-api-middleware',
    configureServer(server) {
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware())
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), persistentApiPlugin()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true
  }
})
