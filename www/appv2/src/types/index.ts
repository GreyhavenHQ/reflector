export interface User { id: string; name: string; email: string; avatarUrl?: string }
export interface Room { id: string; name: string; platform: string; recordingType: string; size: string; zulipStream?: string; isLocked: boolean; isShared: boolean }
export interface Chapter { id: string; title: string; timestamp: string; excerpt?: string }
export interface Transcription { id: string; title: string; roomId: string; date: string; duration: string; speakerCount: number; status: 'processed' | 'processing'; chapters: Chapter[]; quickRecap: string; summary: string }
export interface ApiKey { id: string; name: string; prefix: string; createdAt: string; lastUsed?: string }
