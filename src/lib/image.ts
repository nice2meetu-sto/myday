import { sb } from './supabase'

/**
 * 이미지 업로드 파이프라인:
 * 1. createImageBitmap (EXIF 방향 보정: imageOrientation 'from-image')
 * 2. 긴 변 1600px 리사이즈 + webp 0.8 인코딩 (원본)
 * 3. 320px 썸네일도 함께 생성 ({uuid}_thumb.webp) — Image Transformation 무료 플랜 미지원 대응
 * 4. 경로: {user_id}/{yyyy}/{uuid}.webp
 */

async function encodeResized(bitmap: ImageBitmap, maxLong: number, quality: number): Promise<Blob> {
  const long = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, maxLong / long)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
      'image/webp',
      quality,
    )
  })
}

export interface UploadResult {
  path: string
  thumbPath: string
}

export async function uploadImage(
  bucket: 'covers' | 'diary',
  userId: string,
  file: File,
): Promise<UploadResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const [main, thumb] = await Promise.all([
    encodeResized(bitmap, 1600, 0.8),
    encodeResized(bitmap, 320, 0.7),
  ])
  bitmap.close()
  const uuid = crypto.randomUUID()
  const yyyy = new Date().getFullYear()
  const path = `${userId}/${yyyy}/${uuid}.webp`
  const thumbPath = `${userId}/${yyyy}/${uuid}_thumb.webp`

  const doUpload = async () => {
    const r1 = await sb().storage.from(bucket).upload(path, main, { contentType: 'image/webp' })
    if (r1.error) throw r1.error
    const r2 = await sb()
      .storage.from(bucket)
      .upload(thumbPath, thumb, { contentType: 'image/webp' })
    if (r2.error) throw r2.error
  }
  try {
    await doUpload()
  } catch {
    // 재시도 1회
    await doUpload()
  }
  return { path, thumbPath }
}

export async function deleteImage(bucket: 'covers' | 'diary', path: string | null) {
  if (!path || path.startsWith('http')) return
  const thumb = path.replace(/\.webp$/, '_thumb.webp')
  await sb()
    .storage.from(bucket)
    .remove([path, thumb])
    .then(() => {})
    .catch(() => {})
}

const signedCache = new Map<string, { url: string; exp: number }>()

/**
 * cover_url/photo_url 공용 해석 헬퍼:
 * - http(s)로 시작하면 외부 URL 그대로
 * - 아니면 Storage 경로 → 서명 URL (1시간 TTL, 메모리 캐시)
 */
export async function resolveImageUrl(
  bucket: 'covers' | 'diary',
  path: string | null | undefined,
  opts?: { thumb?: boolean },
): Promise<string | null> {
  if (!path) return null
  if (path.startsWith('http')) return path
  const actual = opts?.thumb ? path.replace(/\.webp$/, '_thumb.webp') : path
  const cacheKey = `${bucket}:${actual}`
  const hit = signedCache.get(cacheKey)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await sb().storage.from(bucket).createSignedUrl(actual, 3600)
  if (error || !data) {
    // 썸네일이 없으면 원본으로 폴백
    if (opts?.thumb) return resolveImageUrl(bucket, path)
    return null
  }
  signedCache.set(cacheKey, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}
