import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import './App.css'

function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string
}

function isBackgroundTarget(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false
  // Not background if clicking inside any interactive element
  if (target.closest('.node, .sticky-note, .handle, .sticky-resize, .node-resize, .edge, .edge-menu, .mode-dropdown, .chat-panel, .modal, .floating-pill, .zoom-controls')) {
    return false
  }
  return true
}

type NodeItem = {
  id: string
  x: number
  y: number
  color: string
  title: string
  description: string
  tags: string[]
  size: number
  textColor?: '#000000' | '#ffffff'
}

type EdgeItem = {
  id: string
  sourceId: string
  targetId: string
  direction: 'none' | 'source-to-target' | 'target-to-source'
  keywords: string[]
  note: string
  controlX?: number
  controlY?: number
}

type StickyNote = {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
}

// AI chat removed

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
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([])
  const [activeStickyId, setActiveStickyId] = useState<string | null>(null)
  const [draggingStickyId, setDraggingStickyId] = useState<string | null>(null)
  const [stickyDragOffset, setStickyDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const [resizingStickyId, setResizingStickyId] = useState<string | null>(null)
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const resizeStartRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null)
  const [nodeResizeCorner, setNodeResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const nodeResizeStartRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    origSize: number
  } | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 2
  const ZOOM_STEP = 0.1
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState<boolean>(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const canvasDidPanRef = useRef<boolean>(false)
  const [draggingEdgeControlId, setDraggingEdgeControlId] = useState<string | null>(null)
  const edgeDragStartRef = useRef<{ id: string; startX: number; startY: number } | null>(null)

  function setZoomAtCenter(nextZoom: number) {
    const container = canvasRef.current
    if (!container) {
      setZoom(nextZoom)
      return
    }
    const rect = container.getBoundingClientRect()
    const sx = rect.width / 2
    const sy = rect.height / 2
    const prevZoom = zoom
    const prevPan = pan
    const sceneX = sx / prevZoom - prevPan.x
    const sceneY = sy / prevZoom - prevPan.y
    setZoom(nextZoom)
    setPan({ x: sx / nextZoom - sceneX, y: sy / nextZoom - sceneY })
  }

  function zoomIn() {
    const next = Math.min(ZOOM_MAX, parseFloat((zoom + ZOOM_STEP).toFixed(2)))
    if (next !== zoom) setZoomAtCenter(next)
  }

  function zoomOut() {
    const next = Math.max(ZOOM_MIN, parseFloat((zoom - ZOOM_STEP).toFixed(2)))
    if (next !== zoom) setZoomAtCenter(next)
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
  // AI chat removed
  const [showDocs, setShowDocs] = useState<boolean>(false)
  const [showUpdates, setShowUpdates] = useState<boolean>(false)
  const [showStickyEditor, setShowStickyEditor] = useState<boolean>(false)
  const [guidePage, setGuidePage] = useState<'start' | 'nodes' | 'links' | 'notes' | 'canvas' | 'io' | 'tips'>('start')
  const [guideIconFailed, setGuideIconFailed] = useState<boolean>(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const interactionStartRef = useRef<{ x: number; y: number } | null>(null)
  const didDragRef = useRef<boolean>(false)
  const trashRef = useRef<HTMLDivElement | null>(null)
  const [isOverTrash, setIsOverTrash] = useState<boolean>(false)
  const suppressCanvasClickRef = useRef<boolean>(false)

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) ?? null,
    [activeNodeId, nodes]
  )
  const activeEdge = useMemo(
    () => edges.find((e) => e.id === activeEdgeId) ?? null,
    [activeEdgeId, edges]
  )
  const activeSticky = useMemo(
    () => stickyNotes.find((s) => s.id === activeStickyId) ?? null,
    [activeStickyId, stickyNotes]
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
    if (draggingStickyId && stickyDragOffset) {
      const newX = pointerX - stickyDragOffset.dx
      const newY = pointerY - stickyDragOffset.dy
      setStickyNotes((prev) => prev.map((s) => (s.id === draggingStickyId ? { ...s, x: newX, y: newY } : s)))
      const start = interactionStartRef.current
      if (start) {
        const mdx = pointerX - start.x
        const mdy = pointerY - start.y
        if (!didDragRef.current && (Math.abs(mdx) > 3 || Math.abs(mdy) > 3)) didDragRef.current = true
      }
      return
    }
    if (resizingStickyId && resizeCorner && resizeStartRef.current) {
      const { startX, startY, origX, origY, origW, origH } = resizeStartRef.current
      const dx = pointerX - startX
      const dy = pointerY - startY
      setStickyNotes((prev) => prev.map((s) => {
        if (s.id !== resizingStickyId) return s
        let x = origX
        let y = origY
        let w = origW
        let h = origH
        if (resizeCorner === 'se') { w = Math.max(100, origW + dx); h = Math.max(80, origH + dy) }
        if (resizeCorner === 'sw') { w = Math.max(100, origW - dx); h = Math.max(80, origH + dy); x = origX + dx }
        if (resizeCorner === 'ne') { w = Math.max(100, origW + dx); h = Math.max(80, origH - dy); y = origY + dy }
        if (resizeCorner === 'nw') { w = Math.max(100, origW - dx); h = Math.max(80, origH - dy); x = origX + dx; y = origY + dy }
        return { ...s, x, y, width: w, height: h }
      }))
      if (!didDragRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDragRef.current = true
      return
    }
    if (resizingNodeId && nodeResizeCorner && nodeResizeStartRef.current) {
      const { startX, startY, origX, origY, origSize } = nodeResizeStartRef.current
      const dx = pointerX - startX
      const dy = pointerY - startY
      const clamp = (v: number) => Math.min(200, Math.max(24, v))
      setNodes((prev) => prev.map((n) => {
        if (n.id !== resizingNodeId) return n
        let size = origSize
        let x = origX
        let y = origY
        if (nodeResizeCorner === 'se') {
          size = clamp(Math.max(origSize + dx, origSize + dy))
        }
        if (nodeResizeCorner === 'sw') {
          size = clamp(Math.max(origSize - dx, origSize + dy))
          x = origX + (origSize - size)
        }
        if (nodeResizeCorner === 'ne') {
          size = clamp(Math.max(origSize + dx, origSize - dy))
          y = origY + (origSize - size)
        }
        if (nodeResizeCorner === 'nw') {
          size = clamp(Math.max(origSize - dx, origSize - dy))
          x = origX + (origSize - size)
          y = origY + (origSize - size)
        }
        return { ...n, x, y, size }
      }))
      if (!didDragRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDragRef.current = true
      return
    }
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
      if (!canvasDidPanRef.current && (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3)) {
        canvasDidPanRef.current = true
        suppressCanvasClickRef.current = true
      }
    }
    // Dragging edge control point to curve edges
    if (draggingEdgeControlId) {
      setEdges((prev) => prev.map((ed) => ed.id === draggingEdgeControlId ? { ...ed, controlX: pointerX, controlY: pointerY } : ed))
      const start = interactionStartRef.current
      if (start) {
        const dx = pointerX - start.x
        const dy = pointerY - start.y
        if (!didDragRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDragRef.current = true
      }
      return
    }
    // Promote to dragging if we started on an edge and moved enough
    if (edgeDragStartRef.current) {
      const { id, startX, startY } = edgeDragStartRef.current
      const dx = pointerX - startX
      const dy = pointerY - startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setDraggingEdgeControlId(id)
        interactionStartRef.current = { x: startX, y: startY }
        didDragRef.current = true
        // initialize control to current pointer
        setEdges((prev) => prev.map((ed) => ed.id === id ? { ...ed, controlX: pointerX, controlY: pointerY } : ed))
      }
    }
    // Over-trash detection during drag
    if ((draggingNodeId || draggingStickyId) && trashRef.current) {
      const r = trashRef.current.getBoundingClientRect()
      // Expand hitbox slightly for easier drops
      const expand = 6
      const over = e.clientX >= r.left - expand && e.clientX <= r.right + expand && e.clientY >= r.top - expand && e.clientY <= r.bottom + expand
      if (over !== isOverTrash) setIsOverTrash(over)
    } else {
      if (isOverTrash) setIsOverTrash(false)
    }
  }

  function onPointerUp() {
    // If dropping into trash, delete dragged item
    if (isOverTrash) {
      if (draggingNodeId) {
        setNodes((prev) => prev.filter((n) => n.id !== draggingNodeId))
        setEdges((prev) => prev.filter((e) => e.sourceId !== draggingNodeId && e.targetId !== draggingNodeId))
        setActiveNodeId(null)
      }
      if (draggingStickyId) {
        setStickyNotes((prev) => prev.filter((s) => s.id !== draggingStickyId))
        setActiveStickyId(null)
      }
    }
    setDraggingNodeId(null)
    setDragOffset(null)
    setDraggingStickyId(null)
    setStickyDragOffset(null)
    setResizingStickyId(null)
    setResizeCorner(null)
    resizeStartRef.current = null
    setResizingNodeId(null)
    setNodeResizeCorner(null)
    nodeResizeStartRef.current = null
    interactionStartRef.current = null
    // no implicit note creation here; handled in onClick
    setIsPanning(false)
    panStartRef.current = null
    pointerStartRef.current = null
    canvasDidPanRef.current = false
    setIsOverTrash(false)
    setDraggingEdgeControlId(null)
    edgeDragStartRef.current = null
    // If we were linking, finalize on pointer up within canvas using last pointer pos
    if (linkingFrom && pointerPos) {
      finalizeLinkingAt(pointerPos.x, pointerPos.y)
      // Suppress the subsequent background click so no sticky is created
      suppressCanvasClickRef.current = true
    }
    setLinkingFrom(null)
  }

  function openEditor(nodeId: string) {
    setActiveNodeId(nodeId)
    setActiveEdgeId(null)
    setActiveStickyId(null)
  }

  function closeEditor() {
    setActiveNodeId(null)
    setActiveEdgeId(null)
    setEdgeMenu(null)
    setActiveStickyId(null)
    setShowStickyEditor(false)
  }

  function updateActiveNode(updater: (n: NodeItem) => NodeItem) {
    if (!activeNodeId) return
    setNodes((prev) => prev.map((n) => (n.id === activeNodeId ? updater(n) : n)))
  }

  function updateActiveSticky(updater: (s: StickyNote) => StickyNote) {
    if (!activeStickyId) return
    setStickyNotes((prev) => prev.map((s) => (s.id === activeStickyId ? updater(s) : s)))
  }

  function addStickyAt(px: number, py: number) {
    const id = cryptoRandomId()
    const note: StickyNote = {
      id,
      x: px - 120,
      y: py - 80,
      width: 240,
      height: 160,
      content: ''
    }
    setStickyNotes((prev) => [...prev, note])
    setActiveStickyId(id)
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
      const sourceId = linkingFrom.nodeId
      const targetId = target.id
      setEdges((prev) => {
        const exists = prev.some((e) => (
          (e.sourceId === sourceId && e.targetId === targetId) ||
          (e.sourceId === targetId && e.targetId === sourceId)
        ))
        if (exists) return prev
      const id = cryptoRandomId()
      const newEdge: EdgeItem = {
        id,
          sourceId,
          targetId,
        direction: 'none',
        keywords: [],
        note: '',
          controlX: undefined,
          controlY: undefined,
      }
        return [...prev, newEdge]
      })
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
      stickyNotes,
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
      if (Array.isArray(data.stickyNotes)) setStickyNotes(data.stickyNotes)
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
    setStickyNotes([])
    setActiveStickyId(null)
  }

  async function exportPNG() {
    const el = canvasRef.current
    if (!el) return
    // Render the visible canvas area to a high-DPI image
    const canvas = await html2canvas(el, { useCORS: true, scale: 2 })
    const url = canvas.toDataURL('image/png')
    const ts = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = `circuitboard-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  }

  // --- Chat / AI ---
  // AI chat removed

  // Global pointer move listener to improve trash hover detection across elements
  useEffect(() => {
    function onWindowPointerMove(ev: PointerEvent) {
      if (!(draggingNodeId || draggingStickyId)) return
      const el = trashRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const expand = 6
      const over = ev.clientX >= r.left - expand && ev.clientX <= r.right + expand && ev.clientY >= r.top - expand && ev.clientY <= r.bottom + expand
      if (over !== isOverTrash) setIsOverTrash(over)
    }
    window.addEventListener('pointermove', onWindowPointerMove)
    return () => window.removeEventListener('pointermove', onWindowPointerMove)
  }, [draggingNodeId, draggingStickyId, isOverTrash])

  // AI chat removed

  // AI chat removed

  // AI chat removed

  // Intent detection: only build when user asks for it explicitly
  // AI chat removed

  // AI chat removed

  // AI chat removed

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
        <img src="circuit.png" alt="" className="brand-stars" aria-hidden />
      </div>

      <div className="top-left-actions">
        <button className="round-icon" title="Guide" onClick={() => setShowDocs(true)} aria-label="Open guide">
          {!guideIconFailed ? (
            <img src="book.svg" width={20} height={20} alt="" onError={() => setGuideIconFailed(true)} />
          ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 4h10v16H6z" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M4 6h2v12H4z" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M8 4v16" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          )}
        </button>
        <button className="round-icon" title="Updates" onClick={() => setShowUpdates(true)} aria-label="Open updates">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6h16v12H4z" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M4 6l8 6 8-6" stroke="#374151" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="top-actions">
        <button className="action-btn btn-yellow" onClick={exportPNG}>Export</button>
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
          // Start panning only if clicking true background (exclude nodes, notes, handles, UI)
          if (isBackgroundTarget(e.target)) {
            setIsPanning(true)
            panStartRef.current = { ...pan }
            pointerStartRef.current = { x: e.clientX, y: e.clientY }
            canvasDidPanRef.current = false
          }
        }}
        onPointerUp={(e) => {
          const didPan = canvasDidPanRef.current
          onPointerUp()
          // If we panned or dragged an edge, prevent the immediate click from creating a sticky
          if (didPan || draggingEdgeControlId || edgeDragStartRef.current) {
            e.stopPropagation()
            suppressCanvasClickRef.current = true
            edgeDragStartRef.current = null
          }
        }}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          setActiveNodeId(null)
          setActiveEdgeId(null)
          setActiveStickyId(null)
          // Suppress background actions after dragging/panning
          if (didDragRef.current || canvasDidPanRef.current || suppressCanvasClickRef.current || draggingEdgeControlId || edgeDragStartRef.current) {
            didDragRef.current = false
            canvasDidPanRef.current = false
            suppressCanvasClickRef.current = false
            edgeDragStartRef.current = null
            return
          }
          if (isBackgroundTarget(e.target)) {
            const container = canvasRef.current
            if (!container) return
            const rect = container.getBoundingClientRect()
            const px = (e.clientX - rect.left) / zoom - pan.x
            const py = (e.clientY - rect.top) / zoom - pan.y
            addStickyAt(px, py)
          }
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
            const control = {
              x: typeof edge.controlX === 'number' ? edge.controlX : mid.x,
              y: typeof edge.controlY === 'number' ? edge.controlY : mid.y,
            }
            const isSelected = activeEdgeId === edge.id
            const keywordsText = edge.keywords.join(', ')
            const labelText = [keywordsText, edge.note].filter(Boolean).join(' • ')
            return (
              <g key={edge.id} className={`edge ${isSelected ? 'selected' : ''}`}
                 onPointerDown={(e) => {
                   // Prepare potential edge curve drag without immediately selecting
                   e.stopPropagation()
                   edgeDragStartRef.current = { id: edge.id, startX: mid.x, startY: mid.y }
                 }}
                 onClick={(e) => {
                   e.stopPropagation()
                   // Avoid click firing right after a drag
                   if (didDragRef.current) { didDragRef.current = false; return }
                   setActiveEdgeId(edge.id)
                   setActiveNodeId(null)
                   setEdgeMenu({ edgeId: edge.id, x: mid.x, y: mid.y - 16 })
                 }}>
                <path d={`M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`} fill="none" stroke="#374151" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const target = e.currentTarget as SVGPathElement
                    try { target.setPointerCapture(e.pointerId) } catch {}
                    setDraggingEdgeControlId(edge.id)
                    interactionStartRef.current = { x: control.x, y: control.y }
                    didDragRef.current = false
                  }}
                  onPointerUp={(e) => {
                    try { (e.currentTarget as SVGPathElement).releasePointerCapture(e.pointerId) } catch {}
                    setDraggingEdgeControlId(null)
                    // Suppress the next background click so no sticky note is created
                    suppressCanvasClickRef.current = true
                  }}
                />
                {/* Arrowheads as open V-shapes at the tip */}
                {edge.direction === 'source-to-target' && (() => {
                  const arrowLength = 12
                  const arrowWidth = 10
                  const tx = b.x - control.x
                  const ty = b.y - control.y
                  const tlen = Math.hypot(tx, ty) || 1
                  const tux = tx / tlen
                  const tuy = ty / tlen
                  const tipX = b.x
                  const tipY = b.y
                  const baseX = tipX - tux * arrowLength
                  const baseY = tipY - tuy * arrowLength
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
                  const tx = control.x - a.x
                  const ty = control.y - a.y
                  const tlen = Math.hypot(tx, ty) || 1
                  const tux = tx / tlen
                  const tuy = ty / tlen
                  const tipX = a.x
                  const tipY = a.y
                  const baseX = tipX + tux * arrowLength
                  const baseY = tipY + tuy * arrowLength
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
        {stickyNotes.map((note) => (
          <div
            key={note.id}
            className={`sticky-note ${draggingStickyId === note.id ? 'dragging' : ''}`}
            style={{
              transform: `translate(${note.x}px, ${note.y}px)`,
              width: `${note.width}px`,
              height: `${note.height}px`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              const container = canvasRef.current
              if (!container) return
              const rect = container.getBoundingClientRect()
              const pointerX = (e.clientX - rect.left) / zoom - pan.x
              const pointerY = (e.clientY - rect.top) / zoom - pan.y
              setDraggingStickyId(note.id)
              setStickyDragOffset({ dx: pointerX - note.x, dy: pointerY - note.y })
              interactionStartRef.current = { x: pointerX, y: pointerY }
              didDragRef.current = false
              ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              onPointerMove(e)
            }}
            onPointerUp={(e) => {
              try { (e.target as HTMLDivElement).releasePointerCapture(e.pointerId) } catch {}
              onPointerUp()
            }}
            onDoubleClick={() => {
              setActiveStickyId(note.id)
              setShowStickyEditor(true)
              setActiveNodeId(null)
              setActiveEdgeId(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (didDragRef.current) {
                didDragRef.current = false
                return
              }
              setActiveStickyId(note.id)
              setActiveNodeId(null)
              setActiveEdgeId(null)
            }}
            role="button"
            aria-label="Sticky note"
          >
            <div className="sticky-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(note.content || '')) }} />
            {(['nw','ne','sw','se'] as const).map((corner) => (
              <div
                key={corner}
                className={`sticky-resize sticky-${corner}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const container = canvasRef.current
                  if (!container) return
                  const rect = container.getBoundingClientRect()
                  const pointerX = (e.clientX - rect.left) / zoom - pan.x
                  const pointerY = (e.clientY - rect.top) / zoom - pan.y
                  setResizingStickyId(note.id)
                  setResizeCorner(corner)
                  resizeStartRef.current = { startX: pointerX, startY: pointerY, origX: note.x, origY: note.y, origW: note.width, origH: note.height }
                  didDragRef.current = false
                  ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
                }}
                onClick={(e) => { e.stopPropagation() }}
              />
            ))}
          </div>
        ))}
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
            onPointerMove={(e) => {
              onPointerMove(e)
            }}
            onPointerUp={(e) => {
              try { (e.target as HTMLDivElement).releasePointerCapture(e.pointerId) } catch {}
              onPointerUp()
            }}
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
            {/* Node resize handles */}
            {(['nw','ne','sw','se'] as const).map((corner) => (
              <div
                key={corner}
                className={`node-resize node-${corner}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const container = canvasRef.current
                  if (!container) return
                  const rect = container.getBoundingClientRect()
                  const pointerX = (e.clientX - rect.left) / zoom - pan.x
                  const pointerY = (e.clientY - rect.top) / zoom - pan.y
                  setResizingNodeId(node.id)
                  setNodeResizeCorner(corner)
                  nodeResizeStartRef.current = { startX: pointerX, startY: pointerY, origX: node.x, origY: node.y, origSize: node.size }
                  didDragRef.current = false
                  ;(e.target as HTMLDivElement).setPointerCapture(e.pointerId)
                }}
                onClick={(e) => { e.stopPropagation() }}
              />
            ))}
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
              onPointerUp={() => { /* Let global onPointerUp finalize once */ }}
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
              onPointerUp={() => { /* Let global onPointerUp finalize once */ }}
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
              onPointerUp={() => { /* Let global onPointerUp finalize once */ }}
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
              onPointerUp={() => { /* Let global onPointerUp finalize once */ }}
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

      {activeSticky && showStickyEditor && (
        <div className="modal-overlay" onClick={closeEditor}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit note</h3>
              <button className="close-btn" onClick={closeEditor} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <label className="field-label" htmlFor="sticky-content">Markdown</label>
              <textarea
                id="sticky-content"
                className="textarea-input"
                rows={8}
                value={activeSticky.content}
                onChange={(e) => updateActiveSticky((s) => ({ ...s, content: e.target.value }))}
                placeholder="Write in Markdown..."
              />
            </div>
            <div className="modal-section">
              <label className="field-label">Preview</label>
              <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(activeSticky.content || '')) }} />
            </div>
            <div className="modal-section" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="action-btn btn-red" onClick={() => {
                if (!activeStickyId) return
                const ok = window.confirm('Delete this note?')
                if (!ok) return
                setStickyNotes((prev) => prev.filter((s) => s.id !== activeStickyId))
                setActiveStickyId(null)
                setShowStickyEditor(false)
              }}>Delete note</button>
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
              {/* Style selection removed; drag the edge to curve */}
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
              <h3>Guide</h3>
              <button className="close-btn" onClick={() => setShowDocs(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-section">
              <div className="field-label">Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className={`chip ${guidePage === 'start' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('start')}>Getting started</button>
                <button className={`chip ${guidePage === 'nodes' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('nodes')}>Nodes</button>
                <button className={`chip ${guidePage === 'links' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('links')}>Links</button>
                <button className={`chip ${guidePage === 'notes' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('notes')}>Sticky notes</button>
                <button className={`chip ${guidePage === 'canvas' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('canvas')}>Canvas</button>
                <button className={`chip ${guidePage === 'io' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('io')}>Save/Open/Export</button>
                <button className={`chip ${guidePage === 'tips' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('tips')}>Tips</button>
              </div>
            </div>
            {guidePage === 'start' && (
            <div className="modal-section">
                <div className="field-label">Getting started</div>
                <ul>
                  <li>Add nodes with the + button on the left pill. Choose a color from the palette; use the rainbow swatch for a custom color.</li>
                  <li>Drag nodes to arrange your system. Use panning/zoom to frame the area you care about.</li>
                  <li>Create links using the small circular handles on a node; release over another node to connect.</li>
                  <li>Double‑click a node or note to open its editor. Press Esc to quickly close modals.</li>
              </ul>
            </div>
            )}
            {guidePage === 'nodes' && (
            <div className="modal-section">
                <div className="field-label">Nodes</div>
                <ul>
                  <li>Name, Color, Size: define identity and emphasis. Larger nodes draw attention; white nodes get a subtle border; black nodes invert text color for readability.</li>
                  <li>Description: add context for teammates. Keep it short; use notes for longer text.</li>
                  <li>Tags: comma‑separated labels (e.g., marketing, backend). Tags render as chips and help scanning.</li>
                  <li>Resize: drag any of the four corner squares. Sizes are clamped between 24 and 200 for readability.</li>
                  <li>Delete: use the Delete node button in the editor or drag the node to the trash circle at the bottom.</li>
              </ul>
            </div>
            )}
            {guidePage === 'links' && (
            <div className="modal-section">
                <div className="field-label">Links</div>
                <ul>
                  <li>Create: click a node handle (left/right/top/bottom) and release on another node.</li>
                  <li>Direction: none, → (source→target), or ← (target→source). Set this in the inline edge menu.</li>
                  <li>Style: straight or curved. Curved links reduce overlap and improve readability in dense areas.</li>
                  <li>Keywords: toggle common semantics like “increases” or “decreases” to clarify the relationship.</li>
                  <li>Notes: add a short free‑text label shown near the link midpoint.</li>
                  <li>Edit: click a link to open the inline menu at its midpoint; click outside to dismiss.</li>
              </ul>
            </div>
            )}
            {guidePage === 'notes' && (
              <div className="modal-section">
                <div className="field-label">Sticky notes</div>
                <ul>
                  <li>Create: click the empty canvas to add a note at that position.</li>
                  <li>Markdown: supports headings, emphasis, lists, and code. A live preview renders next to the editor.</li>
                  <li>Resize: drag any corner square; notes keep their content layout during resize.</li>
                  <li>Delete: drag a note onto the trash circle or use the Delete button in the editor.</li>
                </ul>
              </div>
            )}
            {guidePage === 'canvas' && (
              <div className="modal-section">
                <div className="field-label">Canvas & navigation</div>
                <ul>
                  <li>Pan: click‑and‑drag the background. Cursor changes to indicate panning state.</li>
                  <li>Zoom: use − / + controls bottom‑left. Zoom is centered on the viewport and preserves scene position.</li>
                  <li>Precision: drags and pans suppress the next click to avoid accidental note creation.</li>
                </ul>
              </div>
            )}
            {guidePage === 'io' && (
              <div className="modal-section">
                <div className="field-label">Save, open, and export</div>
                <ul>
                  <li>Save: generates a compact code you can copy. It includes nodes, links, notes, pan, and zoom.</li>
                  <li>Open: paste a code to restore the full scene exactly as saved.</li>
                  <li>Export: downloads a high‑DPI PNG of the current canvas (uses your current pan/zoom).</li>
                </ul>
              </div>
            )}
            {guidePage === 'tips' && (
            <div className="modal-section">
              <div className="field-label">Tips</div>
              <ul>
                  <li>Hierarchy: use size and color to signal importance; avoid too many bright colors.</li>
                  <li>Layout: space related nodes evenly; use curved links to avoid visual tangles.</li>
                  <li>Semantics: prefer keywords and short notes over long paragraphs on links.</li>
              </ul>
            </div>
            )}
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
              <div className="field-label">Version</div>
              <div>1.0.0</div>
            </div>
            <div className="modal-section">
              <div className="field-label">Current features</div>
              <ul>
                <li>Nodes: add, drag, resize, edit name/color/size/description/tags.</li>
                <li>Links: create, set direction (→/←), style (straight/curved), keywords, note.</li>
                <li>Sticky notes: add, resize, edit in Markdown with live preview.</li>
                <li>Canvas: pan and zoom with on-screen controls.</li>
                <li>Save/Open: export scene to a code and restore from it.</li>
                <li>Trash zone: drop a dragging node or note to delete quickly.</li>
                <li>Color tools: palette and custom color picker.</li>
                <li>Export: download the current canvas as an image.</li>
                <li>Docs and Updates modals for guidance and messages.</li>
              </ul>
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

      {/* Trash drop zone */}
      {(draggingNodeId || draggingStickyId) && (
        <div ref={trashRef} className={`trash-zone ${isOverTrash ? 'over' : ''}`} aria-label="Trash">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      )}

      {/* AI chat removed */}

      {/* Footer credit */}
      <div className="made-with-love" aria-hidden>
        Made with love by Diogo Baptista
              </div>
    </div>
  )
}

function cryptoRandomId(): string {
  if ('crypto' in globalThis && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

export default App

const KEYWORD_OPTIONS = ['increases', 'decreases'] as const
