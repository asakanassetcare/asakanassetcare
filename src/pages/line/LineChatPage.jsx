import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare, Paperclip, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function thaiTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function thaiShortDate(dateStr) {
  if (!dateStr) return ''
  const d   = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return thaiTime(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}.`
}

function thaiDateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

function Avatar({ name, pictureUrl, size = 40 }) {
  const initials = (name ?? '?').slice(0, 1).toUpperCase()
  const palette  = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500']
  const color    = palette[(name?.charCodeAt(0) ?? 0) % palette.length]
  if (pictureUrl) {
    return (
      <img src={pictureUrl} alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={e => { e.target.style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
         style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  )
}

function ImageMessage({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    supabase.storage.from('payment-slips').createSignedUrl(path, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl) })
  }, [path])
  if (!url) return <div className="w-48 h-32 bg-gray-200 animate-pulse rounded-xl" />
  return <img src={url} alt="รูปภาพ" className="max-w-xs max-h-64 rounded-xl object-contain" />
}

function Bubble({ msg, senderName }) {
  const isOut  = msg.direction === 'outbound'
  const isMedia = msg.message_type === 'image' || msg.message_type === 'video'
  let body = null

  if (msg.message_type === 'text') {
    body = <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
  } else if (msg.message_type === 'image' && msg.media_url) {
    body = isOut
      ? <img src={msg.media_url} alt="รูปภาพ" className="max-w-xs max-h-64 rounded-xl object-contain" />
      : <ImageMessage path={msg.media_url} />
  } else if (msg.message_type === 'video' && msg.media_url) {
    body = (
      <video
        src={msg.media_url}
        controls
        className="max-w-xs rounded-xl"
        style={{ maxHeight: '16rem' }}
      />
    )
  } else if (msg.message_type === 'sticker' && msg.raw_payload?.packageId) {
    const url = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${msg.raw_payload.stickerId}/ANDROID/sticker.png`
    body = <img src={url} alt="sticker" className="w-24 h-24 object-contain" />
  } else {
    body = <p className="text-sm italic text-gray-400">[{msg.message_type}]</p>
  }

  return (
    <div className={`flex mb-3 ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} max-w-xs lg:max-w-sm`}>
        {isMedia ? body : (
          <div className={`px-4 py-2.5 rounded-2xl ${
            isOut
              ? 'bg-[#06C755] text-white rounded-tr-sm'
              : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm shadow-sm'
          }`}>
            {body}
          </div>
        )}
        <div className={`flex items-center gap-1.5 mt-1 ${isOut ? 'flex-row-reverse' : ''}`}>
          <span className="text-[11px] text-gray-400">{thaiTime(msg.created_at)}</span>
          {isOut && senderName && (
            <span className="text-[11px] text-gray-400">{senderName}</span>
          )}
          {isOut && <span className="text-[11px] text-[#06C755]">ส่งแล้ว ✓</span>}
        </div>
      </div>
    </div>
  )
}

async function captureVideoThumb(file) {
  return new Promise((resolve) => {
    const video  = document.createElement('video')
    video.preload = 'metadata'
    video.muted   = true
    const objUrl  = URL.createObjectURL(file)
    video.src     = objUrl
    video.onloadeddata = () => { video.currentTime = 0.1 }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      const w = Math.min(video.videoWidth, 1280)
      canvas.width  = w
      canvas.height = Math.round(w * video.videoHeight / video.videoWidth)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => { URL.revokeObjectURL(objUrl); resolve(blob) }, 'image/jpeg', 0.8)
    }
    video.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null) }
  })
}

export default function LineChatPage() {
  const [conversations, setConversations] = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [senderNames,   setSenderNames]   = useState({})
  const [text,          setText]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [selectedFile,  setSelectedFile]  = useState(null) // { file, previewUrl, isVideo }
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const fileRef        = useRef(null)

  const selected = conversations.find(c => c.id === selectedId)

  function clearFile() {
    if (selectedFile?.previewUrl) URL.revokeObjectURL(selectedFile.previewUrl)
    setSelectedFile(null)
  }

  async function loadConversations() {
    const { data } = await supabase
      .from('line_conversations')
      .select('*, tenants(full_name, phone)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setConversations(data ?? [])
    setLoadingConvs(false)
  }

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    const ch = supabase
      .channel('line-conv-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_conversations' }, loadConversations)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function loadMessages(convId) {
    const { data } = await supabase
      .from('line_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at')
    setMessages(data ?? [])

    const ids = [...new Set((data ?? []).filter(m => m.sent_by).map(m => m.sent_by))]
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name').in('id', ids)
      const map = {}
      profs?.forEach(p => { map[p.id] = p.full_name })
      setSenderNames(map)
    }
  }

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    loadMessages(selectedId)
    markRead(selectedId)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const ch = supabase
      .channel(`line-msgs-${selectedId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'line_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function markRead(convId) {
    await supabase.from('line_conversations').update({ unread_count: 0 }).eq('id', convId)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (selectedFile?.previewUrl) URL.revokeObjectURL(selectedFile.previewUrl)
    setSelectedFile({ file, previewUrl: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') })
    e.target.value = ''
  }

  async function send() {
    if ((!text.trim() && !selectedFile) || !selectedId || sending) return
    setSending(true)
    const msgText    = text.trim()
    const fileToSend = selectedFile
    setText('')
    setSelectedFile(null)

    try {
      if (fileToSend) {
        setUploading(true)
        const ext  = fileToSend.isVideo ? 'mp4' : (fileToSend.file.name.split('.').pop() || 'jpg')
        const path = `${selectedId}/${Date.now()}.${ext}`

        const { data: up, error: upErr } = await supabase.storage
          .from('line-media').upload(path, fileToSend.file, { upsert: true })
        if (upErr) throw upErr

        const { data: { publicUrl } } = supabase.storage.from('line-media').getPublicUrl(up.path)

        let previewUrl = publicUrl
        if (fileToSend.isVideo) {
          const thumbBlob = await captureVideoThumb(fileToSend.file)
          if (thumbBlob) {
            const thumbPath = `${selectedId}/${Date.now()}_thumb.jpg`
            const { data: td } = await supabase.storage
              .from('line-media').upload(thumbPath, thumbBlob, { upsert: true })
            if (td) {
              const { data: { publicUrl: tu } } = supabase.storage.from('line-media').getPublicUrl(td.path)
              previewUrl = tu
            }
          }
        }

        setUploading(false)
        const { error } = await supabase.functions.invoke('line-reply', {
          body: {
            conversation_id: selectedId,
            media_url:       publicUrl,
            media_type:      fileToSend.isVideo ? 'video' : 'image',
            preview_url:     previewUrl,
          },
        })
        if (fileToSend.previewUrl) URL.revokeObjectURL(fileToSend.previewUrl)
        if (error) throw error
      }

      if (msgText) {
        const { error } = await supabase.functions.invoke('line-reply', {
          body: { conversation_id: selectedId, text: msgText },
        })
        if (error) throw error
      }

      inputRef.current?.focus()
    } catch (err) {
      setText(msgText)
      setSelectedFile(fileToSend)
      alert('ส่งไม่สำเร็จ: ' + (err.message ?? err))
    } finally {
      setSending(false)
      setUploading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function renderMessages() {
    const out = []
    let lastLabel = null
    for (const msg of messages) {
      const label = thaiDateLabel(msg.created_at)
      if (label !== lastLabel) {
        out.push(
          <div key={`d-${msg.id}`} className="flex justify-center my-4">
            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{label}</span>
          </div>
        )
        lastLabel = label
      }
      out.push(<Bubble key={msg.id} msg={msg} senderName={senderNames[msg.sent_by]} />)
    }
    return out
  }

  return (
    <div className="flex flex-1 overflow-hidden h-full">

      {/* ---- LEFT: Conversation list ---- */}
      <div className="w-72 xl:w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          <div className="w-6 h-6 bg-[#06C755] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold leading-none">L</span>
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900 leading-none">LINE Inbox</p>
            <p className="text-xs text-gray-400 mt-0.5">{conversations.length} conversations</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs && (
            <p className="text-center text-gray-400 text-xs py-8">กำลังโหลด...</p>
          )}
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full px-4 py-3 flex items-start gap-3 border-b border-gray-50 text-left transition-colors hover:bg-gray-50
                ${selectedId === conv.id ? 'bg-green-50 border-l-[3px] border-l-[#06C755]' : 'border-l-[3px] border-l-transparent'}`}
            >
              <Avatar name={conv.display_name} pictureUrl={conv.picture_url} size={42} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-sm text-gray-900 truncate">
                    {conv.display_name ?? 'ไม่ทราบชื่อ'}
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    {thaiShortDate(conv.last_message_at)}
                  </span>
                </div>
                {conv.tenants?.full_name && (
                  <p className="text-[11px] text-[#06C755] truncate leading-tight">{conv.tenants.full_name}</p>
                )}
                <p className="text-xs text-gray-400 truncate mt-0.5 leading-tight">
                  {conv.last_message ?? '—'}
                </p>
              </div>
              {conv.unread_count > 0 && (
                <span className="flex-shrink-0 bg-[#06C755] text-white text-[11px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ---- RIGHT: Chat thread ---- */}
      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* Thread header */}
          <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
            <Avatar name={selected?.display_name} pictureUrl={selected?.picture_url} size={38} />
            <div>
              <p className="font-semibold text-sm text-gray-900 leading-tight">{selected?.display_name}</p>
              {selected?.tenants?.full_name && (
                <p className="text-xs text-gray-400">
                  {selected.tenants.full_name}
                  {selected.tenants.phone ? ` · ${selected.tenants.phone}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-3 bg-white border-t border-gray-200">
            {/* File preview */}
            {selectedFile && (
              <div className="mb-2 flex items-center gap-3">
                <div className="relative">
                  {selectedFile.isVideo ? (
                    <video src={selectedFile.previewUrl} className="h-20 rounded-lg object-cover" muted />
                  ) : (
                    <img src={selectedFile.previewUrl} className="h-20 rounded-lg object-cover" alt="" />
                  )}
                  <button
                    onClick={clearFile}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-gray-900 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {uploading && (
                  <span className="text-xs text-gray-400">กำลังอัปโหลด...</span>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                className="flex-shrink-0 w-10 h-10 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                title="แนบรูปภาพ / วิดีโอ"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={onFileChange}
              />
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="พิมพ์ข้อความ…  Enter = ส่ง  Shift+Enter = ขึ้นบรรทัด"
                rows={2}
                className="flex-1 resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]/40 focus:border-[#06C755]"
              />
              <button
                onClick={send}
                disabled={(!text.trim() && !selectedFile) || sending}
                className="flex-shrink-0 w-10 h-10 bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-40 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">เลือกแชทเพื่อเริ่มสนทนา</p>
          </div>
        </div>
      )}
    </div>
  )
}
