import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { resolveImageUrl } from '../lib/image'

/** 표지/사진 공용 렌더러 — 외부 URL vs Storage 경로 분기 + 서명 URL 캐싱 */
export function useImageUrl(
  bucket: 'covers' | 'diary',
  path: string | null | undefined,
  thumb = false,
) {
  return useQuery({
    queryKey: ['img', bucket, path, thumb],
    queryFn: () => resolveImageUrl(bucket, path, { thumb }),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  })
}

const FALLBACK_BG = ['#2E3A2C', '#8C3B3B', '#3C4A5C', '#5C5248', '#4A3C5C', '#8A6E4B', '#324A44']

export function coverFallbackColor(title: string): string {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 997
  return FALLBACK_BG[h % FALLBACK_BG.length]
}

export function BookCover({
  title,
  coverUrl,
  className = '',
  thumb = false,
}: {
  title: string
  coverUrl: string | null | undefined
  className?: string
  thumb?: boolean
}) {
  const { data: url } = useImageUrl('covers', coverUrl, thumb)
  if (coverUrl && url) {
    return (
      <img
        src={url}
        alt={title}
        loading="lazy"
        className={`object-cover ${className}`}
        draggable={false}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center text-white font-bold text-center p-2 leading-snug ${className}`}
      style={{ background: coverFallbackColor(title) }}
    >
      <span className="text-[12px] break-keep">{title}</span>
    </div>
  )
}

export function DiaryPhoto({
  path,
  thumb = false,
  className = '',
  onClick,
}: {
  path: string | null | undefined
  thumb?: boolean
  className?: string
  onClick?: () => void
}) {
  const { data: url } = useImageUrl('diary', path, thumb)
  if (!path) return null
  return (
    <div
      className={`bg-[#ECECE8] overflow-hidden ${onClick ? 'cursor-zoom-in' : ''} ${className}`}
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation()
          onClick()
        })
      }
    >
      {url && <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />}
    </div>
  )
}

/** 사진 원본 크게 보기 — 시트 안에서도 안 잘리게 body 로 포털 */
export function PhotoLightbox({
  bucket = 'diary',
  path,
  onClose,
}: {
  bucket?: 'covers' | 'diary'
  path: string | null
  onClose: () => void
}) {
  const { data: url } = useImageUrl(bucket, path)
  return createPortal(
    <AnimatePresence>
      {path && (
        <motion.div
          className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {url ? (
            <motion.img
              src={url}
              alt=""
              className="max-w-full max-h-full object-contain rounded-xl"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            />
          ) : (
            <span className="text-white/70 text-[13px] font-bold">불러오는 중…</span>
          )}
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full border-0 bg-white/20 text-white text-[15px] font-bold flex items-center justify-center"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
