/**
 * High-Accuracy Low-Latency Multi-Person Face Matcher Engine
 * Powered by face-api.js (TinyFaceDetector + SSD MobileNet V1 + 68 Landmarks + ResNet 128D)
 * Uses downscaled offscreen detection canvases and pre-built cached matchers to eliminate UI lag.
 */

import * as faceapi from 'face-api.js'

let modelsLoaded = false
let modelsLoading = false
let modelsLoadFailed = false
let modelsReadyPromise = null
let ssdLoaded = false
let ssdPromise = null

// Balanced Euclidean threshold for live USB webcams (protected by ambiguity margin rule)
export const STRICT_DISTANCE_THRESHOLD = 0.54
export const AMBIGUITY_MARGIN = 0.04

// Memory cache for enrolled users' pre-computed descriptors
const descriptorCache = new Map() // user_id -> { sig: string, labeled: LabeledFaceDescriptors }
let cachedMatcher = null
let cachedMatcherKey = ''
let cachedLabeledList = []
let matcherBuildPromise = null
let matcherBuildKey = ''

// Reusable offscreen canvas for fast downscaled live detection
let scratchCanvas = null
let scratchCtx = null
let shadersWarmedUp = false

function getUserSignature(user) {
  const count = Array.isArray(user.images) ? user.images.length : 0
  const firstHead = count > 0 && typeof user.images[0] === 'string' ? user.images[0].slice(0, 24) : ''
  return `${user.user_id}:${count}:${firstHead}:${user.updated_at || ''}`
}

function loadCachedDescriptors() {
  try {
    const raw = localStorage.getItem('smart_attendance_face_descriptors')
    if (!raw) return
    const parsed = JSON.parse(raw)
    Object.entries(parsed).forEach(([uid, entry]) => {
      if (Array.isArray(entry) && entry.length > 0 && !descriptorCache.has(uid)) {
        const floatArrays = entry.map(a => new Float32Array(a))
        descriptorCache.set(uid, {
          sig: '',
          labeled: new faceapi.LabeledFaceDescriptors(uid, floatArrays)
        })
      } else if (entry && Array.isArray(entry.descriptors) && entry.descriptors.length > 0 && !descriptorCache.has(uid)) {
        const floatArrays = entry.descriptors.map(a => new Float32Array(a))
        descriptorCache.set(uid, {
          sig: entry.sig || '',
          labeled: new faceapi.LabeledFaceDescriptors(uid, floatArrays)
        })
      }
    })
  } catch (e) {
    console.warn('Failed to load cached descriptors:', e)
  }
}

function saveCachedDescriptors() {
  try {
    const obj = {}
    descriptorCache.forEach((val, uid) => {
      obj[uid] = {
        sig: val.sig,
        descriptors: val.labeled.descriptors.map(d => Array.from(d))
      }
    })
    localStorage.setItem('smart_attendance_face_descriptors', JSON.stringify(obj))
  } catch {
    // ignore quota issues
  }
}

/**
 * Load face-api.js models from /models (idempotent, shares single promise).
 */
export async function loadModels() {
  if (modelsLoaded) return true
  if (modelsLoading && modelsReadyPromise) return modelsReadyPromise

  modelsLoading = true
  modelsReadyPromise = _doLoadModels()
  return modelsReadyPromise
}

function loadSsdModelInBackground() {
  if (ssdLoaded) return Promise.resolve(true)
  if (ssdPromise) return ssdPromise
  ssdPromise = faceapi.nets.ssdMobilenetv1
    .loadFromUri('/models')
    .then(() => {
      ssdLoaded = true
      return true
    })
    .catch(() => false)
  return ssdPromise
}

async function warmupTensorflowShaders() {
  if (shadersWarmedUp || typeof document === 'undefined') return
  shadersWarmedUp = true
  try {
    const dummy = document.createElement('canvas')
    dummy.width = 112
    dummy.height = 112
    const ctx = dummy.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, 112, 112)
    }
    // Directly invoke all 3 neural nets so WebGL shaders compile before the camera turns on
    await Promise.all([
      faceapi.detectAllFaces(dummy, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })),
      faceapi.detectFaceLandmarks(dummy),
      faceapi.computeFaceDescriptor(dummy),
    ])
  } catch {
    // Warmup best-effort only
  }
}

async function _doLoadModels() {
  try {
    const MODEL_URL = '/models'
    // Load lightweight live-kiosk models first for near-instant camera detection startup
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    modelsLoaded = true
    modelsLoadFailed = false
    // Pre-compile WebGL/CPU inference shaders before camera starts so frame 0 has zero stall
    await warmupTensorflowShaders()
    // Pre-warm SSD MobileNet in the background for enrollment extraction
    loadSsdModelInBackground()
    console.log('[faceMatcher] Core live detection models + shaders ready')
    return true
  } catch (err) {
    console.warn('[faceMatcher] Model loading failed:', err)
    modelsLoadFailed = true
    modelsLoaded = false
    return false
  } finally {
    modelsLoading = false
  }
}

export function getModelStatus() {
  return { modelsLoaded, modelsLoading, modelsLoadFailed }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`
  })
}

/**
 * Extract 128-d face descriptor from an image or video element.
 */
export async function extractFaceDescriptor(imageSource) {
  await loadModels()
  if (!modelsLoaded || modelsLoadFailed) return null

  let input = imageSource
  if (typeof imageSource === 'string') {
    input = await loadImage(imageSource)
  }

  try {
    let detection = null
    if (ssdLoaded) {
      detection = await faceapi
        .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.30 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
    }

    if (!detection) {
      detection = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.20 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
    }

    return detection ? detection.descriptor : null
  } catch (err) {
    console.warn('[faceMatcher] Error extracting descriptor:', err)
    return null
  }
}

/**
 * Pre-computes and memoizes FaceMatcher for enrolled users so live video frames never stall.
 */
export async function buildFaceMatcher(enrolledUsers, distanceThreshold = STRICT_DISTANCE_THRESHOLD) {
  await loadModels()
  if (!modelsLoaded || modelsLoadFailed) return null

  const usersList = (enrolledUsers || []).filter(u => u && u.active !== false && u.images && u.images.length > 0)
  const key = `${distanceThreshold}:${usersList.map(getUserSignature).join('|')}`

  if (cachedMatcher && cachedMatcherKey === key) {
    return cachedMatcher
  }
  if (matcherBuildPromise && matcherBuildKey === key) {
    return matcherBuildPromise
  }

  matcherBuildKey = key
  matcherBuildPromise = (async () => {
    loadCachedDescriptors()
    const labeledDescriptors = []
    let newDescriptorsAdded = false

    for (const user of usersList) {
      const sig = getUserSignature(user)
      const cached = descriptorCache.get(user.user_id)
      if (cached && cached.labeled.descriptors.length > 0 && (!cached.sig || cached.sig === sig)) {
        if (!cached.sig) {
          cached.sig = sig
          newDescriptorsAdded = true
        }
        labeledDescriptors.push(cached.labeled)
        continue
      }

      const descriptors = []
      for (const b64 of user.images) {
        const desc = await extractFaceDescriptor(b64)
        if (desc) {
          descriptors.push(desc)
        }
      }

      if (descriptors.length > 0) {
        const labeled = new faceapi.LabeledFaceDescriptors(user.user_id, descriptors)
        descriptorCache.set(user.user_id, { sig, labeled })
        labeledDescriptors.push(labeled)
        newDescriptorsAdded = true
      }
    }

    if (newDescriptorsAdded) {
      saveCachedDescriptors()
    }

    cachedLabeledList = labeledDescriptors
    cachedMatcher = labeledDescriptors.length > 0
      ? new faceapi.FaceMatcher(labeledDescriptors, distanceThreshold)
      : null
    cachedMatcherKey = key
    return cachedMatcher
  })().finally(() => {
    if (matcherBuildKey === key) {
      matcherBuildPromise = null
    }
  })

  return matcherBuildPromise
}

/**
 * Find best user match while enforcing ambiguity margin against runner-up students.
 */
function findMatchWithAmbiguityGuard(descriptor, labeledList, threshold) {
  if (!labeledList || labeledList.length === 0) {
    return { matched: false, label: 'unknown', distance: 1.0, ambiguous: false }
  }

  const perUserBest = []
  for (const entry of labeledList) {
    let minDist = Infinity
    for (const refDesc of entry.descriptors) {
      const dist = faceapi.euclideanDistance(descriptor, refDesc)
      if (dist < minDist) minDist = dist
    }
    perUserBest.push({ label: entry.label, distance: minDist })
  }

  perUserBest.sort((a, b) => a.distance - b.distance)
  const top = perUserBest[0]
  if (!top || top.distance > threshold) {
    return { matched: false, label: 'unknown', distance: top ? top.distance : 1.0, ambiguous: false }
  }

  if (perUserBest.length > 1) {
    const runnerUp = perUserBest[1]
    if (runnerUp.distance <= threshold + AMBIGUITY_MARGIN && (runnerUp.distance - top.distance) < AMBIGUITY_MARGIN) {
      return { matched: false, label: 'unknown', distance: top.distance, ambiguous: true }
    }
  }

  return { matched: true, label: top.label, distance: top.distance, ambiguous: false }
}

/**
 * Grab a downscaled snapshot of the live video frame so TensorFlow.js never stalls the main UI thread.
 */
function captureDownscaledInput(videoElement, maxWidth = 480) {
  const vw = videoElement.videoWidth
  const vh = videoElement.videoHeight
  if (!vw || !vh) return null

  const scale = vw > maxWidth ? (maxWidth / vw) : 1
  const dw = Math.max(160, Math.round(vw * scale))
  const dh = Math.max(120, Math.round(vh * scale))

  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas')
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: false })
  }
  if (scratchCanvas.width !== dw || scratchCanvas.height !== dh) {
    scratchCanvas.width = dw
    scratchCanvas.height = dh
  }
  scratchCtx.drawImage(videoElement, 0, 0, dw, dh)

  return {
    inputCanvas: scratchCanvas,
    scaleX: vw / dw,
    scaleY: vh / dh,
  }
}

/**
 * Fast Simultaneous Multi-Person Live Face Detection and Matching.
 * Always detects faces visually (even before users finish enrolling) and runs non-blocking on a downscaled canvas.
 */
export async function detectAndMatchAllFaces(videoElement, enrolledUsers, threshold = STRICT_DISTANCE_THRESHOLD) {
  if (!videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0) return []

  if (!modelsLoaded) {
    await loadModels()
  }
  if (!modelsLoaded || modelsLoadFailed) {
    return []
  }

  // Ensure matcher compiles cleanly without stalling live face box tracking on first boot
  const usersList = (enrolledUsers || []).filter(u => u && u.active !== false && u.images && u.images.length > 0)
  const expectedKey = `${threshold}:${usersList.map(getUserSignature).join('|')}`
  if (usersList.length > 0 && cachedMatcherKey !== expectedKey) {
    buildFaceMatcher(enrolledUsers, threshold).catch(() => {})
  }

  const captured = captureDownscaledInput(videoElement, 416)
  if (!captured) return []
  const { inputCanvas, scaleX, scaleY } = captured

  try {
    // Fast single-stage TinyFaceDetector on downscaled frame (zero periodic heavy SSD hitching)
    const detections = await faceapi
      .detectAllFaces(inputCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.30 }))
      .withFaceLandmarks()
      .withFaceDescriptors()

    if (!detections || detections.length === 0) {
      return []
    }

    const results = []
    for (const detection of detections) {
      const match = findMatchWithAmbiguityGuard(detection.descriptor, cachedLabeledList, threshold)
      const matchedUser = match.matched ? (enrolledUsers || []).find(u => u.user_id === match.label) : null
      const isMatched = Boolean(match.matched && matchedUser)

      let confidence = 0
      if (isMatched) {
        const rawScore = 1 - (match.distance / threshold)
        confidence = Math.min(99.4, Math.max(86.0, Math.round((86 + rawScore * 13) * 10) / 10))
      } else {
        confidence = Math.max(10, Math.round((1 - Math.min(1.0, match.distance)) * 60))
      }

      const rawBox = detection.detection.box
      const isWarmingMatcher = Boolean(matcherBuildPromise)
      results.push({
        box: {
          x: rawBox.x * scaleX,
          y: rawBox.y * scaleY,
          width: rawBox.width * scaleX,
          height: rawBox.height * scaleY,
        },
        landmarks: detection.landmarks,
        matched: isMatched,
        ambiguous: match.ambiguous || (!isMatched && isWarmingMatcher),
        user: matchedUser,
        user_id: isMatched ? matchedUser.user_id : 'UNKNOWN',
        distance: match.distance,
        confidence,
        message: isMatched
          ? `Verified: ${matchedUser.full_name} (${confidence}%)`
          : (isWarmingMatcher ? 'Identifying...' : (match.ambiguous ? 'Hold Still (Clarifying)' : 'Unknown Face'))
      })
    }

    return results
  } catch (err) {
    console.warn('[faceMatcher] Multi-person detection error:', err)
    return []
  }
}
