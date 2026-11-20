/**
 * Download face-api.js model files into ../public/models/
 *
 * Usage:  node scripts/download_models.js
 *
 * Models are fetched from the official face-api.js GitHub weights directory.
 * Three model sets are needed:
 *   1. SSD MobileNet V1 — face detection
 *   2. Face Landmark 68  — landmark detection
 *   3. Face Recognition  — 128-dim embedding extraction
 */

import { promises as fs } from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MODELS_DIR = path.resolve(__dirname, '..', 'public', 'models')

const BASE_URL =
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'

const MODEL_FILES = [
  // Tiny Face Detector — fast edge detection for webcams and tight crops
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',

  // SSD MobileNet V1 — high-accuracy face detection
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',

  // 68-point face landmarks
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',

  // Face recognition (128-dim descriptor)
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
]

function download(url) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl) => {
      https.get(currentUrl, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`))
          return
        }
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

async function main() {
  await fs.mkdir(MODELS_DIR, { recursive: true })
  console.log(`Downloading face-api.js models into ${MODELS_DIR}\n`)

  for (const file of MODEL_FILES) {
    const url = `${BASE_URL}/${file}`
    const dest = path.join(MODELS_DIR, file)

    // Skip if already downloaded
    try {
      await fs.access(dest)
      console.log(`  ✓ ${file} (already exists, skipping)`)
      continue
    } catch {
      // File doesn't exist — download it
    }

    process.stdout.write(`  ↓ ${file} ... `)
    try {
      const data = await download(url)
      await fs.writeFile(dest, data)
      console.log(`OK (${(data.length / 1024).toFixed(1)} KB)`)
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
    }
  }

  console.log('\nDone. Models are ready at public/models/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
