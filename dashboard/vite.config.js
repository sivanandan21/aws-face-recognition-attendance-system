import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built-in mock API middleware for local development before cloud deployment
function mockApiPlugin() {
  let users = [
    { user_id: '22222', full_name: 'vigu', department: 'Computer Science & Engineering', email: 'sivapn721@gmail.com', active: true, enrolled_at: new Date().toISOString(), images: ['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'] },
    { user_id: 'STU101', full_name: 'Aarav Patel', department: 'Computer Science', email: 'aarav@vit.ac.in', active: true, enrolled_at: '2026-11-20T08:00:00Z' },
    { user_id: 'STU102', full_name: 'Priya Sharma', department: 'Electronics', email: 'priya@vit.ac.in', active: true, enrolled_at: '2026-11-20T08:00:00Z' },
    { user_id: 'STU103', full_name: 'Vikram Singh', department: 'Mechanical', email: 'vikram@vit.ac.in', active: true, enrolled_at: '2026-11-20T08:00:00Z' },
    { user_id: 'STU104', full_name: 'Ananya Reddy', department: 'Computer Science', email: 'ananya@vit.ac.in', active: true, enrolled_at: '2026-11-20T08:00:00Z' },
    { user_id: 'STU105', full_name: 'Rohan Verma', department: 'Civil', email: 'rohan@vit.ac.in', active: true, enrolled_at: '2026-11-20T08:00:00Z' },
  ]

  let attendanceRecords = [
    {
      user_id: '22222',
      full_name: 'vigu',
      department: 'Computer Science & Engineering',
      check_in_time: new Date().toISOString(),
      status: 'PRESENT',
      confidence_score: 99.4,
      device_id: 'web-enroll'
    },
    {
      user_id: 'STU101',
      full_name: 'Aarav Patel',
      department: 'Computer Science',
      check_in_time: `${new Date().toISOString().split('T')[0]}T08:52:14+05:30`,
      status: 'PRESENT',
      confidence_score: 98.4,
      device_id: 'kiosk-01'
    },
    {
      user_id: 'STU102',
      full_name: 'Priya Sharma',
      department: 'Electronics',
      check_in_time: `${new Date().toISOString().split('T')[0]}T09:05:40+05:30`,
      status: 'PRESENT',
      confidence_score: 96.1,
      device_id: 'kiosk-01'
    },
    {
      user_id: 'STU103',
      full_name: 'Vikram Singh',
      department: 'Mechanical',
      check_in_time: `${new Date().toISOString().split('T')[0]}T09:22:10+05:30`,
      status: 'LATE',
      confidence_score: 95.8,
      device_id: 'kiosk-01'
    },
    {
      user_id: 'STU104',
      full_name: 'Ananya Reddy',
      department: 'Computer Science',
      check_in_time: `${new Date().toISOString().split('T')[0]}T08:41:05+05:30`,
      status: 'PRESENT',
      confidence_score: 99.2,
      device_id: 'kiosk-01'
    }
  ]

  return {
    name: 'mock-api-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost:3000')

        if (url.pathname === '/enroll' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              const newUser = {
                user_id: data.user_id,
                full_name: data.full_name,
                department: data.department || 'General',
                email: data.email || '',
                active: true,
                enrolled_at: new Date().toISOString(),
                images: data.images || []
              }
              users = users.filter(u => u.user_id !== data.user_id)
              users.unshift(newUser)

              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 201
              res.end(JSON.stringify({
                status: 'ENROLLED',
                user_id: data.user_id,
                full_name: data.full_name,
                faces_indexed: (data.images || []).length || 1,
                message: `Successfully enrolled ${data.full_name}. Biometric template stored.`
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
              const data = JSON.parse(body)

              // If unknown face:
              if (data.status === 'UNKNOWN_FACE') {
                res.setHeader('Content-Type', 'application/json')
                res.statusCode = 404
                res.end(JSON.stringify({
                  status: 'UNKNOWN_FACE',
                  message: 'Face not recognized in authorized database.'
                }))
                return
              }

              // Match by user_id
              const matchedUser = users.find(u => u.user_id === data.user_id) || {
                user_id: data.user_id || 'STU101',
                full_name: data.name || 'Student',
                department: data.department || 'General'
              }

              const istNow = new Date().toISOString()
              const checkinRecord = {
                user_id: matchedUser.user_id,
                full_name: matchedUser.full_name,
                department: matchedUser.department,
                check_in_time: istNow,
                status: 'PRESENT',
                confidence_score: data.confidence || 98.6,
                device_id: data.device_id || 'kiosk-01'
              }

              // Update records
              attendanceRecords = attendanceRecords.filter(r => r.user_id !== matchedUser.user_id)
              attendanceRecords.unshift(checkinRecord)

              res.setHeader('Content-Type', 'application/json')
              res.statusCode = 200
              res.end(JSON.stringify({
                status: 'PRESENT',
                user_id: matchedUser.user_id,
                name: matchedUser.full_name,
                department: matchedUser.department,
                confidence: data.confidence || 98.6,
                message: `Attendance recorded as PRESENT for ${matchedUser.full_name}`
              }))
            } catch (err) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        if (url.pathname === '/attendance' && req.method === 'GET') {
          const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
          const deptParam = url.searchParams.get('department')

          // Build merged list: attendance records + ABSENT for users without records
          const presentUserIds = new Set(attendanceRecords.map(r => r.user_id))
          const absentRecords = users
            .filter(u => u.active && !presentUserIds.has(u.user_id))
            .map(u => ({
              user_id: u.user_id,
              full_name: u.full_name,
              department: u.department,
              check_in_time: null,
              status: 'ABSENT',
              confidence_score: null,
              device_id: null
            }))
          let merged = [...attendanceRecords, ...absentRecords]

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

        if (url.pathname === '/users' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify(users))
          return
        }

        // GET /users/:user_id — Single user details
        const singleUserMatch = url.pathname.match(/^\/users\/([^/]+)$/)
        if (singleUserMatch && req.method === 'GET') {
          const userId = decodeURIComponent(singleUserMatch[1])
          const user = users.find(u => u.user_id === userId)
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
              const data = JSON.parse(body)
              const user = users.find(u => u.user_id === userId)
              if (!user) {
                res.setHeader('Content-Type', 'application/json')
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'User not found' }))
                return
              }
              if (data.full_name !== undefined) user.full_name = data.full_name
              if (data.department !== undefined) user.department = data.department
              if (data.email !== undefined) user.email = data.email
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
          const user = users.find(u => u.user_id === userId)
          res.setHeader('Content-Type', 'application/json')
          if (!user) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'User not found' }))
          } else {
            user.active = false
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
              const data = JSON.parse(body)
              const user = users.find(u => u.user_id === userId)
              if (!user) {
                res.setHeader('Content-Type', 'application/json')
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'User not found' }))
                return
              }
              if (!user.images) user.images = []
              const newImages = data.images || []
              user.images.push(...newImages)
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
          const user = users.find(u => u.user_id === userId)
          res.setHeader('Content-Type', 'application/json')
          if (!user) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'User not found' }))
          } else if (!user.images || faceIndex < 0 || faceIndex >= user.images.length) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid face index' }))
          } else {
            user.images.splice(faceIndex, 1)
            res.statusCode = 200
            res.end(JSON.stringify({ message: `Removed face at index ${faceIndex}`, total_faces: user.images.length }))
          }
          return
        }

        next()
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: {
    port: 3000,
    host: true
  }
})
