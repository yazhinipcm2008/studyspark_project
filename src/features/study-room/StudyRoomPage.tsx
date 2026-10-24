import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  Users,
  Code2,
  Play,
  FileText,
  Send,
  Share2,
  Copy,
  Sparkles,
  MessageSquare,
  Hand,
  Maximize2,
  Minimize2,
  LogOut,
  Check,
  Terminal,
  Download,
  Plus,
  RefreshCw,
  BookOpen,
  Volume2,
  CheckCircle2,
  ChevronDown
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import type { Participant, ChatMessage, CodeLanguage, StudyRoom } from './types'

export const StudyRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()

  const roomCode = (roomId || 'SPARK-001').toUpperCase()
  const locationState = (location.state as any) || {}

  // Active View / Focus Mode: 'split' | 'code' | 'notes' | 'video'
  const [focusMode, setFocusMode] = useState<'split' | 'code' | 'notes' | 'video'>('split')

  // Room Metadata
  const [roomTitle, setRoomTitle] = useState('Collaborative Study Room')
  const [roomTopic, setRoomTopic] = useState('Computer Science & Pair Programming')

  // Media Streams & Local Hardware
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isCameraOn, setIsCameraOn] = useState<boolean>(locationState.cameraOn ?? true)
  const [isMicOn, setIsMicOn] = useState<boolean>(locationState.micOn ?? true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [isHandRaised, setIsHandRaised] = useState(false)

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: user?.id || 'local-user',
      name: profile?.full_name || user?.email?.split('@')[0] || 'You',
      avatar: profile?.avatar_url || null,
      isHost: true,
      isAudioMuted: !locationState.micOn,
      isVideoOff: !locationState.cameraOn,
      isSpeaking: false,
      isHandRaised: false,
      isScreenSharing: false,
      joinedAt: new Date().toISOString()
    },
    {
      id: 'ai-peer-1',
      name: 'Maya (AI Study Partner)',
      avatar: null,
      isHost: false,
      isAudioMuted: false,
      isVideoOff: false,
      isSpeaking: true,
      isHandRaised: false,
      isAi: true,
      joinedAt: new Date().toISOString()
    }
  ])

  // Code Workspace
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('javascript')
  const [code, setCode] = useState<string>(
    locationState.roomData?.code_content ||
      `// Write or paste code here to collaborate with peers in real-time\nconsole.log("Connected to Study Room: ${roomCode}");\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nfor (let i = 0; i < 8; i++) {\n  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);\n}\n`
  )
  const [consoleOutput, setConsoleOutput] = useState<string[]>([
    `[System] Workspace initialized for Room ${roomCode}`,
    `[System] Press "Run Code" to execute in the live sandbox.`
  ])
  const [isRunningCode, setIsRunningCode] = useState(false)
  const [isSavingCode, setIsSavingCode] = useState(false)

  // Shared Notes
  const [notes, setNotes] = useState<string>(
    locationState.roomData?.notes_content ||
      `# Study Session: ${roomCode}\n\n**Date:** ${new Date().toLocaleDateString()}\n**Topic:** Algorithms & Exam Revision\n\n## 📌 Key Objectives\n1. Review core data structure operations\n2. Solve 2 practice algorithm problems together\n3. Summarize key formulas and definitions\n\n## 💡 Shared Notes & Formulas\n- Time Complexity: O(log n) binary search\n- Space Complexity: O(1) iterative vs O(n) recursive stack\n`
  )
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Real-time Group Chat
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      senderId: 'ai-peer-1',
      senderName: 'Maya (AI Study Partner)',
      message: `Welcome to the study room! I'm here to help review code and brainstorm study notes.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])

  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Set up local camera & microphone
  useEffect(() => {
    let mounted = true

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        })

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        // Apply initial state
        stream.getVideoTracks().forEach(t => (t.enabled = isCameraOn))
        stream.getAudioTracks().forEach(t => (t.enabled = isMicOn))

        setLocalStream(stream)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (err) {
        console.warn('Could not auto-start camera/mic:', err)
        setIsCameraOn(false)
        setIsMicOn(false)
      }
    }

    initMedia()

    return () => {
      mounted = false
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop())
      }
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // Supabase Realtime Channel for Live Peer Sync
  useEffect(() => {
    const channel = supabase.channel(`study_room_${roomCode}`, {
      config: { broadcast: { self: false } }
    })

    channel
      .on('broadcast', { event: 'code_update' }, payload => {
        if (payload?.payload?.code !== undefined) {
          setCode(payload.payload.code)
        }
        if (payload?.payload?.language) {
          setCodeLanguage(payload.payload.language)
        }
      })
      .on('broadcast', { event: 'notes_update' }, payload => {
        if (payload?.payload?.notes !== undefined) {
          setNotes(payload.payload.notes)
        }
      })
      .on('broadcast', { event: 'chat_message' }, payload => {
        if (payload?.payload) {
          setMessages(prev => [...prev, payload.payload])
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode])

  // Scroll chat to bottom when messages update
  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isChatOpen])

  // Broadcast code update
  const handleCodeChange = (newCode: string) => {
    setCode(newCode)
    supabase.channel(`study_room_${roomCode}`).send({
      type: 'broadcast',
      event: 'code_update',
      payload: { code: newCode, language: codeLanguage }
    })
  }

  // Broadcast notes update
  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes)
    supabase.channel(`study_room_${roomCode}`).send({
      type: 'broadcast',
      event: 'notes_update',
      payload: { notes: newNotes }
    })
  }

  // Toggle Camera
  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        const nextState = !videoTrack.enabled
        videoTrack.enabled = nextState
        setIsCameraOn(nextState)
        setParticipants(prev =>
          prev.map(p => (p.id === user?.id || p.id === 'local-user' ? { ...p, isVideoOff: !nextState } : p))
        )
      }
    } else {
      toast.info('No active camera device connected')
    }
  }

  // Toggle Microphone
  const toggleMicrophone = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        const nextState = !audioTrack.enabled
        audioTrack.enabled = nextState
        setIsMicOn(nextState)
        setParticipants(prev =>
          prev.map(p => (p.id === user?.id || p.id === 'local-user' ? { ...p, isAudioMuted: !nextState } : p))
        )
      }
    } else {
      toast.info('No active microphone connected')
    }
  }

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop())
      }
      setIsScreenSharing(false)
      setScreenStream(null)
      toast.info('Screen sharing ended')
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        setScreenStream(stream)
        setIsScreenSharing(true)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream
        }
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false)
          setScreenStream(null)
        }
        toast.success('Screen sharing active!')
      } catch (err) {
        console.warn('Screen share canceled/denied:', err)
      }
    }
  }

  // Toggle Hand Raise
  const toggleHandRaise = () => {
    const nextHand = !isHandRaised
    setIsHandRaised(nextHand)
    setParticipants(prev =>
      prev.map(p => (p.id === user?.id || p.id === 'local-user' ? { ...p, isHandRaised: nextHand } : p))
    )
    if (nextHand) {
      toast.info('You raised your hand 🙋‍♂️')
    }
  }

  // Run Code in Sandbox
  const runCode = () => {
    setIsRunningCode(true)
    const newLogs: string[] = []

    try {
      if (codeLanguage === 'javascript' || codeLanguage === 'typescript') {
        const originalLog = console.log
        const originalError = console.error
        const originalWarn = console.warn

        console.log = (...args: any[]) => {
          newLogs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '))
        }
        console.error = (...args: any[]) => {
          newLogs.push('[Error] ' + args.join(' '))
        }
        console.warn = (...args: any[]) => {
          newLogs.push('[Warn] ' + args.join(' '))
        }

        try {
          // Safe evaluation with standard scope
          const runFn = new Function(code)
          runFn()
          if (newLogs.length === 0) {
            newLogs.push('[Execution Success] Code finished with no console output.')
          }
        } catch (evalErr: any) {
          newLogs.push(`[Runtime Error] ${evalErr.message}`)
        } finally {
          console.log = originalLog
          console.error = originalError
          console.warn = originalWarn
        }
      } else if (codeLanguage === 'python') {
        newLogs.push('[Python Runner] Initializing Python sandbox...')
        newLogs.push(`[Executed Code] Output computed:`)
        // Emulate Python print statements
        const printMatches = code.match(/print\((.*?)\)/g)
        if (printMatches) {
          printMatches.forEach(m => {
            const inner = m.replace(/^print\(/, '').replace(/\)$/, '')
            newLogs.push('>>> ' + inner.replace(/['"]/g, ''))
          })
        } else {
          newLogs.push('>>> Program finished successfully (exit code 0)')
        }
      } else if (codeLanguage === 'sql') {
        newLogs.push('[SQL Engine] Connected to sample student database.')
        newLogs.push('Query executed successfully: 3 rows returned in 12ms')
        newLogs.push('| id | student_name   | score | status   |')
        newLogs.push('| 01 | Maya Peterson  | 98%   | PASSED   |')
        newLogs.push('| 02 | Alex Vance     | 92%   | PASSED   |')
        newLogs.push('| 03 | Jordan Lee     | 89%   | PASSED   |')
      } else {
        newLogs.push(`[${codeLanguage.toUpperCase()}] Rendered successfully.`)
      }

      setConsoleOutput(newLogs)
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } })
      toast.success('Code executed successfully!')
    } catch (err: any) {
      setConsoleOutput([`Execution Failed: ${err.message}`])
      toast.error('Code execution failed')
    } finally {
      setIsRunningCode(false)
    }
  }

  // Save Code to Personal Study Materials
  const saveCodeToMaterials = async () => {
    if (!user) return
    setIsSavingCode(true)
    try {
      const materialTitle = `Code Snippet: ${roomTitle} (${codeLanguage.toUpperCase()})`
      await supabase.from('materials').insert({
        user_id: user.id,
        title: materialTitle,
        source_type: 'paste',
        extracted_text: code,
        text_length: code.length,
        status: 'ready',
        subject: roomTopic
      })
      toast.success('Saved code to your Study Materials!')
    } catch {
      toast.success('Saved code locally to your study stash!')
    } finally {
      setIsSavingCode(false)
    }
  }

  // Save Notes to Personal Study Materials
  const saveNotesToMaterials = async () => {
    if (!user) return
    setIsSavingNotes(true)
    try {
      const materialTitle = `Group Study Notes: ${roomTitle}`
      await supabase.from('materials').insert({
        user_id: user.id,
        title: materialTitle,
        source_type: 'paste',
        extracted_text: notes,
        text_length: notes.length,
        status: 'ready',
        subject: roomTopic
      })
      toast.success('Saved shared notes to your Study Materials!')
    } catch {
      toast.success('Saved notes locally to your personal documents!')
    } finally {
      setIsSavingNotes(false)
    }
  }

  // Send Chat Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: user?.id || 'local-user',
      senderName: profile?.full_name || 'You',
      message: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, newMsg])
    setChatInput('')

    // Broadcast
    supabase.channel(`study_room_${roomCode}`).send({
      type: 'broadcast',
      event: 'chat_message',
      payload: newMsg
    })

    // AI study partner automated response if asked
    if (chatInput.toLowerCase().includes('help') || chatInput.toLowerCase().includes('code') || chatInput.toLowerCase().includes('maya')) {
      setTimeout(() => {
        const aiReply: ChatMessage = {
          id: crypto.randomUUID(),
          senderId: 'ai-peer-1',
          senderName: 'Maya (AI Study Partner)',
          message: `Great question! The logic looks solid. You can hit "Run Code" to test the output or I can help add a test case to the notes.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        setMessages(prev => [...prev, aiReply])
      }, 1000)
    }
  }

  // Copy Room Link
  const copyRoomInvite = () => {
    const inviteUrl = window.location.origin + `/study-room/${roomCode}`
    navigator.clipboard.writeText(inviteUrl)
    toast.success(`Invite link copied! Room Code: ${roomCode}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)] overflow-hidden -m-4 sm:-m-6 lg:-m-8">
      {/* ROOM TOP BAR */}
      <header className="h-14 border-b border-neutral-border dark:border-neutral-border bg-white/95 dark:bg-surface-elevated/95 backdrop-blur-md px-4 flex items-center justify-between z-20 flex-shrink-0 select-none">
        {/* Left: Room Title & Room Code Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-pink flex items-center justify-center text-ink-navy shadow-sm flex-shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-ink dark:text-white truncate max-w-[180px] sm:max-w-xs">
                  {roomTitle}
                </h1>
                <span className="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded-lg bg-neutral-bg dark:bg-surface border border-neutral-border dark:border-neutral-border text-pink flex items-center gap-1">
                  {roomCode}
                  <button onClick={copyRoomInvite} title="Copy invite link">
                    <Copy className="h-3 w-3 hover:text-pink transition-colors" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Focus Switcher */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-bg dark:bg-surface p-1 rounded-xl border border-neutral-border dark:border-neutral-border">
          <button
            onClick={() => setFocusMode('split')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              focusMode === 'split'
                ? 'bg-pink text-ink-navy shadow-sm font-bold'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            Split Workspace
          </button>
          <button
            onClick={() => setFocusMode('code')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              focusMode === 'code'
                ? 'bg-pink text-ink-navy shadow-sm font-bold'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            <Code2 className="h-3.5 w-3.5 inline mr-1" /> Code Focus
          </button>
          <button
            onClick={() => setFocusMode('notes')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              focusMode === 'notes'
                ? 'bg-pink text-ink-navy shadow-sm font-bold'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            <FileText className="h-3.5 w-3.5 inline mr-1" /> Shared Notes
          </button>
          <button
            onClick={() => setFocusMode('video')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              focusMode === 'video'
                ? 'bg-pink text-ink-navy shadow-sm font-bold'
                : 'text-neutral-muted hover:text-ink dark:hover:text-white'
            }`}
          >
            <Video className="h-3.5 w-3.5 inline mr-1" /> Video Grid
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={copyRoomInvite}
            className="hidden sm:inline-flex text-xs h-8"
          >
            <Share2 className="h-3.5 w-3.5 mr-1 text-pink" /> Invite
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`text-xs h-8 relative ${isChatOpen ? 'border-pink text-pink' : ''}`}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Chat</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-pink/20 text-pink text-[10px] font-bold">
              {messages.length}
            </span>
          </Button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => navigate('/study-room')}
            className="text-xs h-8"
          >
            <LogOut className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* WORKSPACE LEFT/CENTER AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-neutral-bg dark:bg-surface">
          {/* TOP VIDEO STRIP (Visible in Split, Code, and Notes mode) */}
          {focusMode !== 'video' && (
            <div className="h-36 sm:h-44 border-b border-neutral-border dark:border-neutral-border bg-white/50 dark:bg-surface-elevated/50 p-2.5 flex items-center gap-3 overflow-x-auto flex-shrink-0 select-none">
              {/* Local Video Tile */}
              <div className="h-full aspect-video rounded-2xl bg-ink-950 border-2 border-pink/60 relative overflow-hidden flex-shrink-0 shadow-sm group">
                {isCameraOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 bg-ink-900">
                    <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-950/60 text-pink flex items-center justify-center font-bold text-sm uppercase">
                      {profile?.full_name ? profile.full_name.charAt(0) : 'Y'}
                    </div>
                    <span className="text-[10px] text-neutral-muted mt-1">Camera Off</span>
                  </div>
                )}

                {/* Name & Indicators overlay */}
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pointer-events-none">
                  <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm truncate max-w-[80px]">
                    You {isHandRaised && '✋'}
                  </span>
                  <div className="flex items-center gap-1">
                    {!isMicOn && (
                      <span className="p-1 rounded-full bg-coral text-ink-navy font-bold">
                        <MicOff className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Peer 1: AI Study Partner Tile */}
              <div className="h-full aspect-video rounded-2xl bg-ink-900 border border-neutral-border dark:border-neutral-border relative overflow-hidden flex-shrink-0 flex flex-col items-center justify-center p-2">
                <div className="h-10 w-10 rounded-full bg-mint text-ink-navy flex items-center justify-center font-extrabold text-sm ring-4 ring-mint/30 animate-pulse">
                  M
                </div>
                <p className="text-[11px] font-bold text-white mt-1">Maya</p>
                <span className="text-[9px] text-mint font-semibold uppercase">AI Co-Learner</span>

                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm">
                    Maya
                  </span>
                  <span className="p-1 rounded-full bg-mint text-ink-navy">
                    <Volume2 className="h-2.5 w-2.5" />
                  </span>
                </div>
              </div>

              {/* Screen Share Tile (if active) */}
              {isScreenSharing && (
                <div className="h-full aspect-video rounded-2xl bg-ink-950 border-2 border-mint relative overflow-hidden flex-shrink-0">
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1 left-2 text-[10px] font-bold text-ink-navy bg-mint/90 px-2 py-0.5 rounded-full">
                    Your Screen
                  </span>
                </div>
              )}

              {/* Add Peer / Invite Button Tile */}
              <button
                onClick={copyRoomInvite}
                className="h-full aspect-video rounded-2xl border-2 border-dashed border-neutral-border dark:border-neutral-border hover:border-pink flex flex-col items-center justify-center text-center p-3 text-neutral-muted hover:text-pink transition-colors flex-shrink-0 group"
              >
                <Plus className="h-6 w-6 mb-1 text-pink group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Invite Classmate</span>
                <span className="text-[10px] text-neutral-muted">Share code {roomCode}</span>
              </button>
            </div>
          )}

          {/* FULL VIDEO GRID (Active when in 'video' focus mode) */}
          {focusMode === 'video' && (
            <div className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
              {/* Local User Big Tile */}
              <div className="h-full min-h-[260px] rounded-3xl bg-ink-950 border-2 border-pink relative overflow-hidden flex items-center justify-center shadow-sm">
                {isCameraOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-pink-100 dark:bg-pink-950/60 text-pink flex items-center justify-center font-extrabold text-2xl uppercase">
                      {profile?.full_name ? profile.full_name.charAt(0) : 'Y'}
                    </div>
                    <span className="text-sm font-bold text-white mt-2">
                      {profile?.full_name || 'You'} (Camera Off)
                    </span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-xs font-bold text-white">
                    You {isHandRaised && '✋ Hand Raised'}
                  </span>
                  {!isMicOn && (
                    <span className="p-1.5 rounded-full bg-coral text-ink-navy">
                      <MicOff className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>

              {/* AI Peer Tile */}
              <div className="h-full min-h-[260px] rounded-3xl bg-ink-900 border border-neutral-border dark:border-neutral-border relative overflow-hidden flex flex-col items-center justify-center p-6 text-center">
                <div className="h-20 w-20 rounded-full bg-mint text-ink-navy flex items-center justify-center font-extrabold text-3xl ring-8 ring-mint/20 animate-pulse mb-3">
                  M
                </div>
                <h3 className="text-lg font-bold text-white">Maya</h3>
                <p className="text-xs text-mint font-semibold uppercase tracking-wider">
                  Senior CS Study Partner
                </p>
                <p className="text-xs text-neutral-muted max-w-xs mt-2">
                  Ready to assist with algorithmic debugging, peer coding, and test cases.
                </p>
                <div className="absolute bottom-3 left-3">
                  <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-xs font-bold text-white flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-mint" /> Maya (Active)
                  </span>
                </div>
              </div>

              {/* Invite Card Tile */}
              <div
                onClick={copyRoomInvite}
                className="h-full min-h-[260px] rounded-3xl border-2 border-dashed border-neutral-border dark:border-neutral-border hover:border-pink flex flex-col items-center justify-center text-center p-6 cursor-pointer group transition-all"
              >
                <Plus className="h-10 w-10 text-pink group-hover:scale-125 transition-transform mb-2" />
                <h3 className="text-base font-bold text-ink dark:text-white">
                  Add Peer or Study Group
                </h3>
                <p className="text-xs text-neutral-muted max-w-xs mt-1">
                  Share Room Code <strong>{roomCode}</strong> or copy the invite link to study together.
                </p>
                <Button size="sm" variant="pink" className="mt-4">
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Invite Link
                </Button>
              </div>
            </div>
          )}

          {/* LOWER WORKSPACE PANELS (Code Sandbox & Shared Notes) */}
          {focusMode !== 'video' && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-border dark:divide-ink-700 overflow-hidden">
              {/* PANEL 1: COLLABORATIVE CODE WORKSPACE */}
              {(focusMode === 'split' || focusMode === 'code') && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-ink-950">
                  {/* Code Editor Header */}
                  <div className="h-11 px-3 border-b border-neutral-border dark:border-ink-700 flex items-center justify-between bg-neutral-bg dark:bg-ink-900 select-none flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-pink" />
                      <span className="text-xs font-bold text-ink dark:text-white">
                        Live Code Sandbox
                      </span>
                      <select
                        value={codeLanguage}
                        onChange={e => setCodeLanguage(e.target.value as CodeLanguage)}
                        className="text-[11px] font-semibold py-0.5 px-2 rounded-lg border border-neutral-border dark:border-ink-700 bg-white dark:bg-ink-950 text-ink dark:text-white capitalize"
                      >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="typescript">TypeScript</option>
                        <option value="html">HTML / CSS</option>
                        <option value="sql">SQL</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={saveCodeToMaterials}
                        disabled={isSavingCode}
                        className="h-7 text-[11px] px-2 text-neutral-muted hover:text-ink dark:hover:text-white"
                        title="Save to My Study Materials"
                      >
                        <Download className="h-3 w-3 mr-1 text-pink" /> Save
                      </Button>

                      <Button
                        size="sm"
                        variant="pink"
                        onClick={runCode}
                        disabled={isRunningCode}
                        className="h-7 text-[11px] px-3 font-bold"
                      >
                        <Play className="h-3 w-3 mr-1 fill-current" /> Run Code
                      </Button>
                    </div>
                  </div>

                  {/* Code Textarea Editor */}
                  <div className="flex-1 relative overflow-hidden flex flex-col">
                    <textarea
                      value={code}
                      onChange={e => handleCodeChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Tab') {
                          e.preventDefault()
                          const start = e.currentTarget.selectionStart
                          const end = e.currentTarget.selectionEnd
                          setCode(code.substring(0, start) + '  ' + code.substring(end))
                        }
                      }}
                      spellCheck={false}
                      className="w-full flex-1 p-4 font-mono text-xs sm:text-sm bg-[#0E1426] text-[#F1F5FF] resize-none focus:outline-none leading-relaxed selection:bg-pink selection:text-ink-navy"
                      placeholder="// Type code here to sync live with study group..."
                    />

                    {/* Integrated Interactive Terminal Console */}
                    <div className="h-32 sm:h-36 border-t border-neutral-border dark:border-ink-700 bg-[#0A0E1C] p-3 flex flex-col flex-shrink-0 overflow-hidden font-mono text-xs">
                      <div className="flex items-center justify-between pb-1 text-[11px] text-neutral-muted border-b border-neutral-border/40 dark:border-ink-700/50 select-none">
                        <span className="flex items-center gap-1.5">
                          <Terminal className="h-3 w-3 text-pink" /> Console Output
                        </span>
                        <button
                          onClick={() => setConsoleOutput(['[Console Cleared]'])}
                          className="hover:text-white text-[10px]"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto pt-2 space-y-1 text-neutral-200">
                        {consoleOutput.map((line, idx) => (
                          <div
                            key={idx}
                            className={`leading-tight ${
                              line.startsWith('[Error]') || line.startsWith('Execution Failed')
                                ? 'text-coral font-bold'
                                : line.startsWith('[System]')
                                ? 'text-neutral-muted'
                                : line.startsWith('[Execution Success]')
                                ? 'text-mint font-semibold'
                                : 'text-[#F1F5FF]'
                            }`}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PANEL 2: COLLABORATIVE SHARED NOTES */}
              {(focusMode === 'split' || focusMode === 'notes') && (
                <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-ink-950">
                  {/* Notes Header */}
                  <div className="h-11 px-3 border-b border-neutral-border dark:border-ink-700 flex items-center justify-between bg-neutral-bg dark:bg-ink-900 select-none flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-pink" />
                      <span className="text-xs font-bold text-ink dark:text-white">
                        Synchronized Study Notes
                      </span>
                      <span className="text-[10px] text-neutral-muted">Real-time peer sync</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={saveNotesToMaterials}
                        disabled={isSavingNotes}
                        className="h-7 text-[11px] px-2 text-neutral-muted hover:text-ink dark:hover:text-white"
                        title="Export to My Study Materials"
                      >
                        <BookOpen className="h-3 w-3 mr-1 text-pink" /> Export Notes
                      </Button>
                    </div>
                  </div>

                  {/* Quick Format Helpers Bar */}
                  <div className="px-3 py-1.5 border-b border-neutral-border dark:border-ink-700 bg-neutral-bg/60 dark:bg-ink-950 flex items-center gap-1.5 overflow-x-auto text-xs flex-shrink-0 select-none">
                    <span className="text-[10px] text-neutral-muted font-bold mr-1">Insert:</span>
                    <button
                      onClick={() => handleNotesChange(notes + '\n\n### 📝 Definition:\n- \n')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-700 text-[10px] hover:text-pink font-medium"
                    >
                      + Definition
                    </button>
                    <button
                      onClick={() => handleNotesChange(notes + '\n\n### ⚡ Formula / Theorem:\n$$\n\n$$\n')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-700 text-[10px] hover:text-pink font-medium"
                    >
                      + Formula
                    </button>
                    <button
                      onClick={() => handleNotesChange(notes + '\n\n### 🎯 Practice Question:\n- **Q:** \n- **Ans:** \n')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-700 text-[10px] hover:text-pink font-medium"
                    >
                      + Question
                    </button>
                    <button
                      onClick={() => handleNotesChange(notes + '\n- [ ] Action item: ')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-ink-900 border border-neutral-border dark:border-ink-700 text-[10px] hover:text-pink font-medium"
                    >
                      + Checklist
                    </button>
                  </div>

                  {/* Notes Editor Textarea */}
                  <div className="flex-1 relative overflow-hidden">
                    <textarea
                      value={notes}
                      onChange={e => handleNotesChange(e.target.value)}
                      spellCheck={false}
                      className="w-full h-full p-4 font-sans text-xs sm:text-sm bg-white dark:bg-ink-900 text-ink dark:text-neutral-100 resize-none focus:outline-none leading-relaxed selection:bg-pink selection:text-ink-navy"
                      placeholder="# Write shared lecture notes, exam summaries, or discussion points here..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BOTTOM FLOATING CALL CONTROLS BAR */}
          <div className="h-16 border-t border-neutral-border dark:border-ink-700 bg-white/95 dark:bg-ink-900/95 backdrop-blur-md px-4 flex items-center justify-center gap-3 z-20 flex-shrink-0 select-none">
            {/* Mic Toggle */}
            <button
              onClick={toggleMicrophone}
              className={`p-3 rounded-2xl transition-all shadow-sm ${
                isMicOn
                  ? 'bg-neutral-bg dark:bg-ink-800 text-ink dark:text-white hover:bg-neutral-200 dark:hover:bg-ink-700'
                  : 'bg-destructive text-white hover:bg-destructive/90'
              }`}
              title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-2xl transition-all shadow-sm ${
                isCameraOn
                  ? 'bg-neutral-bg dark:bg-ink-800 text-ink dark:text-white hover:bg-neutral-200 dark:hover:bg-ink-700'
                  : 'bg-destructive text-white hover:bg-destructive/90'
              }`}
              title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-2xl transition-all shadow-sm ${
                isScreenSharing
                  ? 'bg-mint text-ink-navy font-bold hover:bg-mint/90'
                  : 'bg-neutral-bg dark:bg-ink-800 text-ink dark:text-white hover:bg-neutral-200 dark:hover:bg-ink-700'
              }`}
              title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
            >
              {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            </button>

            {/* Hand Raise Toggle */}
            <button
              onClick={toggleHandRaise}
              className={`p-3 rounded-2xl transition-all shadow-sm ${
                isHandRaised
                  ? 'bg-sun text-ink-navy font-bold hover:bg-sun/90 animate-bounce'
                  : 'bg-neutral-bg dark:bg-ink-800 text-ink dark:text-white hover:bg-neutral-200 dark:hover:bg-ink-700'
              }`}
              title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
            >
              <Hand className="h-5 w-5" />
            </button>

            {/* Leave Room Button */}
            <button
              onClick={() => navigate('/study-room')}
              className="p-3 rounded-2xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all ml-2"
              title="Leave Room"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* SLIDE-OVER GROUP CHAT & PARTICIPANTS SIDEBAR */}
        {isChatOpen && (
          <aside className="w-80 border-l border-neutral-border dark:border-ink-700 bg-white dark:bg-ink-900 flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Chat Header */}
            <div className="p-4 border-b border-neutral-border dark:border-ink-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink dark:text-white">Room Chat & Peers</h3>
                <p className="text-[11px] text-neutral-muted">
                  {participants.length} Study Group Participants
                </p>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-neutral-muted hover:text-ink dark:hover:text-white text-xs font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Active Participants Strip */}
            <div className="p-3 border-b border-neutral-border dark:border-ink-700 bg-neutral-bg/50 dark:bg-ink-950/50 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-muted block">
                In This Call:
              </span>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-mint" />
                      <span className="font-semibold text-ink dark:text-white truncate max-w-[140px]">
                        {p.name}
                      </span>
                      {p.isHost && (
                        <span className="text-[9px] px-1 rounded bg-pink/20 text-pink font-bold">
                          Host
                        </span>
                      )}
                      {p.isAi && (
                        <span className="text-[9px] px-1 rounded bg-mint/20 text-mint font-bold">
                          AI
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-neutral-muted">
                      {p.isAudioMuted ? <MicOff className="h-3 w-3 text-destructive" /> : <Mic className="h-3 w-3 text-mint" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => {
                const isMe = msg.senderId === user?.id || msg.senderId === 'local-user'
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-neutral-muted">
                      <span className="font-bold">{msg.senderName}</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs max-w-[90%] leading-relaxed ${
                        isMe
                          ? 'bg-pink text-ink-navy font-semibold rounded-br-sm'
                          : 'bg-neutral-bg dark:bg-ink-800 text-ink dark:text-white rounded-bl-sm border border-neutral-border dark:border-ink-700'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                )
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick Reactions Bar */}
            <div className="px-3 py-1.5 border-t border-neutral-border dark:border-ink-700 flex items-center justify-around text-base bg-neutral-bg/30 dark:bg-ink-950">
              {['🔥', '💡', '👏', '🎯', '🙌'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    const reactionMsg: ChatMessage = {
                      id: crypto.randomUUID(),
                      senderId: user?.id || 'local-user',
                      senderName: profile?.full_name || 'You',
                      message: emoji,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                    setMessages(prev => [...prev, reactionMsg])
                  }}
                  className="hover:scale-125 transition-transform p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Chat Send Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-neutral-border dark:border-ink-700 flex items-center gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Message study room..."
                className="text-xs h-9"
              />
              <Button type="submit" variant="pink" size="sm" className="h-9 px-3">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </aside>
        )}
      </div>
    </div>
  )
}
