import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Edit2,
  FileText,
  RotateCcw,
  Sparkles,
  WifiOff,
  User,
  BookOpen,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import type { AIConversation, AIMessage, Material } from '@/types/database'
import { generateAssistantReplyLocally } from '@/lib/aiFallback'
import { MaterialPassageViewerModal } from '@/components/materials/MaterialPassageViewerModal'

export const AIAssistantPage: React.FC = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const initialMaterialId = searchParams.get('materialId')

  const [conversations, setConversations] = useState<AIConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(initialMaterialId || '')

  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)

  // Passage citation viewer modal state
  const [viewingCitation, setViewingCitation] = useState<{
    materialId?: string | null
    materialTitle?: string | null
    passage?: string | null
    pageNumber?: number | null
  } | null>(null)

  // Rename modal
  const [convToRename, setConvToRename] = useState<AIConversation | null>(null)
  const [newConvTitle, setNewConvTitle] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isSending])

  // Load conversations & materials
  useEffect(() => {
    if (!user) return

    const loadInitialData = async () => {
      setIsLoading(true)
      try {
        const { data: convData } = await supabase
          .from('ai_conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        setConversations(convData || [])
        if (convData && convData.length > 0) {
          setActiveConvId(convData[0].id)
          if (convData[0].material_id) {
            setSelectedMaterialId(convData[0].material_id)
          }
        }

        const { data: matData } = await supabase
          .from('materials')
          .select('id, title, subject, status')
          .eq('user_id', user.id)
          .eq('status', 'ready')

        setMaterials(matData as Material[] || [])
      } catch (e) {
        console.error('Error loading conversations:', e)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [user])

  // Load messages when activeConvId changes
  useEffect(() => {
    if (!activeConvId || !user) return

    const loadMessages = async () => {
      const { data } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', activeConvId)
        .order('created_at', { ascending: true })

      setMessages(data || [])
    }

    loadMessages()
  }, [activeConvId, user])

  // Create new conversation
  const handleNewConversation = async () => {
    if (!user) return
    const { data: newConv, error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: user.id,
        title: 'New Study Session',
        material_id: selectedMaterialId || null,
      })
      .select()
      .single()

    if (!error && newConv) {
      setConversations(prev => [newConv, ...prev])
      setActiveConvId(newConv.id)
      setMessages([])
    }
  }

  // Delete conversation
  const handleDeleteConv = async (id: string) => {
    await supabase.from('ai_conversations').delete().eq('id', id)
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeConvId === id) {
      const remaining = conversations.filter(c => c.id !== id)
      setActiveConvId(remaining[0]?.id || null)
    }
    toast.success('Conversation deleted')
  }

  // Rename conversation
  const handleRenameConv = async () => {
    if (!convToRename || !newConvTitle.trim()) return
    await supabase
      .from('ai_conversations')
      .update({ title: newConvTitle.trim() })
      .eq('id', convToRename.id)

    setConversations(prev =>
      prev.map(c => (c.id === convToRename.id ? { ...c, title: newConvTitle.trim() } : c))
    )
    setConvToRename(null)
    toast.success('Conversation renamed')
  }

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage
    if (!text.trim() || isSending) return

    if (!navigator.onLine) {
      toast.error('AI Assistant needs an active internet connection to query Claude.')
      return
    }

    setIsSending(true)
    setLastFailedMessage(null)

    // Optimistically show user message
    const tempUserMsg: AIMessage = {
      id: crypto.randomUUID(),
      conversation_id: activeConvId || '',
      user_id: user?.id || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])
    setInputMessage('')

    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not authenticated')

      let replyData: { conversation_id?: string; message_id?: string; reply: string } | null = null

      // 1. Try Supabase Edge Function first
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: {
            conversation_id: activeConvId || undefined,
            message: text,
            material_id: selectedMaterialId || undefined,
          },
        })

        if (!error && data?.reply) {
          replyData = data
        } else if (error) {
          console.warn('Edge function returned error, attempting browser AI generator:', error.message)
        }
      } catch (edgeErr: any) {
        console.warn('Edge function unavailable, falling back to browser generator:', edgeErr?.message)
      }

      // 2. Fallback to smart in-browser generator if Edge Function is not deployed
      if (!replyData) {
        replyData = await generateAssistantReplyLocally({
          userId: user!.id,
          message: text,
          materialId: selectedMaterialId || undefined,
          conversationId: activeConvId || undefined,
        })
      }

      if (replyData) {
        if (!activeConvId && replyData.conversation_id) {
          setActiveConvId(replyData.conversation_id)
          // Refresh conversation list
          const { data: convData } = await supabase
            .from('ai_conversations')
            .select('*')
            .eq('user_id', user!.id)
            .order('created_at', { ascending: false })
          if (convData) setConversations(convData)
        }

        // Append assistant reply
        const assistantMsg: AIMessage = {
          id: replyData.message_id || crypto.randomUUID(),
          conversation_id: replyData.conversation_id || activeConvId || '',
          user_id: user!.id,
          role: 'assistant',
          content: replyData.reply,
          source_passage: (replyData as any).source_passage || null,
          source_page: (replyData as any).source_page || null,
          material_id: (replyData as any).material_id || selectedMaterialId || null,
          material_title: (replyData as any).material_title || null,
          created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMsg])
      }
    } catch (err: any) {
      console.error('Assistant error:', err)
      toast.error(err.message || 'Failed to send message to assistant')
      setLastFailedMessage(text)
    } finally {
      setIsSending(false)
    }
  }

  // Parse citation metadata from message or text
  const getCitationFromContent = (content: string, msg?: AIMessage) => {
    if (msg?.source_passage || msg?.source_page) {
      const mat = materials.find(m => m.id === (msg.material_id || selectedMaterialId))
      return {
        materialId: msg.material_id || selectedMaterialId || null,
        materialTitle: msg.material_title || mat?.title || 'Study Material',
        passage: msg.source_passage,
        pageNumber: msg.source_page || 1,
      }
    }

    const citationMatch = content.match(/\[Citation:\s*([^|]+)\s*\|\s*Page\s*(\d+)\s*\|\s*Passage:\s*"([^"]+)"\]/i)
    if (citationMatch) {
      const matTitle = citationMatch[1].trim()
      const pageNum = parseInt(citationMatch[2], 10)
      const passage = citationMatch[3].trim()
      const matchedMat = materials.find(m => m.title.toLowerCase() === matTitle.toLowerCase() || m.id === selectedMaterialId)
      return {
        materialId: matchedMat?.id || selectedMaterialId || null,
        materialTitle: matTitle,
        passage,
        pageNumber: pageNum,
      }
    }

    const headerMatch = content.match(/### From your notes \("([^"]+)"(?: • Page (\d+))?\)/i)
    if (headerMatch) {
      const matTitle = headerMatch[1].trim()
      const pageNum = headerMatch[2] ? parseInt(headerMatch[2], 10) : 1
      const notesPart = content.split('### Additional Explanation')[0]
      const cleanNotes = notesPart.replace(/### From your notes[^\n]*\n/, '').replace(/\[Citation:[^\]]+\]/, '').trim()
      const matchedMat = materials.find(m => m.title.toLowerCase() === matTitle.toLowerCase() || m.id === selectedMaterialId)
      return {
        materialId: matchedMat?.id || selectedMaterialId || null,
        materialTitle: matTitle,
        passage: cleanNotes.slice(0, 160),
        pageNumber: pageNum,
      }
    }

    return null
  }

  // Helper to render distinct "From your notes" vs "Additional explanation" sections
  const renderMessageContent = (msg: AIMessage) => {
    const content = msg.content
    const citation = getCitationFromContent(content, msg)

    if (!content.includes('### From your notes') && !content.includes('### Additional explanation')) {
      const cleaned = content.replace(/\[Citation:[^\]]+\]/g, '').trim()
      return (
        <div className="space-y-3">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{cleaned}</div>
          {citation && (
            <div className="pt-2 border-t border-neutral-border dark:border-neutral-border flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-sky font-bold">
                <BookOpen className="h-3.5 w-3.5" />
                Source: {citation.materialTitle} • Page {citation.pageNumber || 1}
              </span>
              <button
                type="button"
                onClick={() => setViewingCitation(citation)}
                className="inline-flex items-center gap-1 text-xs font-bold text-sky hover:text-sky-700 dark:hover:text-sky-300 underline underline-offset-2 decoration-sky/40 hover:decoration-sky transition-all cursor-pointer"
              >
                <span>View Highlighted Passage</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )
    }

    // Split into distinct visual cards
    const parts = content.split(/(?=### (?:From your notes|Additional explanation))/)

    return (
      <div className="space-y-3">
        {parts.map((part, idx) => {
          const isFromNotes = part.startsWith('### From your notes')
          const isAdditional = part.startsWith('### Additional explanation')

          let cleanText = part
            .replace(/^### (From your notes|Additional explanation)[^\n]*\n/, '')
            .replace(/\[Citation:[^\]]+\]/g, '')
            .trim()

          return (
            <div
              key={idx}
              className={`p-3.5 rounded-2xl border text-sm leading-relaxed ${
                isFromNotes
                  ? 'bg-sky-50/70 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800'
                  : isAdditional
                  ? 'bg-violet-50/70 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800'
                  : ''
              }`}
            >
              {(isFromNotes || isAdditional) && (
                <div className="flex items-center justify-between gap-2 mb-2 font-bold text-xs uppercase tracking-wider">
                  {isFromNotes ? (
                    <span className="text-sky font-bold flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" /> From your notes {citation?.pageNumber ? `(Page ${citation.pageNumber})` : ''}
                    </span>
                  ) : (
                    <span className="text-violet font-bold flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" /> Additional explanation
                    </span>
                  )}
                  {isFromNotes && citation && (
                    <button
                      type="button"
                      onClick={() => setViewingCitation(citation)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-sky hover:text-sky-700 dark:hover:text-sky-300 underline underline-offset-2 decoration-sky/40 hover:decoration-sky cursor-pointer capitalize"
                    >
                      <span>Highlight</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="whitespace-pre-wrap">{cleanText}</div>
              {isFromNotes && citation && (
                <div className="mt-2.5 pt-2 border-t border-sky-200/50 dark:border-sky-800/50 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-muted dark:text-neutral-300 font-medium truncate">
                    {citation.materialTitle} • Page {citation.pageNumber || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewingCitation(citation)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky hover:text-sky-700 dark:hover:text-sky-300 transition-all cursor-pointer flex-shrink-0"
                  >
                    <span>Inspect Text</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col md:flex-row gap-4 max-w-7xl mx-auto">
      {/* Left Column: Conversations List */}
      <div className="w-full md:w-64 flex flex-col bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border rounded-3xl p-3 shadow-sm overflow-hidden flex-shrink-0">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-border dark:border-neutral-border">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-muted">
            Sessions
          </span>
          <Button variant="ghost" size="sm" onClick={handleNewConversation}>
            <Plus className="h-4 w-4 mr-1 text-violet" /> New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-neutral-muted text-center py-6">No previous chats</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors group ${
                  activeConvId === conv.id
                    ? 'bg-violet-50 dark:bg-violet-950/40 text-violet font-bold'
                    : 'text-neutral-muted hover:text-ink dark:hover:text-white hover:bg-neutral-bg dark:hover:bg-surface'
                }`}
              >
                <span className="truncate flex-1">{conv.title}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setConvToRename(conv)
                      setNewConvTitle(conv.title)
                    }}
                    className="p-1 hover:text-ink"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleDeleteConv(conv.id)
                    }}
                    className="p-1 hover:text-coral"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Column: Chat Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-surface-elevated border border-neutral-border dark:border-neutral-border rounded-3xl shadow-sm overflow-hidden">
        {/* Chat Header: Material Selector */}
        <div className="p-3.5 border-b border-neutral-border dark:border-neutral-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-neutral-bg/40 dark:bg-surface/40">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-violet text-white flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-ink dark:text-white">StudySpark AI Tutor</h3>
              <p className="text-[10px] text-neutral-muted">Powered by Claude Sonnet</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-muted font-medium whitespace-nowrap">Answer from:</span>
            <select
              value={selectedMaterialId}
              onChange={e => setSelectedMaterialId(e.target.value)}
              className="rounded-xl border border-neutral-border dark:border-neutral-border bg-white dark:bg-surface px-3 py-1 text-xs text-ink dark:text-white"
            >
              <option value="">General Knowledge</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>
                  📄 {m.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
              <div className="h-12 w-12 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet flex items-center justify-center mb-3">
                <Bot className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-ink dark:text-white">Ask your Course Assistant</h4>
              <p className="text-xs text-neutral-muted mt-1 leading-relaxed">
                {selectedMaterialId
                  ? 'Ask any question about your selected document. Explanations will be cited directly from your notes.'
                  : 'Ask about any collegiate topic, solve difficult problem sets, or ask for study recommendations.'}
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-2xl ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-blue text-white'
                      : 'bg-violet text-white'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`p-4 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-blue text-white rounded-tr-none'
                      : 'bg-white dark:bg-surface border border-neutral-border dark:border-neutral-border rounded-tl-none shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    renderMessageContent(msg)
                  )}
                </div>
              </div>
            ))
          )}

          {/* Typing Indicator */}
          {isSending && (
            <div className="flex gap-3 max-w-2xl mr-auto">
              <div className="h-8 w-8 rounded-xl bg-violet text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-neutral-border dark:border-neutral-border rounded-tl-none shadow-sm flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-violet animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-sky animate-bounce [animation-delay:0.2s]" />
                <div className="h-2 w-2 rounded-full bg-blue animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-neutral-muted ml-1">Analyzing notes...</span>
              </div>
            </div>
          )}

          {/* Failed Retry Banner */}
          {lastFailedMessage && (
            <div className="p-3 rounded-2xl bg-coral-50 dark:bg-coral-950/40 border border-coral-200 dark:border-coral-800 flex items-center justify-between text-xs text-coral">
              <span>Failed to send query.</span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-coral text-coral hover:bg-coral-50"
                onClick={() => handleSendMessage(lastFailedMessage)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-neutral-border dark:border-neutral-border bg-white dark:bg-surface-elevated">
          <form
            onSubmit={e => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="Ask a question about your notes or study topics..."
              disabled={isSending}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="violet"
              size="icon"
              disabled={!inputMessage.trim() || isSending}
              isLoading={isSending}
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog
        open={Boolean(convToRename)}
        onClose={() => setConvToRename(null)}
        title="Rename Conversation"
        confirmText="Save Name"
        onConfirm={handleRenameConv}
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold block">Title</label>
          <Input value={newConvTitle} onChange={e => setNewConvTitle(e.target.value)} />
        </div>
      </Dialog>

      {/* Material Passage Citation Modal */}
      <MaterialPassageViewerModal
        open={Boolean(viewingCitation)}
        onClose={() => setViewingCitation(null)}
        materialId={viewingCitation?.materialId}
        materialTitle={viewingCitation?.materialTitle}
        passage={viewingCitation?.passage}
        pageNumber={viewingCitation?.pageNumber}
      />
    </div>
  )
}
