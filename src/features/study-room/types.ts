export type CodeLanguage = 'javascript' | 'python' | 'typescript' | 'html' | 'sql'

export interface Participant {
  id: string
  name: string
  avatar?: string | null
  isHost: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isSpeaking?: boolean
  isHandRaised?: boolean
  isScreenSharing?: boolean
  isAi?: boolean
  joinedAt: string
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  message: string
  timestamp: string
  isCodeSnippet?: boolean
}

export interface StudyRoom {
  id: string
  room_code: string
  title: string
  topic?: string | null
  created_by?: string | null
  is_active: boolean
  code_content: string
  code_language: CodeLanguage
  notes_content: string
  created_at: string
  updated_at: string
  participants_count?: number
}
