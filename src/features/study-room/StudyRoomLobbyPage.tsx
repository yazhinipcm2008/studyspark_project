import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Code2,
  FileText,
  Plus,
  ArrowRight,
  Sparkles,
  KeyRound,
  BookOpen,
  Laptop,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { StudyRoom, CodeLanguage } from './types'

// Default mock/seed rooms if database has no active rooms
const DEFAULT_PRESET_ROOMS: StudyRoom[] = [
  {
    id: 'room-algo-101',
    room_code: 'ALGO-404',
    title: 'Algorithms & LeetCode Practice',
    topic: 'Two Pointers, Binary Search & Trees',
    code_language: 'python',
    code_content: `# Python LeetCode Practice
def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []

print("Two Sum Test:", two_sum([2, 7, 11, 15], 9))
`,
    notes_content: `# Algorithms Cram Notes
- Target: Master time complexity O(n) solutions
- Key Trick: Hash map lookup is O(1) average time
- Practice Problem 1: Invert Binary Tree
`,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    participants_count: 3
  },
  {
    id: 'room-webdev-202',
    room_code: 'DEV-882',
    title: 'Full-Stack Web Dev Sprint',
    topic: 'React, TypeScript & Async APIs',
    code_language: 'javascript',
    code_content: `// React State & Async Fetching Demo
async function fetchStudyData() {
  console.log("Connecting to peer study session...");
  const timestamp = new Date().toLocaleTimeString();
  return { status: "Active", time: timestamp };
}

fetchStudyData().then(data => console.log("Result:", data));
`,
    notes_content: `# Web Dev Notes
- React 19 Compiler handles auto-memoization
- Supabase Realtime Channels enable instant peer sync
- Always handle loading & error boundaries cleanly
`,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    participants_count: 2
  },
  {
    id: 'room-exam-prep-303',
    room_code: 'EXAM-990',
    title: 'Quiet Study & Shared Notes Room',
    topic: 'Final Exam Review & Definitions',
    code_language: 'javascript',
    code_content: `// Shared scratchpad for quick formulas & calculations
const calculateGrade = (score, total) => ((score / total) * 100).toFixed(1) + "%";
console.log("Goal Score:", calculateGrade(88, 100));
`,
    notes_content: `# Exam Review Checklist
1. Chapter 4: Core theorems & definitions
2. Chapter 5: Worked numerical examples
3. Shared Flashcards: Review top 20 difficult terms before 10 PM
`,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    participants_count: 4
  }
]

export const StudyRoomLobbyPage: React.FC = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [rooms, setRooms] = useState<StudyRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Join Room by Code
  const [joinCodeInput, setJoinCodeInput] = useState('')

  // Create Room Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [newLanguage, setNewLanguage] = useState<CodeLanguage>('javascript')
  const [isCreating, setIsCreating] = useState(false)

  // Hardware Device Preview (Webcam & Mic)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const [isPreviewCameraOn, setIsPreviewCameraOn] = useState(false)
  const [isPreviewMicOn, setIsPreviewMicOn] = useState(false)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)

  // Load Rooms from Supabase or localStorage
  const loadRooms = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('study_rooms')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        setRooms(data as StudyRoom[])
      } else {
        // Fallback to local / default rooms
        const savedRooms = localStorage.getItem('studyspark_rooms')
        if (savedRooms) {
          const parsed = JSON.parse(savedRooms)
          setRooms([...parsed, ...DEFAULT_PRESET_ROOMS])
        } else {
          setRooms(DEFAULT_PRESET_ROOMS)
        }
      }
    } catch {
      setRooms(DEFAULT_PRESET_ROOMS)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRooms()
  }, [])

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [previewStream])

  // Toggle Camera in preview
  const togglePreviewCamera = async () => {
    if (isPreviewCameraOn) {
      if (previewStream) {
        previewStream.getVideoTracks().forEach(t => t.stop())
      }
      setIsPreviewCameraOn(false)
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: isPreviewMicOn
        })
        setPreviewStream(stream)
        setIsPreviewCameraOn(true)
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream
        }
        toast.success('Camera connected!')
      } catch (err: any) {
        toast.error('Could not access camera: ' + (err.message || 'Permission denied'))
      }
    }
  }

  // Toggle Mic in preview
  const togglePreviewMic = async () => {
    if (isPreviewMicOn) {
      if (previewStream) {
        previewStream.getAudioTracks().forEach(t => t.stop())
      }
      setIsPreviewMicOn(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isPreviewCameraOn
        })
        setPreviewStream(stream)
        setIsPreviewMicOn(true)
        toast.success('Microphone connected!')
      } catch (err: any) {
        toast.error('Could not access mic: ' + (err.message || 'Permission denied'))
      }
    }
  }

  // Handle Joining with Code
  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = joinCodeInput.trim().toUpperCase()
    if (!cleanCode) {
      toast.error('Please enter a room code')
      return
    }

    // Pass initial media preference
    navigate(`/study-room/${cleanCode}`, {
      state: {
        cameraOn: isPreviewCameraOn,
        micOn: isPreviewMicOn
      }
    })
  }

  // Handle Creating Room
  const handleCreateRoom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!newTitle.trim()) {
      toast.error('Please enter a room title')
      return
    }

    setIsCreating(true)
    const randomCode = 'SPARK-' + Math.floor(100 + Math.random() * 900)
    const newRoom: StudyRoom = {
      id: crypto.randomUUID(),
      room_code: randomCode,
      title: newTitle.trim(),
      topic: newTopic.trim() || 'General Study & Code Collaboration',
      created_by: user?.id || null,
      is_active: true,
      code_language: newLanguage,
      code_content: newLanguage === 'python'
        ? `# ${newTitle.trim()}\n# Topic: ${newTopic.trim() || 'General'}\n\ndef solve():\n    print("Hello from ${newTitle.trim()}!")\n\nsolve()\n`
        : `// ${newTitle.trim()}\n// Topic: ${newTopic.trim() || 'General'}\n\nconsole.log("Welcome to ${newTitle.trim()}!");\n`,
      notes_content: `# ${newTitle.trim()}\n\n**Topic:** ${newTopic.trim() || 'General'}\n**Host:** ${profile?.full_name || 'Student'}\n\n## 📝 Agenda & Notes\n- \n\n## 💡 Key Questions\n- \n`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      participants_count: 1
    }

    try {
      // Attempt Supabase insert
      await supabase.from('study_rooms').insert({
        id: newRoom.id,
        room_code: newRoom.room_code,
        title: newRoom.title,
        topic: newRoom.topic,
        created_by: user?.id,
        code_language: newRoom.code_language,
        code_content: newRoom.code_content,
        notes_content: newRoom.notes_content
      })
    } catch {
      // LocalStorage fallback
      const current = JSON.parse(localStorage.getItem('studyspark_rooms') || '[]')
      localStorage.setItem('studyspark_rooms', JSON.stringify([newRoom, ...current]))
    }

    setIsCreating(false)
    setIsCreateOpen(false)
    toast.success(`Study Room created! Code: ${newRoom.room_code}`)

    navigate(`/study-room/${newRoom.room_code}`, {
      state: {
        cameraOn: isPreviewCameraOn,
        micOn: isPreviewMicOn,
        roomData: newRoom
      }
    })
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Banner / Hero Card */}
      <div className="rounded-3xl p-6 sm:p-8 bg-pink text-ink-navy shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-navy/10 backdrop-blur-md text-xs font-bold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5" /> Collaborative Study Workspace
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Study Rooms & Live Pair Coding
          </h1>
          <p className="text-ink-navy/85 text-sm sm:text-base leading-relaxed">
            Collaborate with peers in real-time. Join live video calls, execute code together in a multi-language sandbox, and edit synchronized study notes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 z-10 flex-shrink-0">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-ink-navy text-white hover:bg-ink-navy/90 font-bold shadow-md"
            size="lg"
          >
            <Plus className="h-5 w-5 mr-2 text-pink" /> Create Room
          </Button>
        </div>

        {/* Ambient Glow */}
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-white/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Grid: Join by Code & Device Setup Check */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Join with Room Code */}
        <Card className="md:col-span-1 flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-pink" />
              <CardTitle className="text-base">Join with Code</CardTitle>
            </div>
            <CardDescription>
              Have a code from a classmate or study group? Enter it below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinByCode} className="space-y-3">
              <Input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. SPARK-482"
                className="font-mono text-center tracking-wider text-base uppercase"
              />
              <Button type="submit" variant="pink" className="w-full">
                Join Study Room <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Card 2 & 3: Audio & Video Pre-flight Check */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-pink" />
                <CardTitle className="text-base">Camera & Microphone Preview</CardTitle>
              </div>
              <span className="text-xs text-neutral-muted">Pre-flight device check</span>
            </div>
            <CardDescription>
              Test your camera and audio before jumping into the live study room.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Video Window Preview */}
              <div className="w-full sm:w-64 h-36 rounded-2xl bg-ink-950 border border-neutral-border dark:border-neutral-border relative overflow-hidden flex items-center justify-center flex-shrink-0">
                {isPreviewCameraOn ? (
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-3 text-neutral-muted">
                    <VideoOff className="h-6 w-6 mb-1 opacity-50" />
                    <span className="text-[11px]">Camera is off</span>
                  </div>
                )}

                {/* Status Badges */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isPreviewCameraOn ? 'bg-mint' : 'bg-neutral-muted'
                    }`}
                  />
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isPreviewMicOn ? 'bg-sun' : 'bg-neutral-muted'
                    }`}
                  />
                </div>
              </div>

              {/* Controls & Quick Tips */}
              <div className="flex-1 space-y-3 w-full">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={togglePreviewCamera}
                    className={`flex-1 ${isPreviewCameraOn ? 'border-pink text-pink' : ''}`}
                  >
                    {isPreviewCameraOn ? <Video className="h-4 w-4 mr-1.5 text-pink" /> : <VideoOff className="h-4 w-4 mr-1.5" />}
                    {isPreviewCameraOn ? 'Camera On' : 'Turn On Cam'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={togglePreviewMic}
                    className={`flex-1 ${isPreviewMicOn ? 'border-sun text-sun-700 dark:text-sun' : ''}`}
                  >
                    {isPreviewMicOn ? <Mic className="h-4 w-4 mr-1.5 text-sun-600 dark:text-sun" /> : <MicOff className="h-4 w-4 mr-1.5" />}
                    {isPreviewMicOn ? 'Mic Unmuted' : 'Unmute Mic'}
                  </Button>
                </div>

                <div className="text-[11px] text-neutral-muted space-y-1">
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-mint" />
                    Your settings carry over into the room automatically.
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Laptop className="h-3.5 w-3.5 text-pink" />
                    Screen sharing and interactive code execution available in-room.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Study Rooms Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-pink" />
              Available Study Rooms
            </h2>
            <p className="text-xs text-neutral-muted mt-0.5">
              Jump into an active collaborative session or start practicing
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-100/60 dark:bg-pink-950/60 text-pink-700 dark:text-pink">
            {rooms.length} Active {rooms.length === 1 ? 'Room' : 'Rooms'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {rooms.map(room => (
            <Card
              key={room.id}
              className="flex flex-col justify-between hover:border-pink transition-all duration-200 group relative overflow-hidden"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border text-pink">
                    {room.room_code}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-mint font-semibold">
                    <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                    <span>Live</span>
                  </div>
                </div>

                <CardTitle className="text-base group-hover:text-pink transition-colors">
                  {room.title}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {room.topic || 'General Collaborative Study'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Features Pills */}
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-pink-100/60 dark:bg-pink-950/60 text-pink-700 dark:text-pink font-semibold flex items-center gap-1">
                    <Video className="h-3 w-3" /> Video Call
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100/60 dark:bg-blue-950/60 text-blue font-semibold flex items-center gap-1 uppercase">
                    <Code2 className="h-3 w-3" /> {room.code_language}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-950/60 text-sky font-semibold flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Shared Notes
                  </span>
                </div>

                <Button
                  onClick={() =>
                    navigate(`/study-room/${room.room_code}`, {
                      state: {
                        cameraOn: isPreviewCameraOn,
                        micOn: isPreviewMicOn,
                        roomData: room
                      }
                    })
                  }
                  variant="pink"
                  className="w-full text-xs font-bold"
                >
                  Enter Room <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Room Modal */}
      <Dialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create a Collaborative Study Room"
        description="Launch an instant workspace for video calling, live coding, and shared study notes."
        confirmText="Launch Room"
        confirmVariant="pink"
        onConfirm={() => handleCreateRoom()}
        isConfirmLoading={isCreating}
      >
        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label className="text-xs font-semibold block mb-1">Room Title</label>
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. CS106B Midterm Prep or LeetCode Cram"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Study Topic / Subject</label>
            <Input
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              placeholder="e.g. Graphs, Dynamic Programming, SQL Queries"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">Primary Coding Language</label>
            <select
              value={newLanguage}
              onChange={e => setNewLanguage(e.target.value as CodeLanguage)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-border dark:border-neutral-border bg-white dark:bg-surface text-ink dark:text-white"
            >
              <option value="javascript">JavaScript (Node / Web Sandbox)</option>
              <option value="python">Python 3 (Standard Library)</option>
              <option value="typescript">TypeScript</option>
              <option value="html">HTML5 & CSS3 Live Preview</option>
              <option value="sql">SQL Query Runner</option>
            </select>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
