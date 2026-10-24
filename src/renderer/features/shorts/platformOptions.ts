// The platform choices shown in the project settings and the short inspector.
import type { ShortPlatform } from '@shared/project/schema'

export const PLATFORM_OPTIONS: { value: ShortPlatform; label: string }[] = [
  { value: 'youtube', label: 'YouTube Shorts' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reels', label: 'Reels' },
  { value: 'generic', label: 'Generic' }
]
