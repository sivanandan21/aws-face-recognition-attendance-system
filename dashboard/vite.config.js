import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built-in mock API middleware for local development before cloud deployment
function mockApiPlugin() {
  let users = []
  let attendanceRecords = []

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

        if (url.pathname === '/attendance' && req.method === 'DELETE') {
          const userIdParam = url.searchParams.get('user_id')
          if (!userIdParam) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing user_id parameter' }))
            return
          }
          attendanceRecords = attendanceRecords.filter(r => r.user_id !== userIdParam)
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
              if (data.roll_number !== undefined) user.roll_number = data.roll_number
              if (data.class_id !== undefined) user.class_id = data.class_id
              if (data.phone !== undefined) user.phone = data.phone
              if (data.active !== undefined) user.active = data.active
              user.updated_at = new Date().toISOString()

              // Also update attendance records if present
              attendanceRecords = attendanceRecords.map(r => {
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
    host: true,
    allowedHosts: true
  }
})
