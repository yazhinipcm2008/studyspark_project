import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Upload,
  FileText,
  FileCheck,
  AlertCircle,
  Trash2,
  Edit2,
  ExternalLink,
  Brain,
  Layers,
  Bot,
  Plus,
  Eye,
  CheckCircle,
  Headphones,
  Video,
  Mic,
  Sparkles,
  ArrowRight,
  Clock,
} from 'lucide-react'
import confetti from 'canvas-confetti'

const YoutubeIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
)
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { validateStudyFile, extractTextFromFile } from '@/lib/extractors'
import {
  cleanAndStructureYouTubeTranscript,
  processAudioOrVideoFile
} from '@/lib/mediaLectureProcessor'
import { generateQuizLocally, generateFlashcardsLocally } from '@/lib/aiFallback'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Material } from '@/types/database'

export const MaterialsPage: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const targetMaterialId = searchParams.get('id') || searchParams.get('materialId')
  const highlightParam = searchParams.get('highlight') || searchParams.get('passage')

  const [materials, setMaterials] = useState<Material[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [activeUploadMode, setActiveUploadMode] = useState<'file' | 'media' | 'youtube' | 'paste'>('file')
  const [autoGenerateStudyTools, setAutoGenerateStudyTools] = useState(true)

  // Document file upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Media file upload state
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null)
  const [mediaTitle, setMediaTitle] = useState('')
  const [mediaSubject, setMediaSubject] = useState('')

  // YouTube transcript state
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeTitle, setYoutubeTitle] = useState('')
  const [youtubeSubject, setYoutubeSubject] = useState('')
  const [youtubeTranscript, setYoutubeTranscript] = useState('')

  // Generated study tools completion modal
  const [generationResultModal, setGenerationResultModal] = useState<{
    material: Material
    quizId?: string
    flashcardSetId?: string
  } | null>(null)

  // Raw pasted notes state
  const [pastedTitle, setPastedTitle] = useState('')
  const [pastedSubject, setPastedSubject] = useState('')
  const [pastedContent, setPastedContent] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadStep, setUploadStep] = useState<string>('')

  // Preview modal & highlight
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null)
  const [signedFileUrl, setSignedFileUrl] = useState<string | null>(null)
  const [highlightQuery, setHighlightQuery] = useState(highlightParam || '')
  const highlightRef = useRef<HTMLElement>(null)

  // Rename modal
  const [materialToRename, setMaterialToRename] = useState<Material | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)

  // Delete modal
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadMaterials = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setMaterials(data || [])
    } catch (err: any) {
      console.error('Error loading materials:', err)
      toast.error('Failed to load study materials')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMaterials()
  }, [user])

  useEffect(() => {
    if (targetMaterialId && materials.length > 0) {
      const found = materials.find(m => m.id === targetMaterialId)
      if (found) {
        setPreviewMaterial(found)
        if (highlightParam) {
          setHighlightQuery(highlightParam)
        }
      }
    }
  }, [targetMaterialId, highlightParam, materials])

  useEffect(() => {
    if (previewMaterial && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [previewMaterial, highlightQuery])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const validation = validateStudyFile(file)
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid file')
        e.target.value = ''
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
    }
  }

  // Auto-generate quiz & flashcards helper
  const generateStudyToolsForMaterial = async (newRow: Material) => {
    if (!user || !autoGenerateStudyTools) return

    let quizId: string | undefined
    let flashcardSetId: string | undefined

    try {
      setUploadStep('Generating active recall flashcard deck...')
      const deck = await generateFlashcardsLocally({
        userId: user.id,
        materialId: newRow.id,
        rawText: newRow.extracted_text || '',
        title: `Flashcards: ${newRow.title}`,
        subject: newRow.subject || 'General Studies',
        count: 8,
      })
      flashcardSetId = deck?.set_id
    } catch (deckErr) {
      console.warn('Auto flashcard generation warning:', deckErr)
    }

    try {
      setUploadStep('Generating practice quiz...')
      const quiz = await generateQuizLocally({
        userId: user.id,
        materialId: newRow.id,
        rawText: newRow.extracted_text || '',
        title: `Quiz: ${newRow.title}`,
        subject: newRow.subject || 'General Studies',
        numQuestions: 5,
      })
      quizId = quiz?.quiz_id
    } catch (quizErr) {
      console.warn('Auto quiz generation warning:', quizErr)
    }

    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
    })

    setGenerationResultModal({
      material: newRow,
      quizId,
      flashcardSetId,
    })
  }

  const handleUploadFile = async () => {
    if (!user || !selectedFile) return
    setIsProcessing(true)

    try {
      setUploadStep('Extracting text content in browser...')
      const extraction = await extractTextFromFile(selectedFile)

      setUploadStep('Creating material entry in database...')
      const title = selectedFile.name.replace(/\.[^/.]+$/, '')
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase()

      // Insert material row in 'uploading' status
      const { data: newRow, error: insertErr } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title,
          source_type: 'file',
          file_name: selectedFile.name,
          file_type: fileExt,
          file_size: selectedFile.size,
          extracted_text: extraction.text,
          text_length: extraction.characterCount,
          status: 'uploading',
          subject: 'General',
        })
        .select()
        .single()

      if (insertErr || !newRow) {
        throw new Error(`Failed to save material record: ${insertErr?.message}`)
      }

      setUploadStep('Uploading file to private storage...')
      const storagePath = `${user.id}/${newRow.id}/${selectedFile.name}`
      const { error: storageErr } = await supabase.storage
        .from('study-materials')
        .upload(storagePath, selectedFile)

      if (storageErr) {
        console.warn('Storage upload warning:', storageErr)
      }

      // Update to ready
      await supabase
        .from('materials')
        .update({
          file_path: storagePath,
          status: 'ready',
        })
        .eq('id', newRow.id)

      toast.success(`"${selectedFile.name}" processed successfully!`)
      setIsUploadModalOpen(false)
      setSelectedFile(null)
      loadMaterials()

      if (autoGenerateStudyTools) {
        await generateStudyToolsForMaterial(newRow)
      }
    } catch (err: any) {
      console.error('File processing error:', err)
      toast.error(err.message || 'Failed to process document')
    } finally {
      setIsProcessing(false)
      setUploadStep('')
    }
  }

  // Upload lecture recording (Audio/Video)
  const handleUploadMediaFile = async () => {
    if (!user || !selectedMediaFile) return
    setIsProcessing(true)

    try {
      setUploadStep('Transcribing lecture recording...')
      const lecture = await processAudioOrVideoFile(
        selectedMediaFile,
        mediaTitle,
        mediaSubject
      )

      setUploadStep('Saving structured lecture notes...')
      const isVideo = Boolean(selectedMediaFile.name.match(/\.(mp4|webm|mov|mkv)$/i))
      const fileExt = selectedMediaFile.name.split('.').pop()?.toLowerCase()

      const { data: newRow, error: insertErr } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title: lecture.title,
          source_type: isVideo ? 'video' : 'audio',
          file_name: selectedMediaFile.name,
          file_type: fileExt,
          file_size: selectedMediaFile.size,
          extracted_text: lecture.formattedText,
          text_length: lecture.characterCount,
          status: 'ready',
          subject: lecture.subject,
        })
        .select()
        .single()

      if (insertErr || !newRow) {
        throw new Error(`Failed to save lecture notes: ${insertErr?.message}`)
      }

      // Background upload to storage if bucket available
      try {
        const storagePath = `${user.id}/${newRow.id}/${selectedMediaFile.name}`
        await supabase.storage.from('study-materials').upload(storagePath, selectedMediaFile)
        await supabase.from('materials').update({ file_path: storagePath }).eq('id', newRow.id)
      } catch (storageErr) {
        console.warn('Storage upload note:', storageErr)
      }

      toast.success(`Lecture "${lecture.title}" transcribed into notes!`)
      setIsUploadModalOpen(false)
      setSelectedMediaFile(null)
      setMediaTitle('')
      setMediaSubject('')
      loadMaterials()

      if (autoGenerateStudyTools) {
        await generateStudyToolsForMaterial(newRow)
      }
    } catch (err: any) {
      console.error('Media processing error:', err)
      toast.error(err.message || 'Failed to process lecture media')
    } finally {
      setIsProcessing(false)
      setUploadStep('')
    }
  }

  // Process YouTube video transcript
  const handleProcessYouTubeTranscript = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!youtubeTranscript || youtubeTranscript.trim().length < 20) {
      toast.error('Please paste at least 20 characters of YouTube transcript content.')
      return
    }

    setIsProcessing(true)
    try {
      setUploadStep('Structuring YouTube transcript & key definitions...')
      const lecture = cleanAndStructureYouTubeTranscript(
        youtubeTranscript,
        youtubeTitle || youtubeUrl,
        youtubeSubject
      )

      setUploadStep('Saving lecture notes...')
      const { data: newRow, error: insertErr } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title: lecture.title,
          source_type: 'youtube',
          extracted_text: lecture.formattedText,
          text_length: lecture.characterCount,
          status: 'ready',
          subject: lecture.subject,
        })
        .select()
        .single()

      if (insertErr || !newRow) {
        throw new Error(`Failed to save YouTube notes: ${insertErr?.message}`)
      }

      toast.success(`YouTube lecture notes created for "${lecture.title}"!`)
      setIsUploadModalOpen(false)
      setYoutubeUrl('')
      setYoutubeTitle('')
      setYoutubeSubject('')
      setYoutubeTranscript('')
      loadMaterials()

      if (autoGenerateStudyTools) {
        await generateStudyToolsForMaterial(newRow)
      }
    } catch (err: any) {
      console.error('YouTube transcript error:', err)
      toast.error(err.message || 'Failed to process YouTube transcript')
    } finally {
      setIsProcessing(false)
      setUploadStep('')
    }
  }

  const handlePasteNotes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!pastedContent || pastedContent.trim().length < 30) {
      toast.error('Please enter at least 30 characters of study notes.')
      return
    }

    setIsProcessing(true)
    setUploadStep('Saving pasted notes...')

    try {
      const { data: newRow, error } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          title: pastedTitle.trim() || 'Pasted Notes',
          source_type: 'paste',
          extracted_text: pastedContent.trim(),
          text_length: pastedContent.trim().length,
          status: 'ready',
          subject: pastedSubject.trim() || 'General',
        })
        .select()
        .single()

      if (error || !newRow) throw error

      toast.success('Notes saved successfully!')
      setIsUploadModalOpen(false)
      setPastedTitle('')
      setPastedSubject('')
      setPastedContent('')
      loadMaterials()

      if (autoGenerateStudyTools) {
        await generateStudyToolsForMaterial(newRow)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes')
    } finally {
      setIsProcessing(false)
      setUploadStep('')
    }
  }

  const openPreview = async (mat: Material) => {
    setPreviewMaterial(mat)
    setSignedFileUrl(null)

    if (mat.file_path) {
      try {
        const { data } = await supabase.storage
          .from('study-materials')
          .createSignedUrl(mat.file_path, 3600) // 1 hr signed preview
        if (data?.signedUrl) {
          setSignedFileUrl(data.signedUrl)
        }
      } catch (e) {
        console.error('Signed URL error:', e)
      }
    }
  }

  const handleRename = async () => {
    if (!materialToRename || !newTitle.trim()) return
    setIsRenaming(true)

    try {
      const { error } = await supabase
        .from('materials')
        .update({ title: newTitle.trim() })
        .eq('id', materialToRename.id)

      if (error) throw error

      toast.success('Material renamed successfully')
      setMaterialToRename(null)
      loadMaterials()
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async () => {
    if (!materialToDelete) return
    setIsDeleting(true)

    try {
      if (materialToDelete.file_path) {
        await supabase.storage.from('study-materials').remove([materialToDelete.file_path])
      }

      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialToDelete.id)

      if (error) throw error

      toast.success('Material deleted')
      setMaterialToDelete(null)
      loadMaterials()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete material')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink dark:text-white">
            Study Materials
          </h1>
          <p className="text-sm text-neutral-muted dark:text-neutral-300 mt-1">
            Upload lecture audio/video, YouTube transcripts, documents, or notes to power AI quizzes and flashcards.
          </p>
        </div>
        <Button variant="sky" onClick={() => setIsUploadModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Material
        </Button>
      </div>

      {/* Materials List */}
      <Card className="border-t-2 border-t-sky shadow-soft">
        <CardHeader>
          <CardTitle>Study Materials & Lectures ({materials.length})</CardTitle>
          <CardDescription>
            Supported sources: Audio & video recordings (.mp3, .wav, .m4a, .mp4, .webm), YouTube transcripts, PDF, DOCX, TXT, and raw notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="h-14 w-14 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 mx-auto flex items-center justify-center mb-3">
                <FileText className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-ink dark:text-white">No materials uploaded yet</h3>
              <p className="text-xs text-neutral-muted mt-1 max-w-sm mx-auto">
                Add lecture audio/video, paste YouTube transcripts, or upload documents to generate tailored quizzes and flashcards.
              </p>
              <Button
                variant="sky"
                size="sm"
                className="mt-5"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1.5" /> Add Your First Material
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-border dark:divide-neutral-800">
              {materials.map(mat => (
                <div
                  key={mat.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        mat.source_type === 'youtube'
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-500'
                          : mat.source_type === 'audio'
                          ? 'bg-coral-50 dark:bg-coral-950/60 text-coral'
                          : mat.source_type === 'video'
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-sky'
                          : mat.source_type === 'paste'
                          ? 'bg-sun-50 dark:bg-sun-950/60 text-sun-700 dark:text-sun-400'
                          : 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      {mat.source_type === 'youtube' ? (
                        <YoutubeIcon className="h-5 w-5" />
                      ) : mat.source_type === 'audio' ? (
                        <Headphones className="h-5 w-5" />
                      ) : mat.source_type === 'video' ? (
                        <Video className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4
                          className="text-sm font-bold text-ink dark:text-white hover:text-sky transition-colors cursor-pointer"
                          onClick={() => openPreview(mat)}
                        >
                          {mat.title}
                        </h4>
                        <Badge
                          variant={
                            mat.status === 'ready'
                              ? 'easy'
                              : mat.status === 'failed'
                              ? 'hard'
                              : 'medium'
                          }
                        >
                          {mat.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-neutral-muted">
                        <span className="font-semibold text-ink dark:text-neutral-300">
                          {mat.subject || 'General'}
                        </span>
                        <span>•</span>
                        <span className="capitalize">
                          {mat.source_type === 'youtube'
                            ? 'YouTube Lecture'
                            : mat.source_type === 'audio'
                            ? 'Audio Recording'
                            : mat.source_type === 'video'
                            ? 'Video Lecture'
                            : mat.source_type === 'file'
                            ? (mat.file_type || 'Document').toUpperCase()
                            : 'Pasted Notes'}
                        </span>
                        <span>•</span>
                        <span>{(mat.text_length || 0).toLocaleString()} chars</span>
                        <span>•</span>
                        <span>{formatDate(mat.created_at)}</span>
                      </div>

                      {mat.error_message && (
                        <p className="mt-1 text-xs text-destructive font-medium flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" /> {mat.error_message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & "Use for" buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {mat.status === 'ready' && (
                      <>
                        <Button
                          variant="blue"
                          size="sm"
                          onClick={() => navigate(`/quizzes?materialId=${mat.id}`)}
                          className="font-bold shadow-sm"
                          title="Generate Quiz from this material"
                        >
                          <Brain className="h-3.5 w-3.5 mr-1 text-white" /> Quiz
                        </Button>
                        <Button
                          variant="coral"
                          size="sm"
                          onClick={() => navigate(`/flashcards?materialId=${mat.id}`)}
                          className="font-bold shadow-sm text-ink-navy"
                          title="Generate Flashcards from this material"
                        >
                          <Layers className="h-3.5 w-3.5 mr-1 text-ink-navy" /> Flashcards
                        </Button>
                        <Button
                          variant="violet"
                          size="sm"
                          onClick={() => navigate(`/assistant?materialId=${mat.id}`)}
                          className="font-bold shadow-sm text-white"
                          title="Ask AI Assistant about this material"
                        >
                          <Bot className="h-3.5 w-3.5 mr-1 text-white" /> Ask AI
                        </Button>
                      </>
                    )}

                    <Button
                      variant="sky-subtle"
                      size="sm"
                      onClick={() => openPreview(mat)}
                      className="h-8 px-2.5 text-xs font-bold"
                      title="Preview content"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                    <Button
                      variant="sun-subtle"
                      size="sm"
                      onClick={() => {
                        setMaterialToRename(mat)
                        setNewTitle(mat.title)
                      }}
                      className="h-8 px-2.5 text-xs font-bold"
                      title="Rename"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Rename
                    </Button>
                    <Button
                      variant="coral-subtle"
                      size="sm"
                      onClick={() => setMaterialToDelete(mat)}
                      className="h-8 px-2.5 text-xs font-bold"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Dialog
        open={isUploadModalOpen}
        onClose={() => !isProcessing && setIsUploadModalOpen(false)}
        title="Add Study Material"
        description="Upload lecture audio/video recordings, paste YouTube transcripts, or import documents."
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-neutral-bg dark:bg-surface border border-neutral-border dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveUploadMode('media')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeUploadMode === 'media'
                  ? 'bg-sky text-ink-navy shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <Headphones className="h-3.5 w-3.5" />
              <span>Audio/Video</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveUploadMode('youtube')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeUploadMode === 'youtube'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <YoutubeIcon className="h-3.5 w-3.5" />
              <span>YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveUploadMode('file')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeUploadMode === 'file'
                  ? 'bg-sky text-ink-navy shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Documents</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveUploadMode('paste')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeUploadMode === 'paste'
                  ? 'bg-sky text-ink-navy shadow-sm'
                  : 'text-neutral-muted hover:text-ink dark:hover:text-white'
              }`}
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Paste Notes</span>
            </button>
          </div>

          {/* Auto-generate study tools toggle */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60">
            <input
              type="checkbox"
              id="auto-gen-tools-toggle"
              checked={autoGenerateStudyTools}
              onChange={e => setAutoGenerateStudyTools(e.target.checked)}
              className="h-4 w-4 rounded accent-sky cursor-pointer"
            />
            <label
              htmlFor="auto-gen-tools-toggle"
              className="text-xs font-medium text-ink dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer select-none"
            >
              <Sparkles className="h-3.5 w-3.5 text-sun animate-pulse" />
              <span>Automatically generate practice quiz & flashcard deck</span>
            </label>
          </div>

          {/* Active Mode Form */}
          {activeUploadMode === 'media' && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-neutral-border dark:border-neutral-800 rounded-2xl p-6 text-center hover:border-sky-400 transition-colors bg-neutral-bg/50 dark:bg-surface/40">
                <input
                  type="file"
                  id="media-file-input"
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.webm,.mp4"
                  onChange={e => {
                    const file = e.target.files?.[0] || null
                    setSelectedMediaFile(file)
                    if (file && !mediaTitle) {
                      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
                      setMediaTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1))
                    }
                  }}
                  className="hidden"
                  disabled={isProcessing}
                />
                <label
                  htmlFor="media-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <div className="h-12 w-12 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center mb-2">
                    <Headphones className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-ink dark:text-white">
                    {selectedMediaFile ? selectedMediaFile.name : 'Click to select audio or video lecture'}
                  </p>
                  <p className="text-xs text-neutral-muted mt-1">
                    MP3, WAV, M4A, OGG, WEBM, MP4 (Max 50 MB)
                  </p>
                  {selectedMediaFile && (
                    <span className="mt-2 text-[11px] font-semibold text-sky">
                      {(selectedMediaFile.size / (1024 * 1024)).toFixed(1)} MB selected
                    </span>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                    Lecture Title
                  </label>
                  <Input
                    placeholder="e.g. CS50 Lecture 3: Algorithms"
                    value={mediaTitle}
                    onChange={e => setMediaTitle(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                    Subject / Course
                  </label>
                  <Input
                    placeholder="e.g. Computer Science"
                    value={mediaSubject}
                    onChange={e => setMediaSubject(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
              </div>

              <p className="text-[11px] text-neutral-muted">
                StudySpark transcribes your lecture recording, detects topic changes, creates definitions, and builds matching flashcards and quiz questions.
              </p>

              {isProcessing && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl text-xs text-sky-800 dark:text-sky-300 flex items-center gap-2">
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-sky border-t-transparent rounded-full" />
                  <span>{uploadStep || 'Transcribing lecture...'}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="sky"
                  size="sm"
                  disabled={!selectedMediaFile || isProcessing}
                  isLoading={isProcessing}
                  onClick={handleUploadMediaFile}
                >
                  <Headphones className="h-3.5 w-3.5 mr-1.5" /> Transcribe & Generate
                </Button>
              </div>
            </div>
          )}

          {activeUploadMode === 'youtube' && (
            <form onSubmit={handleProcessYouTubeTranscript} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                    YouTube Video URL or Title
                  </label>
                  <Input
                    placeholder="https://youtube.com/watch?v=... or title"
                    value={youtubeUrl}
                    onChange={e => {
                      setYoutubeUrl(e.target.value)
                      if (!youtubeTitle && e.target.value) {
                        setYoutubeTitle(e.target.value)
                      }
                    }}
                    disabled={isProcessing}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                    Subject
                  </label>
                  <Input
                    placeholder="e.g. World History"
                    value={youtubeSubject}
                    onChange={e => setYoutubeSubject(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-ink dark:text-neutral-200">
                    Paste Transcript or Captions
                  </label>
                  <span className="text-[11px] text-neutral-muted">
                    Supports [00:00] timestamps
                  </span>
                </div>
                <textarea
                  required
                  rows={6}
                  placeholder={`Paste video transcript here...\n\nTip: On YouTube, click "... More" below the video description -> "Show transcript" -> highlight, copy, and paste here. Timestamps like [01:23] are preserved and grouped into lecture topics!`}
                  value={youtubeTranscript}
                  onChange={e => setYoutubeTranscript(e.target.value)}
                  disabled={isProcessing}
                  className="w-full rounded-xl border border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated p-3 text-xs text-ink dark:text-white font-mono focus:outline-none focus:border-sky leading-relaxed"
                />
              </div>

              {isProcessing && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-sky border-t-transparent rounded-full" />
                  <span>{uploadStep || 'Structuring transcript...'}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="sky"
                  size="sm"
                  type="submit"
                  disabled={!youtubeTranscript.trim() || isProcessing}
                  isLoading={isProcessing}
                >
                  <YoutubeIcon className="h-3.5 w-3.5 mr-1.5" /> Convert into Notes & Cards
                </Button>
              </div>
            </form>
          )}

          {activeUploadMode === 'file' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-neutral-border dark:border-neutral-border rounded-2xl p-6 text-center hover:border-sky transition-colors">
                <input
                  type="file"
                  id="study-file-input"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isProcessing}
                />
                <label
                  htmlFor="study-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-10 w-10 text-sky mb-2" />
                  <p className="text-sm font-bold text-ink dark:text-white">
                    {selectedFile ? selectedFile.name : 'Click to select document'}
                  </p>
                  <p className="text-xs text-neutral-muted mt-1">
                    PDF (text-based), DOCX, TXT, or MD (Max 25 MB)
                  </p>
                </label>
              </div>

              {isProcessing && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-sky border-t-transparent rounded-full" />
                  <span>{uploadStep || 'Processing document...'}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="sky"
                  size="sm"
                  disabled={!selectedFile || isProcessing}
                  isLoading={isProcessing}
                  onClick={handleUploadFile}
                >
                  Extract & Save Document
                </Button>
              </div>
            </div>
          )}

          {activeUploadMode === 'paste' && (
            <form onSubmit={handlePasteNotes} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Title
                </label>
                <Input
                  required
                  placeholder="e.g. Chapter 4 Cellular Respiration Notes"
                  value={pastedTitle}
                  onChange={e => setPastedTitle(e.target.value)}
                  disabled={isProcessing}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Subject
                </label>
                <Input
                  placeholder="e.g. Biology 101"
                  value={pastedSubject}
                  onChange={e => setPastedSubject(e.target.value)}
                  disabled={isProcessing}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink dark:text-neutral-200 block mb-1">
                  Notes Content
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Paste lecture notes or chapter summary here..."
                  value={pastedContent}
                  onChange={e => setPastedContent(e.target.value)}
                  disabled={isProcessing}
                  className="w-full rounded-xl border border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated p-3 text-sm text-ink dark:text-white focus:outline-none focus:border-sky"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="sky" size="sm" type="submit" isLoading={isProcessing}>
                  Save Notes
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>

      {/* Preview Modal */}
      <Dialog
        open={Boolean(previewMaterial)}
        onClose={() => setPreviewMaterial(null)}
        title={previewMaterial?.title || 'Material Preview'}
        description={`Subject: ${previewMaterial?.subject || 'General'} • Length: ${(previewMaterial?.text_length || 0).toLocaleString()} characters`}
      >
        <div className="space-y-4">
          {signedFileUrl && (
            <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl">
              <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
                Original file stored in private storage
              </span>
              <a
                href={signedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs font-bold text-sky hover:underline"
              >
                Download Original <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
                Extracted Text Preview
              </h4>
              {highlightQuery && (
                <span className="text-[10px] text-sky font-bold">
                  ● Source Passage Highlighted
                </span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto p-4 rounded-xl bg-neutral-bg dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border text-xs text-ink dark:text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed select-text">
              {(() => {
                const text = previewMaterial?.extracted_text || 'No text extracted.'
                if (!highlightQuery || !highlightQuery.trim()) {
                  return text
                }

                const clean = highlightQuery.trim()
                const lowerText = text.toLowerCase()
                const matchIdx = lowerText.indexOf(clean.toLowerCase())

                if (matchIdx === -1) {
                  const short = clean.slice(0, 30).toLowerCase()
                  const prefixIdx = lowerText.indexOf(short)
                  if (prefixIdx !== -1) {
                    return (
                      <>
                        {text.slice(0, prefixIdx)}
                        <mark
                          ref={highlightRef}
                          className="bg-sky-200/90 dark:bg-sky-900/70 text-ink dark:text-white border-b-2 border-sky font-bold px-1.5 py-0.5 rounded inline"
                        >
                          {text.slice(prefixIdx, prefixIdx + clean.length)}
                        </mark>
                        {text.slice(prefixIdx + clean.length)}
                      </>
                    )
                  }
                  return text
                }

                return (
                  <>
                    {text.slice(0, matchIdx)}
                    <mark
                      ref={highlightRef}
                      className="bg-sky-200/90 dark:bg-sky-900/70 text-ink dark:text-white border-b-2 border-sky font-bold px-1.5 py-0.5 rounded inline animate-pulse"
                    >
                      {text.slice(matchIdx, matchIdx + clean.length)}
                    </mark>
                    {text.slice(matchIdx + clean.length)}
                  </>
                )
              })()}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewMaterial(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Rename Modal */}
      <Dialog
        open={Boolean(materialToRename)}
        onClose={() => setMaterialToRename(null)}
        title="Rename Material"
        confirmText="Save Name"
        confirmVariant="primary"
        onConfirm={handleRename}
        isConfirmLoading={isRenaming}
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold block">New Title</label>
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Material title"
          />
        </div>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(materialToDelete)}
        onClose={() => setMaterialToDelete(null)}
        title="Delete Material"
        description={`Are you sure you want to permanently delete "${materialToDelete?.title}"? This will also remove the private file from storage.`}
        confirmText="Delete Permanently"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        isConfirmLoading={isDeleting}
      />

      {/* Study Tools Generated Modal */}
      <Dialog
        open={Boolean(generationResultModal)}
        onClose={() => setGenerationResultModal(null)}
        title="✨ Study Tools Generated!"
        description={`Your lecture source "${generationResultModal?.material.title}" was processed into study notes.`}
      >
        <div className="space-y-4 py-1">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-500/15 to-blue-500/15 border border-sky-500/30 text-center space-y-1">
            <div className="h-12 w-12 rounded-full bg-sky text-ink-navy mx-auto flex items-center justify-center mb-2 shadow-sm">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-base text-ink dark:text-white">
              Notes, Practice Quiz & Flashcards Ready!
            </h3>
            <p className="text-xs text-neutral-muted max-w-sm mx-auto">
              We extracted key definitions, organized lecture topics with timestamps, and assembled your active recall study deck.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generationResultModal?.quizId && (
              <button
                type="button"
                onClick={() => {
                  const qId = generationResultModal.quizId
                  setGenerationResultModal(null)
                  navigate(`/quizzes/${qId}/take`)
                }}
                className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-surface-elevated hover:border-blue transition-all text-left flex items-start gap-3 group shadow-sm"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-ink dark:text-white flex items-center gap-1">
                    Take Practice Quiz <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue" />
                  </div>
                  <p className="text-[11px] text-neutral-muted mt-0.5">
                    Test comprehension with multi-choice questions
                  </p>
                </div>
              </button>
            )}

            {generationResultModal?.flashcardSetId && (
              <button
                type="button"
                onClick={() => {
                  const fsId = generationResultModal.flashcardSetId
                  setGenerationResultModal(null)
                  navigate(`/flashcards/${fsId}`)
                }}
                className="p-3.5 rounded-xl border border-coral-200 dark:border-coral-900/50 bg-white dark:bg-surface-elevated hover:border-coral transition-all text-left flex items-start gap-3 group shadow-sm"
              >
                <div className="h-9 w-9 rounded-lg bg-coral-100 dark:bg-coral-950/60 text-coral flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-ink dark:text-white flex items-center gap-1">
                    Study Flashcards <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-coral" />
                  </div>
                  <p className="text-[11px] text-neutral-muted mt-0.5">
                    Memorize key terms with spaced repetition
                  </p>
                </div>
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-border dark:border-ink-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGenerationResultModal(null)}
            >
              Done
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const targetMat = generationResultModal?.material
                setGenerationResultModal(null)
                if (targetMat) {
                  openPreview(targetMat)
                }
              }}
            >
              <Eye className="h-3.5 w-3.5 mr-1" /> View Structured Notes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
