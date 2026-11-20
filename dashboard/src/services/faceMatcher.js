/**
 * Face Matcher Engine — powered by face-api.js
 *
 * Uses SSD MobileNet V1 for detection, 68-point landmarks, and a ResNet-based
 * face recognition network that produces 128-dimensional descriptors.
 *
 * Fallback: if face-api.js models fail to load, an improved histogram-based
 * matcher is used instead of the old 32×32 luminance approach.
 *
 * IMPORTANT: Model weight files must be present in public/models/.
 * Run `node scripts/download_models.js` to fetch them.
 */

import * as faceapi from 'face-api.js'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let modelsLoaded = false
let modelsLoading = false
let modelsLoadFailed = false

/** Resolves when models are ready (or rejects if they fail). */
let modelsReadyPromise = null

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

/**
 * Loads face-api.js models from /models/.
 * Safe to call multiple times — only the first call triggers the download.
 * @returns {Promise<boolean>} true if models loaded successfully
 */
export async function loadModels() {
  if (modelsLoaded) return true
  if (modelsLoading && modelsReadyPromise) return modelsReadyPromise

  modelsLoading = true
  modelsReadyPromise = _doLoadModels()
  return modelsReadyPromise
}

async function _doLoadModels() {
  try {
    const MODEL_URL = '/models'
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    modelsLoaded = true
    modelsLoadFailed = false
    console.log('[faceMatcher] face-api.js models (TinyFace + SSD + Landmark + Recog) loaded successfully')
    return true
  } catch (err) {
    console.warn('[faceMatcher] face-api.js model loading failed, using fallback:', err)
    modelsLoadFailed = true
    modelsLoaded = false
    return false
  } finally {
    modelsLoading = false
  }
}

/**
 * Returns the current model-loading status.
 */
export function getModelStatus() {
  return { modelsLoaded, modelsLoading, modelsLoadFailed }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load an HTMLImageElement from a base64 string or data-URI. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`
  })
}

// ---------------------------------------------------------------------------
// Fallback: improved histogram-based matcher
// ---------------------------------------------------------------------------

function extractHistogramDescriptor(imageData) {
  const data = imageData.data
  const bins = 64
  const rHist = new Float32Array(bins)
  const gHist = new Float32Array(bins)
  const bHist = new Float32Array(bins)
  const lbpHist = new Float32Array(bins)

  const width = imageData.width
  const height = imageData.height
  const totalPixels = width * height

  // Colour histograms
  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    rHist[Math.min(Math.floor(r / 4), bins - 1)]++
    gHist[Math.min(Math.floor(g / 4), bins - 1)]++
    bHist[Math.min(Math.floor(b / 4), bins - 1)]++
  }

  // Simple LBP-like texture histogram (center-pixel vs neighbours)
  const gray = new Uint8Array(totalPixels)
  for (let i = 0; i < totalPixels; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x]
      let pattern = 0
      if (gray[(y - 1) * width + x] >= center) pattern |= 1
      if (gray[(y - 1) * width + x + 1] >= center) pattern |= 2
      if (gray[y * width + x + 1] >= center) pattern |= 4
      if (gray[(y + 1) * width + x + 1] >= center) pattern |= 8
      if (gray[(y + 1) * width + x] >= center) pattern |= 16
      if (gray[(y + 1) * width + x - 1] >= center) pattern |= 32
      if (gray[y * width + x - 1] >= center) pattern |= 64
      if (gray[(y - 1) * width + x - 1] >= center) pattern |= 128
      lbpHist[Math.min(Math.floor(pattern / 4), bins - 1)]++
    }
  }

  // Normalize all histograms
  const descriptor = new Float32Array(bins * 4)
  for (let i = 0; i < bins; i++) {
    descriptor[i] = rHist[i] / totalPixels
    descriptor[bins + i] = gHist[i] / totalPixels
    descriptor[bins * 2 + i] = bHist[i] / totalPixels
    descriptor[bins * 3 + i] = lbpHist[i] / ((width - 2) * (height - 2) || 1)
  }

  // L2-normalize
  let norm = 0
  for (let i = 0; i < descriptor.length; i++) norm += descriptor[i] * descriptor[i]
  const mag = Math.sqrt(Math.max(norm, 1e-10))
  for (let i = 0; i < descriptor.length; i++) descriptor[i] /= mag

  return descriptor
}

async function extractFallbackDescriptor(imageSource) {
  let img = imageSource
  if (typeof imageSource === 'string') {
    img = await loadImage(imageSource)
  }
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, size, size)
  const imageData = ctx.getImageData(0, 0, size, size)
  return extractHistogramDescriptor(imageData)
}

function histogramSimilarity(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return 0
  // Histogram intersection (higher = more similar, range 0–1)
  let intersection = 0
  for (let i = 0; i < desc1.length; i++) {
    intersection += Math.min(desc1[i], desc2[i])
  }
  return intersection
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Default matching threshold.
 * - face-api.js: Euclidean distance < 0.6 ⇒ match (lower = better)
 * - fallback histogram: intersection > 0.45 ⇒ match (higher = better)
 */
const DEFAULT_FACEAPI_THRESHOLD = 0.6
const DEFAULT_FALLBACK_THRESHOLD = 0.45

/**
 * Extract a face descriptor from an image.
 * Returns a 128-dim Float32Array when face-api.js is available, or a 256-dim
 * histogram descriptor as fallback.
 *
 * @param {string|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} imageSource
 * @returns {Promise<Float32Array|null>}
 */
export async function extractFaceDescriptor(imageSource) {
  // Ensure models are loaded (or fallback is in effect)
  await loadModels()

  if (modelsLoaded && !modelsLoadFailed) {
    let input = imageSource
    if (typeof imageSource === 'string') {
      input = await loadImage(imageSource)
    }
    try {
      // 1. Try SSD MobileNet first
      let detection = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      // 2. If SSD MobileNet misses (e.g. tight crops or unusual aspect ratio), try TinyFaceDetector
      if (!detection) {
        detection = await faceapi
          .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.15 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
      }

      // 3. For small thumbnails (< 256px), upscale to 300x300 canvas
      if (!detection && input instanceof HTMLImageElement && (input.width < 256 || input.height < 256)) {
        const upCanvas = document.createElement('canvas')
        upCanvas.width = 300
        upCanvas.height = 300
        const ctx = upCanvas.getContext('2d')
        ctx.drawImage(input, 0, 0, 300, 300)
        detection = await faceapi
          .detectSingleFace(upCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.10 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
      }

      if (detection) {
        return detection.descriptor // Float32Array(128)
      }

      console.warn('[faceMatcher] Face detection nets missed, using robust texture fallback')
      return extractFallbackDescriptor(imageSource)
    } catch (err) {
      console.warn('[faceMatcher] face-api detection error, using robust fallback:', err)
      return extractFallbackDescriptor(imageSource)
    }
  }

  // Fallback
  return extractFallbackDescriptor(imageSource)
}

/**
 * Compute similarity between two descriptors.
 *
 * When using face-api.js (128-dim), returns `1 - euclideanDistance` so that
 * higher values mean "more similar" (keeping the same intuition as before).
 * The raw Euclidean distance is what face-api.js uses; a distance < 0.6 is
 * considered a match.
 *
 * When using the fallback histogram, returns the histogram intersection.
 *
 * @param {Float32Array} desc1
 * @param {Float32Array} desc2
 * @returns {number} similarity score (higher = more similar)
 */
export function computeSimilarity(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return 0

  if (desc1.length === 128) {
    // face-api.js descriptors — Euclidean distance
    const distance = faceapi.euclideanDistance(desc1, desc2)
    return 1 - distance // convert to similarity: 1 = identical
  }

  // Fallback histogram similarity
  return histogramSimilarity(desc1, desc2)
}

/**
 * Match a live face crop against all enrolled users' photos.
 *
 * API-compatible with the previous implementation: returns
 * { matched, user?, rawScore, confidence, status, message, bestCandidate? }
 *
 * @param {string} liveBase64 — base64-encoded JPEG of the live face crop
 * @param {Array}  enrolledUsers — array of user objects with `.images[]`
 * @param {number} [threshold] — optional override (Euclidean distance for
 *                                face-api.js, histogram intersection for fallback)
 */
export async function matchLiveFaceAgainstEnrolled(
  liveBase64,
  enrolledUsers,
  threshold
) {
  // Merge server + localStorage users
  const localUsers = JSON.parse(localStorage.getItem('smart_attendance_users') || '[]')
  const allUsers = [...(enrolledUsers || [])]

  localUsers.forEach((lu) => {
    const existing = allUsers.find((u) => u.user_id === lu.user_id)
    if (existing) {
      if (!existing.images || existing.images.length === 0) {
        existing.images = lu.images || []
      }
    } else {
      allUsers.push(lu)
    }
  })

  const usersWithPhotos = allUsers.filter((u) => u.images && u.images.length > 0)
  if (usersWithPhotos.length === 0) {
    return {
      matched: false,
      confidence: 0,
      status: 'UNKNOWN_FACE',
      message:
        'No student face photos registered in system. Please enroll a student first.',
    }
  }

  // Make sure models are loaded (or fallback is chosen)
  await loadModels()

  const usingFaceApi = modelsLoaded && !modelsLoadFailed
  const effectiveThreshold =
    threshold !== undefined && threshold !== null
      ? threshold
      : usingFaceApi
      ? DEFAULT_FACEAPI_THRESHOLD
      : DEFAULT_FALLBACK_THRESHOLD

  // Extract live descriptor
  const liveDescriptor = await extractFaceDescriptor(liveBase64)
  if (!liveDescriptor) {
    return {
      matched: false,
      rawScore: 0,
      confidence: 0,
      status: 'UNKNOWN_FACE',
      message: 'No face detected in live camera frame. Please align your face in the box.',
    }
  }

  let bestMatch = null
  let bestScore = usingFaceApi ? Infinity : -1 // distance (lower=better) vs similarity (higher=better)

  for (const user of usersWithPhotos) {
    for (const enrolledB64 of user.images) {
      try {
        const enrolledDescriptor = await extractFaceDescriptor(enrolledB64)
        if (!enrolledDescriptor) continue

        if (usingFaceApi && liveDescriptor.length === 128 && enrolledDescriptor.length === 128) {
          // Euclidean distance — lower is better (< 0.60 is standard face-api match)
          const distance = faceapi.euclideanDistance(liveDescriptor, enrolledDescriptor)
          if (distance < bestScore) {
            bestScore = distance
            bestMatch = user
          }
        } else {
          // Fallback histogram comparison when embeddings are unavailable
          const liveHist = liveDescriptor.length === 256 ? liveDescriptor : await extractFallbackDescriptor(liveBase64)
          const enrolledHist = enrolledDescriptor.length === 256 ? enrolledDescriptor : await extractFallbackDescriptor(enrolledB64)
          const sim = histogramSimilarity(liveHist, enrolledHist)
          const pseudoDist = Math.max(0, 1.0 - sim)
          if (pseudoDist < bestScore) {
            bestScore = pseudoDist
            bestMatch = user
          }
        }
      } catch (err) {
        console.warn('[faceMatcher] Error comparing enrolled photo:', err)
      }
    }
  }

  // Determine match
  let isMatch
  if (usingFaceApi) {
    isMatch = bestScore < effectiveThreshold && bestMatch !== null
  } else {
    isMatch = bestScore > effectiveThreshold && bestMatch !== null
  }

  // Compute a human-friendly display confidence (0–100)
  let displayConfidence
  if (usingFaceApi) {
    // Distance 0 → 100%, distance 0.6 → ~60%, distance 1.0 → 0%
    const rawConfidence = Math.max(0, (1 - bestScore) * 100)
    displayConfidence = isMatch
      ? Math.min(99.4, Math.round(85 + rawConfidence * 0.14))
      : Math.max(10, Math.round(rawConfidence * 0.6))
  } else {
    displayConfidence = isMatch
      ? Math.min(99.4, Math.round(85 + (Math.max(0, bestScore - effectiveThreshold) / 0.55) * 14))
      : Math.max(18, Math.round((Math.max(0, bestScore) / Math.max(0.1, effectiveThreshold)) * 60))
  }

  if (isMatch) {
    return {
      matched: true,
      user: bestMatch,
      rawScore: usingFaceApi ? bestScore : bestScore,
      confidence: displayConfidence,
      status: 'PRESENT',
      message: `Verified Match: ${bestMatch.full_name} (${bestMatch.user_id})`,
    }
  } else {
    return {
      matched: false,
      rawScore: bestScore,
      confidence: displayConfidence,
      status: 'UNKNOWN_FACE',
      bestCandidate: bestMatch ? bestMatch.full_name : 'None',
      message:
        'Unknown Face Detected: Face does not match registered student profile. Access Denied.',
    }
  }
}
