import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

import { processAudioOrVideoFile } from '@/lib/mediaLectureProcessor'

export interface ExtractionResult {
  text: string
  characterCount: number
  pageCount?: number
  warning?: string
}

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024 // 25 MB
const MAX_MEDIA_SIZE = 50 * 1024 * 1024 // 50 MB

const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']
const MEDIA_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4']

export function validateStudyFile(file: File): { valid: boolean; error?: string } {
  const fileName = file.name.toLowerCase()
  const isMedia = MEDIA_EXTENSIONS.some(ext => fileName.endsWith(ext))
  const isDoc = DOCUMENT_EXTENSIONS.some(ext => fileName.endsWith(ext))

  if (!isDoc && !isMedia) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload PDF, Word (.docx), Text, Audio (.mp3, .wav, .m4a), or Video (.mp4, .webm).',
    }
  }

  const maxSize = isMedia ? MAX_MEDIA_SIZE : MAX_DOCUMENT_SIZE
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum ${isMedia ? '50 MB' : '25 MB'} limit.`,
    }
  }

  return { valid: true }
}

export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.pdf')) {
    return extractFromPdf(file)
  }

  if (fileName.endsWith('.docx')) {
    return extractFromDocx(file)
  }

  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return extractFromPlainText(file)
  }

  // Audio / Video lecture recording
  if (MEDIA_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    const lecture = await processAudioOrVideoFile(file)
    return {
      text: lecture.formattedText,
      characterCount: lecture.characterCount,
    }
  }

  throw new Error('Unsupported file extension')
}

async function extractFromPdf(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdfDoc = await loadingTask.promise
  const numPages = pdfDoc.numPages

  let fullText = ''
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n\n'
  }

  const trimmed = fullText.trim()
  if (!trimmed || trimmed.length < 30) {
    throw new Error(
      'This PDF appears to be scanned or contains only images. Please upload a text-based PDF or paste the text directly.'
    )
  }

  return {
    text: trimmed,
    characterCount: trimmed.length,
    pageCount: numPages,
  }
}

async function extractFromDocx(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  const text = result.value.trim()

  if (!text || text.length < 20) {
    throw new Error('Could not extract meaningful text from this Word document.')
  }

  return {
    text,
    characterCount: text.length,
    warning: result.messages.length > 0 ? result.messages.map(m => m.message).join('; ') : undefined,
  }
}

async function extractFromPlainText(file: File): Promise<ExtractionResult> {
  const text = await file.text()
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('The text file is empty.')
  }

  return {
    text: trimmed,
    characterCount: trimmed.length,
  }
}
