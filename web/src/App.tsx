type ChatMode = 'agent' | 'chat' | 'insights'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type NodeItem = {
  id: string
  x: number
  y: number
  color: string
  title: string
  description: string
  tags: string[]
  size: number
}

type EdgeItem = {
  id: string
  sourceId: string
  targetId: string
  direction: 'none' | 'source-to-target' | 'target-to-source'
  keywords: string[]
  note: string
  curve: 'straight' | 'curved'
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type PendingActions = {
  planText: string
} | null

const COLORS = [
  '#1e90ff', // blue (default)
  '#ff4d4f', // red
  '#fadb14', // yellow
  '#52c41a', // green
  '#ffffff', // white
  '#000000', // black
]

function App() {
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0])
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const [edges, setEdges] = useState<EdgeItem[]>([])
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<
    | { edgeId: string; x: number; y: number }
    | null
  >(null)
  const [zoom, setZoom] = useState<number>(1)
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 2
  const ZOOM_STEP = 0.1
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState<boolean>(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  function zoomIn() {
    setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))))
  }

  function zoomOut() {
    setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))))
  }

  const [linkingFrom, setLinkingFrom] = useState<
    | { nodeId: string; side: 'left' | 'right' | 'top' | 'bottom' }
    | null
  >(null)
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [showSave, setShowSave] = useState<boolean>(false)
  const [showOpen, setShowOpen] = useState<boolean>(false)
  const [saveCode, setSaveCode] = useState<string>("")
  const [openCode, setOpenCode] = useState<string>("")
  const [openError, setOpenError] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false)
  const [showChat, setShowChat] = useState<boolean>(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState<string>("")
  const [isSending, setIsSending] = useState<boolean>(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [autoApply, setAutoApply] = useState<boolean>(true)
  const [pending, setPending] = useState<PendingActions>(null)
  const [mode, setMode] = useState<ChatMode>('agent')
  const [showModeMenu, setShowModeMenu] = useState<boolean>(false)
  const [showDocs, setShowDocs] = useState<boolean>(false)
  const [showUpdates, setShowUpdates] = useState<boolean>(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const interactionStartRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef<boolean>(false)

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) ?? null,
    [activeNodeId, nodes]
  )
  const activeEdge = useMemo(
    () => edges.find((e) => e.id === activeEdgeId) ?? null,
    [activeEdgeId, edges]
  )

  function addNode() {
    const container = canvasRef.current
    const rect = container?.getBoundingClientRect()
    const centerX = rect ? (rect.width / 2) / zoom - pan.x : 200
    const centerY = rect ? (rect.height / 2) / zoom - pan.y : 200
    const id = cryptoRandomId()
    const newNode: NodeItem = {
      id,
      x: centerX - 32,
      y: centerY - 32,
      color: selectedColor,
      title: `Node ${nodes.length + 1}`,
      description: '',
      tags: [],
      size: 64,
    }
    setNodes((prev) => [...prev, newNode])
  }

  function onPointerDownNode(e: React.PointerEvent<HTMLDivElement>, nodeId: string) {
    e.stopPropagation()
    const container = canvasRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const pointerX = (e.clientX - containerRect.left) / zoom - pan.x
    const pointerY = (e.clientY - containerRect.top) / zoom - pan.y
    setDraggingNodeId(nodeId)
    setDragOffset({ dx: pointerX - node.x, dy: pointerY - node.y })
    interactionStartRef.current = { x: pointerX, y: pointerY }
    didDragRef.current = false
    ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const container = canvasRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const pointerX = (e.clientX - containerRect.left) / zoom - pan.x
    const pointerY = (e.clientY - containerRect.top) / zoom - pan.y
    setPointerPos({ x: pointerX, y: pointerY })
    if (draggingNodeId && dragOffset) {
      const start = interactionStartRef.current
      if (start) {
        const dx = pointerX - start.x
        const dy = pointerY - start.y
        if (!didDragRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          didDragRef.current = true
        }
      }
      const newX = pointerX - dragOffset.dx
      const newY = pointerY - dragOffset.dy
      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n))
      )
      return
    }
    if (isPanning && panStartRef.current && pointerStartRef.current) {
      const dxScreen = e.clientX - pointerStartRef.current.x
      const dyScreen = e.clientY - pointerStartRef.current.y
      const dxScene = dxScreen / zoom
      const dyScene = dyScreen / zoom
      setPan({ x: panStartRef.current.x + dxScene, y: panStartRef.current.y + dyScene })
    }
  }

  function onPointerUp() {
    setDraggingNodeId(null)
    setDragOffset(null)
    interactionStartRef.current = null
    setIsPanning(false)
    panStartRef.current = null
    pointerStartRef.current = null
    // If we were linking, finalize on pointer up within canvas using last pointer pos
    if (linkingFrom && pointerPos) {
      finalizeLinkingAt(pointerPos.x, pointerPos.y)
    }
    setLinkingFrom(null)
  }

  function openEditor(nodeId: string) {
    setActiveNodeId(nodeId)
    setActiveEdgeId(null)
  }

  function closeEditor() {
    setActiveNodeId(null)
    setActiveEdgeId(null)
    setEdgeMenu(null)
  }

  function updateActiveNode(updater: (n: NodeItem) => NodeItem) {
    if (!activeNodeId) return
    setNodes((prev) => prev.map((n) => (n.id === activeNodeId ? updater(n) : n)))
  }

  function deleteActiveNode() {
    if (!activeNodeId) return
    const node = nodes.find((n) => n.id === activeNodeId)
    const ok = window.confirm(`Delete node "${node?.title ?? ''}" and its connections?`)
    if (!ok) return
    setEdges((prev) => prev.filter((e) => e.sourceId !== activeNodeId && e.targetId !== activeNodeId))
    setNodes((prev) => prev.filter((n) => n.id !== activeNodeId))
    setActiveNodeId(null)
  }

  function updateActiveEdge(updater: (e: EdgeItem) => EdgeItem) {
    if (!activeEdgeId) return
    setEdges((prev) => prev.map((e) => (e.id === activeEdgeId ? updater(e) : e)))
  }

  function toggleEdgeKeyword(k: string) {
    updateActiveEdge((e) => {
      const on = e.keywords.includes(k)
      return { ...e, keywords: on ? e.keywords.filter((x) => x !== k) : [...e.keywords, k] }
    })
  }

  function anchorForSide(node: NodeItem, side: 'left' | 'right' | 'top' | 'bottom') {
    const radius = (node.size ?? 64) / 2
    const center = { x: node.x + radius, y: node.y + radius }
    if (side === 'left') return { x: center.x - radius, y: center.y }
    if (side === 'right') return { x: center.x + radius, y: center.y }
    if (side === 'top') return { x: center.x, y: center.y - radius }
    return { x: center.x, y: center.y + radius }
  }

  function pointInNode(px: number, py: number, node: NodeItem) {
    const radius = (node.size ?? 64) / 2
    const cx = node.x + radius
    const cy = node.y + radius
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= radius * radius
  }

  function findNodeAtPoint(px: number, py: number) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (pointInNode(px, py, n)) return n
    }
    return null
  }

  function finalizeLinkingAt(px: number, py: number) {
    if (!linkingFrom) return
    const target = findNodeAtPoint(px, py)
    if (target && target.id !== linkingFrom.nodeId) {
      const id = cryptoRandomId()
      const newEdge: EdgeItem = {
        id,
        sourceId: linkingFrom.nodeId,
        targetId: target.id,
        direction: 'none',
        keywords: [],
        note: '',
        curve: 'straight',
      }
      setEdges((prev) => [...prev, newEdge])
    }
  }

  // --- Save / Open ---
  function generateSceneCode() {
    const scene = {
      v: 1,
      nodes,
      edges,
      zoom,
      pan,
    }
    const json = JSON.stringify(scene)
    // Encode JSON to base64 with unicode safety
    const b64 = btoa(unescape(encodeURIComponent(json)))
    setSaveCode(b64)
    setShowSave(true)
  }

  function loadSceneFromCode() {
    try {
      setOpenError(null)
      const trimmed = openCode.trim()
      if (!trimmed) {
        setOpenError('Please paste a code.')
        return
      }
      const json = decodeURIComponent(escape(atob(trimmed)))
      const data = JSON.parse(json)
      if (!data || typeof data !== 'object') throw new Error('Invalid')
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Invalid')
      setNodes(data.nodes)
      setEdges(data.edges)
      if (typeof data.zoom === 'number') setZoom(data.zoom)
      if (data.pan && typeof data.pan.x === 'number' && typeof data.pan.y === 'number') setPan(data.pan)
      setShowOpen(false)
    } catch (e) {
      setOpenError('Invalid code. Make sure you pasted the full string.')
    }
  }

  function resetScene() {
    setNodes([])
    setEdges([])
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setActiveNodeId(null)
    setActiveEdgeId(null)
    setEdgeMenu(null)
    setShowResetConfirm(false)
  }

  // --- Chat / AI ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function buildSceneSummary() {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.title,
        color: n.color,
        size: n.size,
        x: n.x,
        y: n.y,
        description: n.description,
        tags: n.tags,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        direction: e.direction,
        curve: e.curve,
        keywords: e.keywords,
        note: e.note,
      })),
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() }
    setChatMessages((m) => [...m, userMsg])
    setChatInput("")
    setIsSending(true)
    try {
      const systemPrompt = `${buildSystemPrompt(mode)}\n\nYou are called Sparky. Refer to yourself as Sparky when appropriate.`

      const scene = buildSceneSummary()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Current scene (JSON):\n${JSON.stringify(scene)}\n\nUser: ${userMsg.content}` },
          ],
          temperature: 0.3,
        }),
      })
      if (!resp.ok) {
        let detail = ''
        try {
          const err = await resp.json()
          detail = typeof err?.detail === 'string' ? err.detail : JSON.stringify(err)
        } catch {
          detail = await resp.text()
        }
        setChatMessages((m) => [...m, { role: 'assistant', content: `Error from server: ${detail}` }])
      } else {
        const data = await resp.json()
        const planText: string = data?.choices?.[0]?.message?.content
          || data?.choices?.[0]?.delta?.content
          || data?.message?.content
          || '(no response)'
        setChatMessages((m) => [...m, { role: 'assistant', content: planText }])
        const wantsBuild = mode === 'agent' && detectBuildIntent(userMsg.content, planText)
        if (wantsBuild) {
          if (autoApply) {
            await generateAndApplyActions(planText)
          } else {
            setPending({ planText })
          }
        }
      }
    } catch (err) {
      setChatMessages((m) => [...m, { role: 'assistant', content: 'Sorry, I failed to respond.' }])
    } finally {
      setIsSending(false)
    }
  }

  async function generateAndApplyActions(planText: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const scene = buildSceneSummary()
    const systemPrompt = `You are Sparky, a planner that converts a human plan into machine-editable actions for a system visualization app.
Output ONLY valid JSON in the form {"actions":[ ... ]} with no prose. Supported actions:
 - {"type":"add_node","node":{"title":"","color":"#hex","size":64,"x":0,"y":0,"description":"","tags":["..."]}}
 - {"type":"add_edge","edge":{"sourceTitle":"","targetTitle":"","direction":"none|source-to-target|target-to-source","curve":"straight|curved","keywords":["..."],"note":""}}
Use existing node titles for edges if nodes already exist. If coordinates are omitted, choose reasonable positions near related nodes.`
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Scene: ${JSON.stringify(scene)}\nPlan: ${planText}\nReturn only JSON actions.` },
        ],
        temperature: 0.2,
      }),
    })
    if (!resp.ok) {
      let detail = await resp.text()
      try { const j = await resp.clone().json(); detail = JSON.stringify(j) } catch {}
      setChatMessages((m) => [...m, { role: 'assistant', content: `Failed to generate actions: ${detail}` }])
      return
    }
    const data = await resp.json()
    const text = data?.choices?.[0]?.message?.content || data?.message?.content || ''
    if (!text) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '(no actions returned)' }])
      return
    }
    // Reuse JSON extractor
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      setChatMessages((m) => [...m, { role: 'assistant', content: 'Could not parse actions JSON.' }])
      return
    }
    try {
      const obj = JSON.parse(text.slice(start, end + 1))
      const actions = Array.isArray(obj?.actions) ? obj.actions : []
      if (actions.length === 0) {
        setChatMessages((m) => [...m, { role: 'assistant', content: 'No actions to apply.' }])
        return
      }
      applyActions(actions)
      setChatMessages((m) => [...m, { role: 'assistant', content: `Applied ${actions.length} change(s).` }])
    } catch (e) {
      setChatMessages((m) => [...m, { role: 'assistant', content: 'Invalid actions JSON.' }])
    }
  }

  // Intent detection: only build when user asks for it explicitly
  function detectBuildIntent(userText: string, planText: string): boolean {
    const text = `${userText}\n${planText}`.toLowerCase()
    const negate = /(don't|do not|no\s+change|no changes|just\s+chat|talk|discuss|explain|analyze)/
    if (negate.test(text)) return false
    const trigger = /(create|add|link|connect|make|generate|build|attach|wire|insert|new\s+node|new\s+edge|add\s+node|add\s+edge|make\s+node|make\s+edge)/
    return trigger.test(text)
  }

  function buildSystemPrompt(m: ChatMode): string {
    const base = 'You are inside a system visualization app.'
    if (m === 'agent') {
      return `${base} When the user requests changes, first reply with a short human plan of what you will create (nodes/links). No JSON.`
    }
    if (m === 'insights') {
      return `${base} Your job is to analyze the existing scene (nodes, links, notes, keywords) and answer questions about it: patterns, bottlenecks, suggestions. Do not propose changes unless explicitly asked.`
    }
    return `${base} Provide design tips, best practices, and guidance. Do not propose changes unless asked.`
  }

  function applyActions(actions: any[]) {
    // Build title->id map for edges by title
    const titleToId = new Map(nodes.map((n) => [n.title, n.id]))
    let nextNodes: NodeItem[] = nodes.slice()
    let nextEdges: EdgeItem[] = edges.slice()

    for (const action of actions) {
      if (action?.type === 'add_node' && action.node) {
        const n = action.node
        const id = cryptoRandomId()
        const size = typeof n.size === 'number' ? n.size : 64
        const x = typeof n.x === 'number' ? n.x : 100 + Math.random() * 200
        const y = typeof n.y === 'number' ? n.y : 100 + Math.random() * 200
        const newNode: NodeItem = {
          id,
          x,
          y,
          color: n.color || '#1e90ff',
          title: n.title || `Node ${nextNodes.length + 1}`,
          description: n.description || '',
          tags: Array.isArray(n.tags) ? n.tags : [],
          size,
        }
        nextNodes.push(newNode)
        titleToId.set(newNode.title, newNode.id)
      } else if (action?.type === 'add_edge' && action.edge) {
        const e = action.edge
        let sourceId = e.sourceId
        let targetId = e.targetId
        if (!sourceId && e.sourceTitle) sourceId = titleToId.get(e.sourceTitle)
        if (!targetId && e.targetTitle) targetId = titleToId.get(e.targetTitle)
        if (!sourceId || !targetId || sourceId === targetId) continue
        const id = cryptoRandomId()
        const newEdge: EdgeItem = {
          id,
          sourceId,
          targetId,
          direction: e.direction === 'source-to-target' || e.direction === 'target-to-source' ? e.direction : 'none',
          curve: e.curve === 'curved' ? 'curved' : 'straight',
          keywords: Array.isArray(e.keywords) ? e.keywords : [],
          note: typeof e.note === 'string' ? e.note : '',
        }
        nextEdges.push(newEdge)
      }
    }
    setNodes(nextNodes)
    setEdges(nextEdges)
    setPending(null)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeEditor()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="app-root">
      <div className="top-title">
        <span className="brand-name">Circuitboard</span>
        <img src="/stars.png" alt="" className="brand-stars" aria-hidden />
      </div>

      <div className="top-left-actions">
        <button className="round-icon" title="Documentation" onClick={() => setShowDocs(true)} aria-label="Open docs">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 17v-1a4 4 0 1 0-4-4" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="19" r="1" fill="#374151"/>
          </svg>
        </button>
        <button className="round-icon" title="Updates" onClick={() => setShowUpdates(true)} aria-label="Open updates">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6h16v12H4z" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M4 6l8 6 8-6" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="top-actions">
        <button className="action-btn btn-green" onClick={generateSceneCode}>Save</button>
        <button className="action-btn btn-blue" onClick={() => setShowOpen(true)}>Open</button>
        <button className="action-btn btn-red" onClick={() => setShowResetConfirm(true)}>Reset</button>
      </div>

      <div className="floating-pill">
        <button className="add-btn" title="Add node" onClick={addNode}>+</button>
        <div className="pill-divider" />
        <div className="pill-palette">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${selectedColor === c ? 'selected' : ''}`}
              style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#d0d0d0' : 'transparent' }}
              onClick={() => setSelectedColor(c)}
              aria-label={`Select color ${c}`}
            />
          ))}
          <button
            className="swatch multi"
            title="Custom color"
            onClick={() => setShowColorPicker((v) => !v)}
            aria-label="Open custom color picker"
          />
        </div>
      </div>

      <div
        className={`canvas ${isPanning ? 'panning' : ''}`}
        ref={canvasRef}
        onPointerMove={(e) => {
          const container = canvasRef.current
          if (container) {
            const rect = container.getBoundingClientRect()
            setPointerPos({ x: (e.clientX - rect.left) / zoom - pan.x, y: (e.clientY - rect.top) / zoom - pan.y })
          }
          onPointerMove(e)
        }}
        onPointerDown={(e) => {
          // Start panning only if clicking empty canvas (not a node)
          if (e.target === e.currentTarget) {
            setIsPanning(true)
            panStartRef.current = { ...pan }
            pointerStartRef.current = { x: e.clientX, y: e.clientY }
          }
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          setActiveNodeId(null)
          setActiveEdgeId(null)
        }}
      >
        {showColorPicker && (
          <div className="color-picker-popover" onClick={(e) => e.stopPropagation()}>
            <div className="modal-section" style={{ minWidth: 220 }}>
              <label className="field-label">Pick a color</label>
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                style={{ width: '100%', height: 40, padding: 0, border: 'none', background: 'transparent' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button className="action-btn" onClick={() => setShowColorPicker(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {/* Whole scene pans and scales */}
        <div className="canvas-content" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {/* Edges SVG layer */}
        <svg className="edges-layer" width="100%" height="100%">
          {edges.map((edge) => {
            const src = nodes.find((n) => n.id === edge.sourceId)
            const tgt = nodes.find((n) => n.id === edge.targetId)
            if (!src || !tgt) return null
            const srcRadius = (src.size ?? 64) / 2
            const tgtRadius = (tgt.size ?? 64) / 2
            const aCenter = { x: src.x + srcRadius, y: src.y + srcRadius }
            const bCenter = { x: tgt.x + tgtRadius, y: tgt.y + tgtRadius }
            const vx = bCenter.x - aCenter.x
            const vy = bCenter.y - aCenter.y
            const len = Math.hypot(vx, vy) || 1
            const ux = vx / len
            const uy = vy / len
            // Endpoints land exactly on the circle edge for each node size
            const a = { x: aCenter.x + ux * srcRadius, y: aCenter.y + uy * srcRadius }
            const b = { x: bCenter.x - ux * tgtRadius, y: bCenter.y - uy * tgtRadius }
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const isSelected = activeEdgeId === edge.id
            const keywordsText = edge.keywords.join(', ')
            const labelText = [keywordsText, edge.note].filter(Boolean).join(' • ')
            return (
              <g key={edge.id} className={`edge ${isSelected ? 'selected' : ''}`}
                 onClick={(e) => {
                   e.stopPropagation()
                   setActiveEdgeId(edge.id)
                   setActiveNodeId(null)
                   // open inline menu near midpoint
                   setEdgeMenu({ edgeId: edge.id, x: mid.x, y: mid.y - 16 })
                 }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {/* Arrowheads as open V-shapes at the tip */}
                {edge.direction === 'source-to-target' && (() => {
                  const arrowLength = 12
                  const arrowWidth = 10
                  const tipX = b.x
                  const tipY = b.y
                  const baseX = tipX - ux * arrowLength
                  const baseY = tipY - uy * arrowLength
                  const perpX = -uy
                  const perpY = ux
                  const p1x = baseX + perpX * (arrowWidth / 2)
                  const p1y = baseY + perpY * (arrowWidth / 2)
                  const p2x = baseX - perpX * (arrowWidth / 2)
                  const p2y = baseY - perpY * (arrowWidth / 2)
                  return (
                    <g>
                      <line x1={tipX} y1={tipY} x2={p1x} y2={p1y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
                      <line x1={tipX} y1={tipY} x2={p2x} y2={p2y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
                    </g>
                  )
                })()}
                {edge.direction === 'target-to-source' && (() => {
                  const arrowLength = 12
                  const arrowWidth = 10
                  const tipX = a.x
                  const tipY = a.y
                  const baseX = tipX + ux * arrowLength
                  const baseY = tipY + uy * arrowLength
                  const perpX = -uy
                  const perpY = ux
                  const p1x = baseX + perpX * (arrowWidth / 2)
                  const p1y = baseY + perpY * (arrowWidth / 2)
                  const p2x = baseX - perpX * (arrowWidth / 2)
                  const p2y = baseY - perpY * (arrowWidth / 2)
                  return (
                    <g>
                      <line x1={tipX} y1={tipY} x2={p1x} y2={p1y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
                      <line x1={tipX} y1={tipY} x2={p2x} y2={p2y} stroke="#374151" strokeWidth={2.5} strokeLinecap="round" />
                    </g>
                  )
                })()}
                {labelText && (
                  <g>
                    <rect x={mid.x - 100} y={mid.y - 14} width={200} height={20} rx={6} fill="rgba(255,255,255,0.8)" />
                    <text x={mid.x} y={mid.y} textAnchor="middle" alignmentBaseline="middle" fill="#111" fontSize={12}>{labelText}</text>
                  </g>
                )}
              </g>
            )
          })}
          {/* Linking preview */}
          {linkingFrom && pointerPos && (() => {
            const src = nodes.find((n) => n.id === linkingFrom.nodeId)
            if (!src) return null
            const start = anchorForSide(src, linkingFrom.side)
            return <line x1={start.x} y1={start.y} x2={pointerPos.x} y2={pointerPos.y} stroke="#999" strokeDasharray="6 4" strokeWidth={2} />
          })()}
        </svg>
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`node ${draggingNodeId === node.id ? 'dragging' : ''}`}
            style={{
              transform: `translate(${node.x}px, ${node.y}px)`,
              width: `${node.size}px`,
              height: `${node.size}px`,
              backgroundColor: node.color,
              border: node.color.toLowerCase() === '#ffffff' ? '1px solid #d0d0d0' : 'none',
              color: node.color.toLowerCase() === '#000000' ? '#ffffff' : '#000000',
            }}
            onPointerDown={(e) => onPointerDownNode(e, node.id)}
            onDoubleClick={() => openEditor(node.id)}
            onClick={(e) => {
              e.stopPropagation()
              if (didDragRef.current) {
                // Suppress click after a drag
                didDragRef.current = false
                return
              }
              openEditor(node.id)
            }}
            role="button"
            aria-label={`Node ${node.title}`}
          >
            <span className="node-title">{node.title}</span>
            {/* Link handles */}
            <button
              className="handle handle-left"
              title="Link from left"
              onPointerDown={(e) => {
                e.stopPropagation()
                const target = e.currentTarget
                target.setPointerCapture(e.pointerId)
                setLinkingFrom({ nodeId: node.id, side: 'left' })
              }}
              onPointerUp={(e) => {
                const container = canvasRef.current
                if (!container) return
                const rect = container.getBoundingClientRect()
                finalizeLinkingAt((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
                setLinkingFrom(null)
              }}
            />
            <button
              className="handle handle-right"
              title="Link from right"
              onPointerDown={(e) => {
                e.stopPropagation()
                const target = e.currentTarget
                target.setPointerCapture(e.pointerId)
                setLinkingFrom({ nodeId: node.id, side: 'right' })
              }}
              onPointerUp={(e) => {
                const container = canvasRef.current
                if (!container) return
                const rect = container.getBoundingClientRect()
                finalizeLinkingAt((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
                setLinkingFrom(null)
              }}
            />
            <button
              className="handle handle-top"
              title="Link from top"
              onPointerDown={(e) => {
                e.stopPropagation()
                const target = e.currentTarget
                target.setPointerCapture(e.pointerId)
                setLinkingFrom({ nodeId: node.id, side: 'top' })
              }}
              onPointerUp={(e) => {
                const container = canvasRef.current
                if (!container) return
                const rect = container.getBoundingClientRect()
                finalizeLinkingAt((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
                setLinkingFrom(null)
              }}
            />
            <button
              className="handle handle-bottom"
              title="Link from bottom"
              onPointerDown={(e) => {
                e.stopPropagation()
                const target = e.currentTarget
                target.setPointerCapture(e.pointerId)
                setLinkingFrom({ nodeId: node.id, side: 'bottom' })
              }}
              onPointerUp={(e) => {
                const container = canvasRef.current
                if (!container) return
                const rect = container.getBoundingClientRect()
                finalizeLinkingAt((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
                setLinkingFrom(null)
              }}
            />
          </div>
        ))}
        </div>
      </div>

      {activeNode && (
        <div className="modal-overlay" onClick={closeEditor}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit node</h3>
              <button className="close-btn" onClick={closeEditor} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-section">
              <label className="field-label" htmlFor="node-title">Name</label>
              <input
                id="node-title"
                className="text-input"
                type="text"
                value={activeNode.title}
                onChange={(e) =>
                  updateActiveNode((n) => ({ ...n, title: e.target.value }))
                }
                placeholder="Node name"
              />
            </div>

            <div className="modal-section">
              <label className="field-label">Color</label>
              <div className="palette">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${activeNode.color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c, borderColor: c === '#ffffff' ? '#d0d0d0' : 'transparent' }}
                    onClick={() => updateActiveNode((n) => ({ ...n, color: c }))}
                    aria-label={`Set color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="modal-section">
              <label className="field-label" htmlFor="node-size">Size</label>
              <input
                id="node-size"
                className="text-input"
                type="number"
                min={24}
                max={200}
                step={2}
                value={activeNode.size}
                onChange={(e) => {
                  const v = parseInt(e.target.value || '64', 10)
                  const clamped = Math.min(200, Math.max(24, v))
                  updateActiveNode((n) => ({ ...n, size: clamped }))
                }}
              />
            </div>

            <div className="modal-section">
              <label className="field-label" htmlFor="node-desc">Description</label>
              <textarea
                id="node-desc"
                className="textarea-input"
                rows={4}
                value={activeNode.description}
                onChange={(e) =>
                  updateActiveNode((n) => ({ ...n, description: e.target.value }))
                }
                placeholder="Describe this node"
              />
            </div>

            <div className="modal-section">
              <label className="field-label" htmlFor="node-tags">Tags</label>
              <input
                id="node-tags"
                className="text-input"
                type="text"
                value={activeNode.tags.join(', ')}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                  updateActiveNode((n) => ({ ...n, tags: parts }))
                }}
                placeholder="comma,separated,tags"
              />
              {activeNode.tags.length > 0 && (
                <div className="tags">
                  {activeNode.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="action-btn btn-red" onClick={deleteActiveNode}>Delete node</button>
            </div>
          </div>
        </div>
      )}

      {activeEdge && (
        <>
          {/* Inline edge menu */}
          {edgeMenu && edgeMenu.edgeId === activeEdge.id && (
            <div
              className="edge-menu"
              style={{ left: edgeMenu.x, top: edgeMenu.y, position: 'absolute' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="section">
                <span className="label">Direction</span>
                {(['none','source-to-target','target-to-source'] as const).map((dir) => (
                  <button
                    key={dir}
                    className={`chip ${activeEdge.direction === dir ? 'chip-selected' : ''}`}
                    onClick={() => updateActiveEdge((ed) => ({ ...ed, direction: dir }))}
                  >
                    {dir === 'none' ? 'No arrow' : dir === 'source-to-target' ? '→' : '←'}
                  </button>
                ))}
              </div>
              <div className="section">
                <span className="label">Style</span>
                {(['straight','curved'] as const).map((style) => (
                  <button
                    key={style}
                    className={`chip ${activeEdge.curve === style ? 'chip-selected' : ''}`}
                    onClick={() => updateActiveEdge((ed) => ({ ...ed, curve: style }))}
                  >
                    {style}
                  </button>
                ))}
              </div>
              <div className="section">
                <span className="label">Keywords</span>
                {KEYWORD_OPTIONS.map((k) => {
                  const on = activeEdge.keywords.includes(k)
                  return (
                    <button key={k} className={`chip ${on ? 'chip-selected' : ''}`} onClick={() => toggleEdgeKeyword(k)}>
                      {k}
        </button>
                  )
                })}
              </div>
              <div className="section">
                <span className="label">Note</span>
                <input
                  className="text-input"
                  type="text"
                  value={activeEdge.note}
                  onChange={(e) => updateActiveEdge((edge) => ({ ...edge, note: e.target.value }))}
                  placeholder="Add a note for this link"
                />
              </div>
            </div>
          )}
        </>
      )}

      {showDocs && (
        <div className="modal-overlay" onClick={() => setShowDocs(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Welcome to Circuitboard</h3>
              <button className="close-btn" onClick={() => setShowDocs(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <div className="field-label">Overview</div>
              <div>
                Circuitboard helps you visualize systems using nodes (circles) and links (lines/arrows). Use the left pill to add nodes and choose colors. Drag nodes to arrange. Click a node to edit its name, color, size, description, and tags.
              </div>
            </div>
            <div className="modal-section">
              <div className="field-label">Creating & Editing</div>
              <ul>
                <li>Click + to add a node. Choose a color or use the rainbow swatch for a custom color.</li>
                <li>Drag a node to move it. Handles on the node edges let you create links to other nodes.</li>
                <li>Click a link to edit direction (→ or ←), style (straight/curved), keywords (increases/decreases), and notes.</li>
                <li>Click a node to rename, change color/size, add description/tags, or delete it.</li>
              </ul>
            </div>
            <div className="modal-section">
              <div className="field-label">Canvas</div>
              <ul>
                <li>Pan: click and drag the background.</li>
                <li>Zoom: use the controls bottom-left.</li>
                <li>Save/Open: top-right buttons generate a code or load one to restore a scene.</li>
              </ul>
            </div>
            <div className="modal-section">
              <div className="field-label">Sparky (AI)</div>
              <ul>
                <li>Open the chat bottom-right. Modes: Agent (builds), Chat (guidance), Insights (analyzes).</li>
                <li>Agent mode plans first, then builds. Turn Auto-apply off to review before applying.</li>
                <li>Ask things like “Create Acquisition → Activation with increases” or “Summarize the current bottlenecks”.</li>
              </ul>
            </div>
            <div className="modal-section">
              <div className="field-label">Tips</div>
              <ul>
                <li>Use tags and notes to annotate links and nodes for better clarity.</li>
                <li>Curved arrows help avoid overlaps; increase node size for emphasis.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {showUpdates && (
        <div className="modal-overlay" onClick={() => setShowUpdates(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Updates</h3>
              <button className="close-btn" onClick={() => setShowUpdates(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <div>No new updates.</div>
            </div>
          </div>
        </div>
      )}

      {showSave && (
        <div className="modal-overlay" onClick={() => setShowSave(false)}>
          <div className="modal save-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save scene</h3>
              <button className="close-btn" onClick={() => setShowSave(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <label className="field-label">Copy this code</label>
              <textarea readOnly value={saveCode} onFocus={(e) => e.currentTarget.select()} />
            </div>
          </div>
        </div>
      )}

      {showOpen && (
        <div className="modal-overlay" onClick={() => setShowOpen(false)}>
          <div className="modal open-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Open scene</h3>
              <button className="close-btn" onClick={() => setShowOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <label className="field-label">Paste code</label>
              <textarea value={openCode} onChange={(e) => setOpenCode(e.target.value)} placeholder="Paste code here" />
              {openError && <div className="error-text">{openError}</div>}
            </div>
            <div className="modal-section">
              <button className="action-btn" onClick={loadSceneFromCode}>Load</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reset scene?</h3>
              <button className="close-btn" onClick={() => setShowResetConfirm(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <div>Are you sure you want to clear all nodes and links?</div>
            </div>
            <div className="modal-section" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="action-btn" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="action-btn btn-red" onClick={resetScene}>Confirm reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={zoomOut} aria-label="Zoom out">-</button>
        <div className="zoom-level">{Math.round(zoom * 100)}%</div>
        <button className="zoom-btn" onClick={zoomIn} aria-label="Zoom in">+</button>
      </div>

      {/* Chat button */}
      <button className="chat-button" onClick={() => setShowChat((v) => !v)} aria-label="Open chat">💬</button>

      {showChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <div>Sparky</div>
            <div className="right">
              <div className="mode-toggle">
                <button className={`mode-btn ${mode === 'agent' ? 'active' : ''}`} onClick={() => setMode('agent')}>Agent</button>
                <button className={`mode-btn ${mode === 'chat' ? 'active' : ''}`} onClick={() => setMode('chat')}>Chat</button>
                <button className={`mode-btn ${mode === 'insights' ? 'active' : ''}`} onClick={() => setMode('insights')}>Insights</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
                Auto-apply
              </label>
              <button className="close-btn" onClick={() => setShowChat(false)} aria-label="Close">×</button>
            </div>
          </div>
          <div className="chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <div className="bubble-avatar">{m.role === 'assistant' ? '🤖' : '🧑'}</div>
                <div className={`msg ${m.role}`}>{m.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {pending && !autoApply && (
            <div className="chat-pending">
              <div>AI plan ready. Apply the suggested changes?</div>
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => setPending(null)}>Dismiss</button>
                <button className="btn btn-primary" onClick={() => { generateAndApplyActions(pending.planText) }}>Apply</button>
              </div>
            </div>
          )}
          <div className="chat-input">
            <div className="composer">
              <div className="mode-toggle-pill" onClick={() => setShowModeMenu((v) => !v)}>{mode.charAt(0).toUpperCase() + mode.slice(1)} ▾</div>
              <div className="composer-input">
                <textarea
                  className="chat-textarea"
                  placeholder="Chat with Sparky"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (!isSending) sendChat()
                    }
                  }}
                />
                <button className="send-circle" disabled={isSending} onClick={sendChat} aria-label="Send">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 12H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 6L20 12L14 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            {showModeMenu && (
              <div className="mode-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="mode-item" onClick={() => { setMode('agent'); setShowModeMenu(false) }}>Agent</div>
                <div className="mode-item" onClick={() => { setMode('chat'); setShowModeMenu(false) }}>Chat</div>
                <div className="mode-item" onClick={() => { setMode('insights'); setShowModeMenu(false) }}>Insights</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function cryptoRandomId(): string {
  if ('crypto' in globalThis && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

export default App

const KEYWORD_OPTIONS = ['increases', 'decreases'] as const
