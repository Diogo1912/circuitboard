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

type HistoryState = {
  nodes: NodeItem[]
  edges: EdgeItem[]
  stickyNotes: StickyNote[]
}

function App() {
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0])
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
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
  
  // Canvas bounds - 9x viewport size at 100% zoom
  const CANVAS_BOUNDS = {
    minX: -window.innerWidth * 4,
    maxX: window.innerWidth * 4,
    minY: -window.innerHeight * 4,
    maxY: window.innerHeight * 4
  }
  
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
    setPan(constrainPan({ x: sx / nextZoom - sceneX, y: sy / nextZoom - sceneY }))
  }

  function zoomIn() {
    const next = Math.min(ZOOM_MAX, parseFloat((zoom + ZOOM_STEP).toFixed(2)))
    if (next !== zoom) setZoomAtCenter(next)
  }

  function zoomOut() {
    const next = Math.max(ZOOM_MIN, parseFloat((zoom - ZOOM_STEP).toFixed(2)))
    if (next !== zoom) setZoomAtCenter(next)
  }

  function constrainPan(newPan: { x: number; y: number }): { x: number; y: number } {
    return {
      x: Math.max(CANVAS_BOUNDS.minX, Math.min(CANVAS_BOUNDS.maxX, newPan.x)),
      y: Math.max(CANVAS_BOUNDS.minY, Math.min(CANVAS_BOUNDS.maxY, newPan.y))
    }
  }

  function centerView() {
    setPan({ x: 0, y: 0 })
  }

  function saveToHistory() {
    const newState: HistoryState = {
      nodes: [...nodes],
      edges: [...edges],
      stickyNotes: [...stickyNotes]
    }
    
    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newState)
    
    // Limit history to 50 states
    if (newHistory.length > 50) {
      newHistory.shift()
    } else {
      setHistoryIndex(historyIndex + 1)
    }
    
    setHistory(newHistory)
  }

  function undo() {
    if (historyIndex >= 0) {
      const previousState = history[historyIndex]
      setNodes(previousState.nodes)
      setEdges(previousState.edges)
      setStickyNotes(previousState.stickyNotes)
      setHistoryIndex(historyIndex - 1)
      
      // Clear selections after undo
      setSelectedNodes(new Set())
      setSelectedStickies(new Set())
      setActiveNodeId(null)
      setActiveEdgeId(null)
      setActiveStickyId(null)
    }
  }


  function startEditingSystemName() {
    setSystemNameInput(systemName)
    setIsEditingSystemName(true)
  }

  function saveSystemName() {
    const trimmedName = systemNameInput.trim()
    if (trimmedName) {
      setSystemName(trimmedName)
    }
    setIsEditingSystemName(false)
  }

  function cancelEditingSystemName() {
    setSystemNameInput(systemName)
    setIsEditingSystemName(false)
  }

  const [linkingFrom, setLinkingFrom] = useState<
    | { nodeId: string; side: 'left' | 'right' | 'top' | 'bottom' }
    | null
  >(null)
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [showSave, setShowSave] = useState<boolean>(false)
  const [showOpen, setShowOpen] = useState<boolean>(false)
  const [saveCode, setSaveCode] = useState<string>("")
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [openCode, setOpenCode] = useState<string>("")
  const [tagInputValue, setTagInputValue] = useState<string>("")
  const [openError, setOpenError] = useState<string | null>(null)
  const [showMinimap, setShowMinimap] = useState<boolean>(false)
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false)
  const [systemName, setSystemName] = useState<string>("Circuitboard")
  const [isEditingSystemName, setIsEditingSystemName] = useState<boolean>(false)
  const [systemNameInput, setSystemNameInput] = useState<string>("Circuitboard")
  const [interactionMode, setInteractionMode] = useState<'hand' | 'mouse'>('hand')
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [selectedStickies, setSelectedStickies] = useState<Set<string>>(new Set())
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  
  // AI chat removed
  const [showDocs, setShowDocs] = useState<boolean>(false)
  const [showUpdates, setShowUpdates] = useState<boolean>(false)
  const [showStickyEditor, setShowStickyEditor] = useState<boolean>(false)
  const [guidePage, setGuidePage] = useState<'start' | 'nodes' | 'links' | 'keywords' | 'canvas' | 'analysis' | 'io' | 'workflows'>('start')
  const [showAnalysisPanel, setShowAnalysisPanel] = useState<boolean>(false)
  const [expandedAnalysisSections, setExpandedAnalysisSections] = useState<Set<string>>(new Set(['system', 'structure', 'completeness', 'organization']))
  const [colorTopicAssignments, setColorTopicAssignments] = useState<Record<string, string>>({})
  const [showContact, setShowContact] = useState<boolean>(false)
  const [contactForm, setContactForm] = useState({ name: '', email: '', type: 'feature', message: '' })
  const [contactSubmitting, setContactSubmitting] = useState<boolean>(false)
  const [contactSubmitted, setContactSubmitted] = useState<boolean>(false)

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

  // Analysis data computation - meaningful insights
  const analysisData = useMemo(() => {
    if (nodes.length === 0) {
      return {
        system: { totalElements: 0, isEmpty: true },
        structure: { insights: [], recommendations: [] },
        completeness: { insights: [], score: 0 },
        organization: { insights: [], recommendations: [] }
      }
    }

    // System Overview
    const totalElements = nodes.length + edges.length + stickyNotes.length
    const isEmpty = totalElements === 0

    // Structure Analysis - meaningful network insights
    const connectionCounts = nodes.map(node => ({
      nodeId: node.id,
      title: node.title,
      count: edges.filter(e => e.sourceId === node.id || e.targetId === node.id).length
    })).sort((a, b) => b.count - a.count)
    
    const isolatedNodes = connectionCounts.filter(n => n.count === 0)
    const hubNodes = connectionCounts.filter(n => n.count >= 3)
    const mostConnected = connectionCounts[0]
    const top5Connected = connectionCounts.slice(0, 5).filter(n => n.count > 0)
    
    // Calculate network density
    const maxPossibleConnections = nodes.length * (nodes.length - 1) / 2
    const density = maxPossibleConnections > 0 ? Math.round((edges.length / maxPossibleConnections) * 100) : 0
    
    // Identify clusters (nodes with similar tags)
    const tagGroups = new Map<string, string[]>()
    nodes.forEach(node => {
      node.tags.forEach(tag => {
        if (!tagGroups.has(tag)) tagGroups.set(tag, [])
        tagGroups.get(tag)!.push(node.title)
      })
    })
    const significantClusters = Array.from(tagGroups.entries())
      .filter(([_, nodeList]) => nodeList.length >= 2)
      .map(([tag, nodeList]) => ({ tag, count: nodeList.length }))
      .sort((a, b) => b.count - a.count)

    const structureInsights = []
    const structureRecommendations = []
    
    if (isolatedNodes.length > 0) {
      structureInsights.push(`${isolatedNodes.length} isolated nodes detected`)
      structureRecommendations.push('Consider connecting isolated nodes to show their relationships')
    }
    
    if (hubNodes.length > 0) {
      structureInsights.push(`${hubNodes.length} hub nodes found (3+ connections)`)
      if (hubNodes.length === 1) {
        structureRecommendations.push('Consider adding more hub nodes to distribute connectivity')
      }
    }
    
    if (density < 20) {
      structureInsights.push('Sparse network - low connectivity between elements')
      structureRecommendations.push('Add more connections to show relationships between components')
    } else if (density > 60) {
      structureInsights.push('Dense network - high interconnectivity')
      structureRecommendations.push('Consider grouping related elements or simplifying connections')
    }

    if (significantClusters.length > 0) {
      structureInsights.push(`${significantClusters.length} distinct clusters identified`)
    }

    // Completeness Analysis - actionable content insights
    const nodesWithDescriptions = nodes.filter(n => n.description.trim().length > 0).length
    const completenessScore = Math.round((nodesWithDescriptions / nodes.length) * 100)
    
    const nodesWithTags = nodes.filter(n => n.tags.length > 0).length
    const tagCompleteness = Math.round((nodesWithTags / nodes.length) * 100)
    
    const notesWithContent = stickyNotes.filter(n => n.content.trim().length > 0).length
    const noteUtilization = stickyNotes.length > 0 ? Math.round((notesWithContent / stickyNotes.length) * 100) : 100

    const completenessInsights = []
    
    if (completenessScore < 30) {
      completenessInsights.push('Most nodes lack descriptions - add context for better understanding')
    } else if (completenessScore < 70) {
      completenessInsights.push('Some nodes need descriptions to improve clarity')
    } else {
      completenessInsights.push('Good documentation - most nodes have descriptions')
    }
    
    if (tagCompleteness < 50) {
      completenessInsights.push('Add tags to categorize and organize your components')
    } else {
      completenessInsights.push('Well-tagged system helps with organization')
    }
    
    if (stickyNotes.length > notesWithContent && stickyNotes.length > 0) {
      completenessInsights.push(`${stickyNotes.length - notesWithContent} empty notes can be removed or filled`)
    }

    // Tag and Color Analysis - user-requested insights
    const allTags = nodes.flatMap(n => n.tags)
    const uniqueTags = [...new Set(allTags)]
    const top10Tags = uniqueTags.map(tag => ({
      tag,
      count: allTags.filter(t => t === tag).length
    })).sort((a, b) => b.count - a.count).slice(0, 10)
    
    // Color analysis with topic grouping
    const colorCounts = nodes.reduce((acc, node) => {
      acc[node.color] = (acc[node.color] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const colorAnalysis = Object.entries(colorCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([color, count]) => ({
        color,
        count,
        percentage: Math.round((count / nodes.length) * 100),
        // Find most common tags for nodes of this color
        commonTags: nodes
          .filter(n => n.color === color)
          .flatMap(n => n.tags)
          .reduce((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1
            return acc
          }, {} as Record<string, number>)
      }))
    
    const topColors = colorAnalysis.slice(0, 5)

    const organizationInsights = []
    const organizationRecommendations = []
    
    if (uniqueTags.length > nodes.length * 0.8) {
      organizationInsights.push('Too many unique tags - consider consolidating similar ones')
      organizationRecommendations.push('Standardize tag names for better organization')
    } else if (uniqueTags.length < nodes.length * 0.2 && nodes.length > 5) {
      organizationInsights.push('Limited tag variety - consider more specific categorization')
      organizationRecommendations.push('Add more descriptive tags to improve searchability')
    }
    
    // Check for naming patterns
    const nodeNames = nodes.map(n => n.title.toLowerCase())
    const hasNumbering = nodeNames.some(name => /\d/.test(name))
    const hasConsistentNaming = nodeNames.some(name => 
      nodeNames.filter(n => n.includes(name.split(/\d/)[0]) || name.includes(n.split(/\d/)[0])).length > 1
    )
    
    if (hasNumbering && !hasConsistentNaming) {
      organizationRecommendations.push('Consider consistent naming patterns for related components')
    }
    
    // Connection insights
    const directionalEdges = edges.filter(e => e.direction !== 'none').length
    if (directionalEdges < edges.length * 0.3 && edges.length > 3) {
      organizationRecommendations.push('Add directional arrows to show process flow or data direction')
    }

    return {
      system: {
        totalElements,
        isEmpty,
        totalNodes: nodes.length,
        totalConnections: edges.length,
        totalColors: Object.keys(colorCounts).length,
        networkDensity: density,
        mostConnected: mostConnected?.count > 0 ? mostConnected : null
      },
      structure: {
        insights: structureInsights,
        recommendations: structureRecommendations,
        top5Connected,
        hubNodes: hubNodes.slice(0, 3),
        clusters: significantClusters.slice(0, 3),
        isolatedCount: isolatedNodes.length
      },
      completeness: {
        insights: completenessInsights,
        score: Math.round((completenessScore + tagCompleteness + noteUtilization) / 3),
        descriptionCompleteness: completenessScore,
        tagCompleteness,
        noteUtilization
      },
      organization: {
        insights: organizationInsights,
        recommendations: organizationRecommendations,
        top10Tags,
        topColors,
        tagVariety: uniqueTags.length,
        hasGoodStructure: significantClusters.length > 0 && isolatedNodes.length < nodes.length * 0.3
      }
    }
  }, [nodes, edges, stickyNotes])

  // Analysis panel helper functions
  function toggleAnalysisSection(section: string) {
    const newSections = new Set(expandedAnalysisSections)
    if (newSections.has(section)) {
      newSections.delete(section)
    } else {
      newSections.add(section)
    }
    setExpandedAnalysisSections(newSections)
  }

  function highlightNode(nodeId: string) {
    setActiveNodeId(nodeId)
    setActiveEdgeId(null)
    setActiveStickyId(null)
    setShowAnalysisPanel(false)
    // Sync tag input value when highlighting node
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      setTagInputValue(node.tags.join(', '))
    }
  }

  function assignColorToTopic(color: string, topic: string) {
    setColorTopicAssignments(prev => ({
      ...prev,
      [color]: topic
    }))
  }

  function removeColorAssignment(color: string) {
    setColorTopicAssignments(prev => {
      const newAssignments = { ...prev }
      delete newAssignments[color]
      return newAssignments
    })
  }

  function getTopicForColor(color: string): string {
    // Check manual assignments first
    if (colorTopicAssignments[color]) {
      return colorTopicAssignments[color]
    }
    
    // Fall back to automatic detection from most common tag
    const nodesWithColor = nodes.filter(n => n.color === color)
    if (nodesWithColor.length === 0) return ''
    
    const tagCounts: Record<string, number> = {}
    nodesWithColor.forEach(node => {
      node.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    })
    
    const sortedTags = Object.entries(tagCounts).sort(([,a], [,b]) => b - a)
    return sortedTags[0]?.[0] || ''
  }

  function exportAnalysis() {
    const data = analysisData
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    
    let report = `Circuitboard Analysis Report - ${timestamp}\n`
    report += `${'='.repeat(60)}\n\n`
    
    if (data.system.isEmpty) {
      report += `EMPTY DIAGRAM\n`
      report += `Start by adding nodes to begin your system design.\n`
      const blob = new Blob([report], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `circuitboard-analysis-${timestamp}.txt`
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    
    report += `SYSTEM OVERVIEW\n`
    report += `- Total elements: ${data.system.totalElements}\n`
    report += `- Network density: ${data.system.networkDensity}%\n`
    if (data.system.mostConnected) {
      report += `- Most connected: "${data.system.mostConnected.title}" (${data.system.mostConnected.count} connections)\n`
    }
    report += `\n`
    
    report += `STRUCTURE ANALYSIS\n`
    if (data.structure.insights.length > 0) {
      report += `Key insights:\n`
      data.structure.insights.forEach(insight => {
        report += `  • ${insight}\n`
      })
    }
    if (data.structure.recommendations.length > 0) {
      report += `Recommendations:\n`
      data.structure.recommendations.forEach(rec => {
        report += `  → ${rec}\n`
      })
    }
    if (data.structure.hubNodes && data.structure.hubNodes.length > 0) {
      report += `Hub nodes:\n`
      data.structure.hubNodes.forEach(hub => {
        report += `  • ${hub.title} (${hub.count} connections)\n`
      })
    }
    if (data.structure.clusters && data.structure.clusters.length > 0) {
      report += `Clusters:\n`
      data.structure.clusters.forEach(cluster => {
        report += `  • ${cluster.tag}: ${cluster.count} nodes\n`
      })
    }
    report += `\n`
    
    report += `COMPLETENESS ANALYSIS\n`
    report += `Overall score: ${data.completeness.score}%\n`
    if (data.completeness.insights.length > 0) {
      data.completeness.insights.forEach(insight => {
        report += `  • ${insight}\n`
      })
    }
    report += `  • Description coverage: ${data.completeness.descriptionCompleteness}%\n`
    report += `  • Tag coverage: ${data.completeness.tagCompleteness}%\n`
    report += `  • Note utilization: ${data.completeness.noteUtilization}%\n`
    report += `\n`
    
    report += `ORGANIZATION ANALYSIS\n`
    if (data.organization.insights.length > 0) {
      report += `Current state:\n`
      data.organization.insights.forEach(insight => {
        report += `  • ${insight}\n`
      })
    }
    if (data.organization.recommendations.length > 0) {
      report += `Recommendations:\n`
      data.organization.recommendations.forEach(rec => {
        report += `  → ${rec}\n`
      })
    }
    if (data.organization.top10Tags && data.organization.top10Tags.length > 0) {
      report += `Most used tags:\n`
      data.organization.top10Tags.forEach((tag: {tag: string, count: number}) => {
        report += `  • ${tag.tag} (${tag.count} uses)\n`
      })
    }
    
    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `circuitboard-analysis-${timestamp}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function addNode() {
    saveToHistory()
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
    
    // In mouse mode, if this node is not selected, select only this node
    if (interactionMode === 'mouse' && !selectedNodes.has(nodeId)) {
      setSelectedNodes(new Set([nodeId]))
      setSelectedStickies(new Set())
    }
    
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
    
    // Update selection box if we're in mouse mode
    if (selectionBox && interactionMode === 'mouse') {
      setSelectionBox(prev => prev ? { ...prev, endX: pointerX, endY: pointerY } : null)
      return
    }
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
      
      // Calculate the movement delta
      const draggedNode = nodes.find(n => n.id === draggingNodeId)
      if (draggedNode) {
        const deltaX = newX - draggedNode.x
        const deltaY = newY - draggedNode.y
        
        // Move all selected nodes if in mouse mode, otherwise just the dragged node
        if (interactionMode === 'mouse' && selectedNodes.size > 1) {
          setNodes((prev) =>
            prev.map((n) => 
              selectedNodes.has(n.id) 
                ? { ...n, x: n.x + deltaX, y: n.y + deltaY }
                : n
            )
          )
          // Also move selected sticky notes
          setStickyNotes((prev) =>
            prev.map((s) => 
              selectedStickies.has(s.id)
                ? { ...s, x: s.x + deltaX, y: s.y + deltaY }
                : s
            )
          )
        } else {
          setNodes((prev) =>
            prev.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n))
          )
        }
      }
      return
    }
    if (isPanning && panStartRef.current && pointerStartRef.current) {
      const dxScreen = e.clientX - pointerStartRef.current.x
      const dyScreen = e.clientY - pointerStartRef.current.y
      const dxScene = dxScreen / zoom
      const dyScene = dyScreen / zoom
      setPan(constrainPan({ x: panStartRef.current.x + dxScene, y: panStartRef.current.y + dyScene }))
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
    // Complete box selection if we're in mouse mode
    if (selectionBox && interactionMode === 'mouse') {
      const { startX, startY, endX, endY } = selectionBox
      const minX = Math.min(startX, endX)
      const maxX = Math.max(startX, endX)
      const minY = Math.min(startY, endY)
      const maxY = Math.max(startY, endY)
      
      // Select nodes within the box
      const newSelectedNodes = new Set<string>()
      nodes.forEach(node => {
        const nodeSize = node.size ?? 64
        const nodeMinX = node.x
        const nodeMaxX = node.x + nodeSize
        const nodeMinY = node.y
        const nodeMaxY = node.y + nodeSize
        
        if (nodeMinX < maxX && nodeMaxX > minX && nodeMinY < maxY && nodeMaxY > minY) {
          newSelectedNodes.add(node.id)
        }
      })
      
      // Select sticky notes within the box
      const newSelectedStickies = new Set<string>()
      stickyNotes.forEach(sticky => {
        const stickyMinX = sticky.x
        const stickyMaxX = sticky.x + sticky.width
        const stickyMinY = sticky.y
        const stickyMaxY = sticky.y + sticky.height
        
        if (stickyMinX < maxX && stickyMaxX > minX && stickyMinY < maxY && stickyMaxY > minY) {
          newSelectedStickies.add(sticky.id)
        }
      })
      
      setSelectedNodes(newSelectedNodes)
      setSelectedStickies(newSelectedStickies)
      setSelectionBox(null)
      // Only suppress click if we actually dragged to create a selection (not just a single click)
      const dragDistance = Math.abs(endX - startX) + Math.abs(endY - startY)
      if (dragDistance > 5) {
        suppressCanvasClickRef.current = true
      }
      return
    }
    
    // If dropping into trash, delete dragged item and any selected items
    if (isOverTrash) {
      saveToHistory()
      if (draggingNodeId) {
        // If dragging a selected node, delete all selected nodes and stickies
        if (selectedNodes.has(draggingNodeId)) {
          const nodesToDelete = Array.from(selectedNodes)
          setNodes((prev) => prev.filter((n) => !selectedNodes.has(n.id)))
          setEdges((prev) => prev.filter((e) => !nodesToDelete.includes(e.sourceId) && !nodesToDelete.includes(e.targetId)))
          setStickyNotes((prev) => prev.filter((s) => !selectedStickies.has(s.id)))
          setSelectedNodes(new Set())
          setSelectedStickies(new Set())
        } else {
          // Just delete the single dragged node
          setNodes((prev) => prev.filter((n) => n.id !== draggingNodeId))
          setEdges((prev) => prev.filter((e) => e.sourceId !== draggingNodeId && e.targetId !== draggingNodeId))
        }
        setActiveNodeId(null)
      }
      if (draggingStickyId) {
        // If dragging a selected sticky, delete all selected stickies and nodes
        if (selectedStickies.has(draggingStickyId)) {
          const nodesToDelete = Array.from(selectedNodes)
          setStickyNotes((prev) => prev.filter((s) => !selectedStickies.has(s.id)))
          setNodes((prev) => prev.filter((n) => !selectedNodes.has(n.id)))
          setEdges((prev) => prev.filter((e) => !nodesToDelete.includes(e.sourceId) && !nodesToDelete.includes(e.targetId)))
          setSelectedNodes(new Set())
          setSelectedStickies(new Set())
        } else {
          // Just delete the single dragged sticky
          setStickyNotes((prev) => prev.filter((s) => s.id !== draggingStickyId))
        }
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
    setShowMinimap(false)
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
    // Sync tag input value when opening editor
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      setTagInputValue(node.tags.join(', '))
    }
  }

  function closeEditor() {
    setActiveNodeId(null)
    setActiveEdgeId(null)
    setEdgeMenu(null)
    setActiveStickyId(null)
    setShowStickyEditor(false)
    setTagInputValue("")
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
    saveToHistory()
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
    saveToHistory()
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
  async function copySaveCode() {
    try {
      await navigator.clipboard.writeText(saveCode)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = saveCode
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  function generateSceneCode() {
    const scene = {
      v: 2, // Increment version to support new fields
      nodes,
      edges,
      zoom,
      pan,
      stickyNotes,
      systemName,
      colorTopicAssignments,
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
      
      // Load system name (v2+ feature, backward compatible)
      if (typeof data.systemName === 'string') {
        setSystemName(data.systemName)
        setSystemNameInput(data.systemName)
      }
      
      // Load color topic assignments (v2+ feature, backward compatible)
      if (data.colorTopicAssignments && typeof data.colorTopicAssignments === 'object') {
        setColorTopicAssignments(data.colorTopicAssignments)
      }
      
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
    setSystemName("Circuitboard")
    setSystemNameInput("Circuitboard")
    setColorTopicAssignments({})
  }

  // Generate legend data for export
  function generateLegendData() {
    const colorTopics: { color: string; topic: string }[] = []
    
    // Get all unique colors used
    const usedColors = [...new Set(nodes.map(n => n.color))]
    
    usedColors.forEach(color => {
      const topic = getTopicForColor(color)
      if (topic) {
        colorTopics.push({ color, topic })
      }
    })
    
    return colorTopics
  }

  async function exportPNG() {
    const el = canvasRef.current
    if (!el) return
    
    // Store original zoom and pan
    const originalZoom = zoom
    const originalPan = { ...pan }
    
    try {
      // Generate legend data
      const legendData = generateLegendData()
      const hasLegend = legendData.length > 0
      
      if (hasLegend) {
        // Calculate bounds of all content
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        nodes.forEach(node => {
          const radius = node.size / 2
          minX = Math.min(minX, node.x - radius)
          maxX = Math.max(maxX, node.x + radius)
          minY = Math.min(minY, node.y - radius)
          maxY = Math.max(maxY, node.y + radius)
        })
        stickyNotes.forEach(note => {
          minX = Math.min(minX, note.x)
          maxX = Math.max(maxX, note.x + note.width)
          minY = Math.min(minY, note.y)
          maxY = Math.max(maxY, note.y + note.height)
        })
        
        if (nodes.length > 0 || stickyNotes.length > 0) {
          const contentWidth = maxX - minX
          const contentHeight = maxY - minY
          const canvasRect = el.getBoundingClientRect()
          
          // Reserve space for legend (approximately 200px wide, 30px per item + padding)
          const legendWidth = 220
          // const legendHeight = Math.max(legendData.length * 35 + 40, 100)
          
          // Calculate zoom to fit content + legend with padding
          const padding = 50
          const availableWidth = canvasRect.width - legendWidth - padding * 3
          const availableHeight = canvasRect.height - padding * 2
          
          const scaleX = contentWidth > 0 ? availableWidth / contentWidth : 1
          const scaleY = contentHeight > 0 ? availableHeight / contentHeight : 1
          const newZoom = Math.min(scaleX, scaleY, originalZoom) // Don't zoom in more than current
          
          // Center content in available area
          const centerX = (minX + maxX) / 2
          const centerY = (minY + maxY) / 2
          const viewportCenterX = (canvasRect.width - legendWidth) / 2
          const viewportCenterY = canvasRect.height / 2
          
          const newPanX = (viewportCenterX / newZoom) - centerX
          const newPanY = (viewportCenterY / newZoom) - centerY
          
          // Apply new zoom and pan
          setZoom(newZoom)
          setPan({ x: newPanX, y: newPanY })
          
          // Wait for DOM update
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      // Create legend overlay
      let legendOverlay: HTMLDivElement | null = null
      if (hasLegend) {
        legendOverlay = document.createElement('div')
        legendOverlay.className = 'export-legend'
        legendOverlay.innerHTML = `
          <div class="legend-title">Legend</div>
          ${legendData.map(({ color, topic }) => `
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${color}"></div>
              <div class="legend-text">${topic}</div>
            </div>
          `).join('')}
        `
        el.appendChild(legendOverlay)
      }
      
      // Create system name overlay in center
      let systemNameOverlay: HTMLDivElement | null = null
      if (systemName !== "Circuitboard") {
        systemNameOverlay = document.createElement('div')
        systemNameOverlay.className = 'export-system-name'
        systemNameOverlay.innerHTML = `<div class="system-name-text">${systemName}</div>`
        el.appendChild(systemNameOverlay)
      }
      
      // Render the canvas with legend
      const canvas = await html2canvas(el, { useCORS: true, scale: 2 })
      
      // Remove overlays
      if (legendOverlay) {
        el.removeChild(legendOverlay)
      }
      if (systemNameOverlay) {
        el.removeChild(systemNameOverlay)
      }
      
      // Create download
      const url = canvas.toDataURL('image/png')
      const ts = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const name = `circuitboard-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      
    } finally {
      // Restore original zoom and pan
      setZoom(originalZoom)
      setPan(originalPan)
    }
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

  // Hide/show Buy Me a Coffee button based on analysis panel
  useEffect(() => {
    const bmcRoot = document.getElementById('bmc-root')
    if (bmcRoot) {
      bmcRoot.style.display = showAnalysisPanel ? 'none' : 'block'
    }
  }, [showAnalysisPanel])

  // Contact form submission
  async function submitContactForm(e: React.FormEvent) {
    e.preventDefault()
    setContactSubmitting(true)

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_key: '36f59158-648d-46fb-9621-bfd48f820aae',
          name: contactForm.name,
          email: contactForm.email,
          subject: `Circuitboard ${contactForm.type}: ${contactForm.message.slice(0, 50)}...`,
          message: `Type: ${contactForm.type}\nName: ${contactForm.name}\nEmail: ${contactForm.email}\n\nMessage:\n${contactForm.message}`,
          from_name: 'Circuitboard App',
        }),
      })

      if (response.ok) {
        setContactSubmitted(true)
        setContactForm({ name: '', email: '', type: 'feature', message: '' })
        setTimeout(() => {
          setShowContact(false)
          setContactSubmitted(false)
        }, 3000)
      } else {
        throw new Error('Failed to submit')
      }
    } catch (error) {
      alert('Failed to send message. Please try again.')
    } finally {
      setContactSubmitting(false)
    }
  }

  return (
    <div className="app-root">
      <div className="top-title">
        {isEditingSystemName ? (
          <input
            className="system-name-input"
            type="text"
            value={systemNameInput}
            onChange={(e) => setSystemNameInput(e.target.value)}
            onBlur={saveSystemName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveSystemName()
              } else if (e.key === 'Escape') {
                cancelEditingSystemName()
              }
            }}
            autoFocus
            placeholder="System name"
          />
        ) : (
          <span 
            className="brand-name editable-title" 
            onClick={startEditingSystemName}
            title="Click to edit system name"
          >
            {systemName}
          </span>
        )}
        <img src="circuit.png" alt="" className="brand-stars" aria-hidden />
      </div>

      <div className="top-left-actions">
        <button className="round-icon" title="Guide" onClick={() => setShowDocs(true)} aria-label="Open guide">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#374151" strokeWidth="2"/>
            <path d="M8 7h8M8 11h6" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="round-icon" title="Updates" onClick={() => setShowUpdates(true)} aria-label="Open updates">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 8c0-3.3-2.7-6-6-6s-6 2.7-6 6c0 7-3 9-3 9h18s-3-2-3-9z" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13.73 21c-.39.74-1.15 1.24-2.02 1.24s-1.63-.5-2.02-1.24" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="round-icon" title="Contact" onClick={() => setShowContact(true)} aria-label="Send feedback">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 8.5l-9 5.5-9-5.5" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 7v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2z" stroke="#374151" strokeWidth="2"/>
          </svg>
        </button>
      </div>

      <div className="top-actions">
        <button className="action-btn btn-purple" onClick={() => setShowAnalysisPanel(true)}>Analysis</button>
        <button className="action-btn btn-yellow" onClick={exportPNG}>Export</button>
        <button className="action-btn btn-green" onClick={generateSceneCode}>Save</button>
        <button className="action-btn btn-blue" onClick={() => setShowOpen(true)}>Open</button>
        <button className="action-btn btn-red" onClick={() => setShowResetConfirm(true)}>Reset</button>
      </div>

      <div className="floating-pill mode-pill">
        <button 
          className={`swatch mode-button ${interactionMode === 'hand' ? 'active' : ''}`}
          onClick={() => setInteractionMode('hand')}
          title="Hand Mode (pan and drag)"
        >
          <img src="/circuitboard/hand.png" alt="Hand" width="20" height="20" />
        </button>
        <button 
          className={`swatch mode-button ${interactionMode === 'mouse' ? 'active' : ''}`}
          onClick={() => setInteractionMode('mouse')}
          title="Select Mode (box select)"
        >
          <img src="/circuitboard/pointer.svg" alt="Pointer" width="16" height="16" />
        </button>
      </div>

      <div className="floating-pill tools-pill">
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
        style={{
          backgroundPosition: `${pan.x * zoom % 24}px ${pan.y * zoom % 24}px`
        }}
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
            if (interactionMode === 'hand') {
              setIsPanning(true)
              setShowMinimap(true)
              panStartRef.current = { ...pan }
              pointerStartRef.current = { x: e.clientX, y: e.clientY }
              canvasDidPanRef.current = false
            } else {
              // Mouse mode - start box selection
              const container = canvasRef.current
              if (container) {
                const rect = container.getBoundingClientRect()
                const startX = (e.clientX - rect.left) / zoom - pan.x
                const startY = (e.clientY - rect.top) / zoom - pan.y
                setSelectionBox({ startX, startY, endX: startX, endY: startY })
              }
            }
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
          // Create sticky notes when clicking background in both modes
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
            className={`sticky-note ${draggingStickyId === note.id ? 'dragging' : ''} ${selectedStickies.has(note.id) ? 'selected' : ''}`}
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
            className={`node ${draggingNodeId === node.id ? 'dragging' : ''} ${selectedNodes.has(node.id) ? 'selected' : ''}`}
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
        
        {/* Selection box in mouse mode */}
        {selectionBox && interactionMode === 'mouse' && (
          <div
            className="selection-box"
            style={{
              position: 'absolute',
              left: Math.min(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              width: Math.abs(selectionBox.endX - selectionBox.startX),
              height: Math.abs(selectionBox.endY - selectionBox.startY),
              border: '2px dashed #3b82f6',
              background: 'rgba(59, 130, 246, 0.1)',
              pointerEvents: 'none'
            }}
          />
        )}
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
                value={tagInputValue}
                onChange={(e) => {
                  setTagInputValue(e.target.value)
                }}
                onBlur={() => {
                  // Process tags when user finishes editing
                  const parts = tagInputValue
                    .split(',')
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                  updateActiveNode((n) => ({ ...n, tags: parts }))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur() // Trigger onBlur to save tags
                  }
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
                <span className="label">Custom keywords</span>
                <input
                  className="text-input"
                  type="text"
                  value={activeEdge.note}
                  onChange={(e) => updateActiveEdge((edge) => ({ ...edge, note: e.target.value }))}
                  placeholder="Add custom keywords for this link"
                />
              </div>
              <div className="section">
                <button 
                  className="action-btn btn-red"
                  onClick={() => {
                    setEdges(prev => prev.filter(e => e.id !== activeEdge.id))
                    setActiveEdgeId(null)
                    setEdgeMenu(null)
                  }}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  Delete Connection
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showDocs && (
        <div className="modal-overlay" onClick={() => setShowDocs(false)}>
          <div className="modal guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Guide</h3>
              <button className="close-btn" onClick={() => setShowDocs(false)} aria-label="Close">×</button>
            </div>
            <div className="guide-content">
            <div className="modal-section">
              <div className="field-label">Guide Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <button className={`chip ${guidePage === 'start' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('start')}>Quick Start</button>
                <button className={`chip ${guidePage === 'nodes' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('nodes')}>Nodes</button>
                <button className={`chip ${guidePage === 'links' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('links')}>Links</button>
                <button className={`chip ${guidePage === 'keywords' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('keywords')}>Notes</button>
                <button className={`chip ${guidePage === 'canvas' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('canvas')}>Canvas</button>
                <button className={`chip ${guidePage === 'analysis' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('analysis')}>Analysis</button>
                <button className={`chip ${guidePage === 'io' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('io')}>Save/Export</button>
                <button className={`chip ${guidePage === 'workflows' ? 'chip-selected' : ''}`} onClick={() => setGuidePage('workflows')}>Workflows</button>
              </div>
            </div>
            {guidePage === 'start' && (
            <div className="modal-section">
                <div className="field-label">Welcome to Circuitboard</div>
                <p><strong>Build visual systems and network diagrams with ease.</strong> Circuitboard helps you map ideas, processes, and relationships using nodes, links, and notes.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Your First Circuit</div>
                <ol>
                  <li><strong>Create nodes:</strong> Click the <strong>+</strong> button (left sidebar) → Choose a color → Click to place your first node</li>
                  <li><strong>Add content:</strong> Double-click the node → Enter name, description, and tags → Save</li>
                  <li><strong>Connect nodes:</strong> Hover over a node → Drag from any handle → Release on another node</li>
                  <li><strong>Organize:</strong> Drag nodes to arrange → Use mouse wheel or zoom controls to get the perfect view</li>
                  <li><strong>Analyze:</strong> Click the Analysis button (top-right) to see insights about your network</li>
                </ol>

                <div className="field-label" style={{ marginTop: 20 }}>Key Concepts</div>
                <ul>
                  <li><strong>Nodes:</strong> Core elements (people, concepts, systems) - use color and size to show importance</li>
                  <li><strong>Links:</strong> Relationships between nodes - add direction arrows and keywords to clarify meaning</li>
                  <li><strong>Notes:</strong> Contextual information - perfect for documentation or explanations</li>
                  <li><strong>Tags:</strong> Categories that help organize and analyze your network structure</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Quick Actions</div>
                <ul>
                  <li><strong>Double-click:</strong> Edit nodes or notes instantly</li>
                  <li><strong>Right-click:</strong> Quick actions menu (coming soon)</li>
                  <li><strong>Esc key:</strong> Close any open modal or editor</li>
                  <li><strong>Drag to trash:</strong> Delete nodes or notes by dropping on the trash zone</li>
                </ul>
            </div>
            )}
            {guidePage === 'nodes' && (
            <div className="modal-section">
                <div className="field-label">Working with Nodes</div>
                <p>Nodes are the core building blocks of your network. They represent concepts, people, systems, or any entities you want to connect and analyze.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Creating Nodes</div>
                <ul>
                  <li><strong>Add a node:</strong> Click the <strong>+</strong> button in the left sidebar</li>
                  <li><strong>Choose color:</strong> Select from the color palette or use the rainbow swatch for custom colors</li>
                  <li><strong>Place on canvas:</strong> Click anywhere on the canvas to create your node</li>
                  <li><strong>Quick create:</strong> After placing one node, the add mode stays active for rapid creation</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Editing Node Properties</div>
                <ul>
                  <li><strong>Name:</strong> The main label - keep it concise and descriptive</li>
                  <li><strong>Description:</strong> Additional context (appears on hover) - 1-2 sentences work best</li>
                  <li><strong>Tags:</strong> Comma-separated labels (e.g., "frontend, react, critical") - used for filtering and analysis</li>
                  <li><strong>Color:</strong> Visual categorization - consistent colors help identify groups</li>
                  <li><strong>Size:</strong> Emphasis level - larger nodes draw more attention</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Visual Design Guidelines</div>
                <ul>
                  <li><strong>Size hierarchy:</strong> Important nodes should be larger (use sizes 64-120px)</li>
                  <li><strong>Color coding:</strong> Use consistent colors for categories (blue = systems, green = processes, etc.)</li>
                  <li><strong>White/light nodes:</strong> Get subtle borders for visibility</li>
                  <li><strong>Dark nodes:</strong> Text color automatically inverts for readability</li>
                  <li><strong>Size limits:</strong> Nodes are clamped between 24px and 200px</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Node Operations</div>
                <ul>
                  <li><strong>Move:</strong> Click and drag nodes anywhere on the canvas</li>
                  <li><strong>Resize:</strong> Drag any of the four corner squares</li>
                  <li><strong>Edit:</strong> Double-click to open the editor</li>
                  <li><strong>Connect:</strong> Drag from connection handles (small circles on node edges)</li>
                  <li><strong>Delete:</strong> Use the Delete button in editor, or drag to trash zone</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Best Practices</div>
                <ul>
                  <li><strong>Naming:</strong> Use noun phrases (User Profile, Payment System)</li>
                  <li><strong>Consistency:</strong> Similar nodes should have similar sizes and colors</li>
                  <li><strong>Tags:</strong> Create a consistent tag vocabulary for your project</li>
                  <li><strong>Spacing:</strong> Leave enough space between nodes for clear connections</li>
                </ul>
            </div>
            )}
            {guidePage === 'links' && (
            <div className="modal-section">
                <div className="field-label">Creating and Managing Links</div>
                <p>Links show relationships between nodes. They can represent data flow, dependencies, influence, or any type of connection in your system.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Creating Links</div>
                <ul>
                  <li><strong>Start connection:</strong> Hover over any node to see connection handles (small circles)</li>
                  <li><strong>Drag to connect:</strong> Click and drag from any handle to another node</li>
                  <li><strong>Handle positions:</strong> Top, bottom, left, and right handles for optimal routing</li>
                  <li><strong>Visual feedback:</strong> Handles appear on hover, cursor changes during drag</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Link Properties</div>
                <ul>
                  <li><strong>Direction:</strong> None (bidirectional), → (source to target), or ← (target to source)</li>
                  <li><strong>Style:</strong> Straight (direct) or curved (reduces visual clutter in dense networks)</li>
                  <li><strong>Keywords:</strong> Pre-defined relationships like "increases", "decreases", "depends on"</li>
                  <li><strong>Custom keywords:</strong> Free-text labels for specific relationship details</li>
                  <li><strong>Visual weight:</strong> Links automatically adjust thickness based on importance</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Editing Links</div>
                <ul>
                  <li><strong>Open editor:</strong> Click any link to open the inline menu at its midpoint</li>
                  <li><strong>Change direction:</strong> Use the arrow buttons (No arrow, →, ←)</li>
                  <li><strong>Add keywords:</strong> Toggle common relationship types</li>
                  <li><strong>Custom labels:</strong> Enter specific relationship details</li>
                  <li><strong>Curve links:</strong> Drag the link to create curved paths</li>
                  <li><strong>Delete links:</strong> Use the red Delete Connection button</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Link Types and Examples</div>
                <ul>
                  <li><strong>Data Flow:</strong> User Input → Validation → Database (directional)</li>
                  <li><strong>Dependencies:</strong> Frontend ← API ← Database (reverse arrows)</li>
                  <li><strong>Influences:</strong> Marketing Strategy → Sales Results</li>
                  <li><strong>Hierarchies:</strong> Manager → Team Member → Tasks</li>
                  <li><strong>Processes:</strong> Planning → Development → Testing → Deployment</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Visual Best Practices</div>
                <ul>
                  <li><strong>Curved links:</strong> Use in dense areas to reduce visual overlap</li>
                  <li><strong>Consistent directions:</strong> Same direction types for similar relationships</li>
                  <li><strong>Meaningful keywords:</strong> Use standard vocabulary across your diagram</li>
                  <li><strong>Link density:</strong> Avoid too many connections from one node</li>
                  <li><strong>Color coding:</strong> Links inherit subtle colors from connected nodes</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Advanced Features</div>
                <ul>
                  <li><strong>Hover effects:</strong> Links highlight and thicken on mouse over</li>
                  <li><strong>Selection feedback:</strong> Selected links show in distinct color</li>
                  <li><strong>Smart routing:</strong> Handles automatically choose optimal connection points</li>
                  <li><strong>Batch operations:</strong> Coming soon - select multiple links</li>
                </ul>
            </div>
            )}
            {guidePage === 'keywords' && (
              <div className="modal-section">
                <div className="field-label">Sticky Notes and Documentation</div>
                <p>Sticky notes provide context, documentation, and explanations for your network. They support rich formatting and help tell the story of your system.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Creating Notes</div>
                <ul>
                  <li><strong>Click to create:</strong> Click any empty area of the canvas to place a note</li>
                  <li><strong>Instant editing:</strong> Notes open in edit mode immediately after creation</li>
                  <li><strong>Positioning:</strong> Place notes near related nodes or in empty areas</li>
                  <li><strong>Multiple notes:</strong> Create as many notes as needed for comprehensive documentation</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Markdown Formatting</div>
                <ul>
                  <li><strong>Headings:</strong> # Large Header, ## Medium Header, ### Small Header</li>
                  <li><strong>Emphasis:</strong> **bold text**, *italic text*, `inline code`</li>
                  <li><strong>Lists:</strong> Use - or * for bullets, 1. 2. 3. for numbered lists</li>
                  <li><strong>Links:</strong> [link text](URL) for clickable links</li>
                  <li><strong>Code blocks:</strong> Use ``` for multi-line code sections</li>
                  <li><strong>Line breaks:</strong> Double space at end of line or double enter</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Live Preview</div>
                <ul>
                  <li><strong>Side-by-side:</strong> Editor and preview shown together while editing</li>
                  <li><strong>Real-time updates:</strong> Preview updates as you type</li>
                  <li><strong>Formatted display:</strong> Rendered markdown shown when not editing</li>
                  <li><strong>Click to edit:</strong> Double-click any note to return to edit mode</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Note Operations</div>
                <ul>
                  <li><strong>Move:</strong> Drag notes anywhere on the canvas</li>
                  <li><strong>Resize:</strong> Drag any corner handle to change dimensions</li>
                  <li><strong>Edit content:</strong> Double-click to open the editor</li>
                  <li><strong>Smart sizing:</strong> Content layout preserved during resize</li>
                  <li><strong>Delete:</strong> Use Delete button in editor or drag to trash zone</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Best Use Cases</div>
                <ul>
                  <li><strong>System documentation:</strong> Explain complex processes or architectures</li>
                  <li><strong>Context notes:</strong> Provide background information for node groups</li>
                  <li><strong>Instructions:</strong> Add usage notes or operational procedures</li>
                  <li><strong>Legends:</strong> Explain color coding or symbol meanings</li>
                  <li><strong>Status updates:</strong> Document current state or recent changes</li>
                  <li><strong>Meeting notes:</strong> Capture decisions or action items</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Styling Tips</div>
                <ul>
                  <li><strong>Consistent sizing:</strong> Use similar dimensions for related notes</li>
                  <li><strong>Visual hierarchy:</strong> Larger notes for important information</li>
                  <li><strong>Strategic placement:</strong> Position near relevant network sections</li>
                  <li><strong>Color coordination:</strong> Notes have warm yellow background by default</li>
                </ul>
              </div>
            )}
            {guidePage === 'canvas' && (
              <div className="modal-section">
                <div className="field-label">Canvas Navigation and Controls</div>
                <p>The infinite canvas gives you unlimited space to build and organize your networks. Master these navigation techniques for efficient workflow.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Panning (Moving the View)</div>
                <ul>
                  <li><strong>Click and drag:</strong> Click empty canvas space and drag to move your view</li>
                  <li><strong>Visual feedback:</strong> Cursor changes to grab/grabbing hand during panning</li>
                  <li><strong>Smooth movement:</strong> Pan smoothly in any direction without limits</li>
                  <li><strong>Smart prevention:</strong> Panning prevents accidental note creation on release</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Zooming</div>
                <ul>
                  <li><strong>Zoom controls:</strong> Use the - / + buttons in the bottom-left corner</li>
                  <li><strong>Mouse wheel:</strong> Scroll to zoom in/out (if browser supports)</li>
                  <li><strong>Zoom levels:</strong> From 10% to 500% magnification</li>
                  <li><strong>Center-focused:</strong> Zoom centers on the viewport, preserving relative positions</li>
                  <li><strong>Smooth scaling:</strong> All elements scale proportionally</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Viewport Management</div>
                <ul>
                  <li><strong>Find your content:</strong> Use zoom out to see the full network</li>
                  <li><strong>Detail work:</strong> Zoom in for precise positioning and editing</li>
                  <li><strong>Overview mode:</strong> Step back to see overall structure and patterns</li>
                  <li><strong>Focus areas:</strong> Navigate to specific regions for detailed work</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Interaction Precision</div>
                <ul>
                  <li><strong>Click detection:</strong> System distinguishes between clicks, drags, and pans</li>
                  <li><strong>Drag thresholds:</strong> Small movements won't trigger unintended actions</li>
                  <li><strong>Element priority:</strong> Nodes and links take precedence over canvas interactions</li>
                  <li><strong>Modifier awareness:</strong> Future shortcuts will use Ctrl/Cmd key combinations</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Canvas Features</div>
                <ul>
                  <li><strong>Grid background:</strong> Subtle dot pattern helps with alignment</li>
                  <li><strong>Infinite space:</strong> No limits on canvas size or content placement</li>
                  <li><strong>Dark mode support:</strong> Grid and interface adapt to system theme</li>
                  <li><strong>Performance:</strong> Optimized rendering for smooth navigation</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Navigation Tips</div>
                <ul>
                  <li><strong>Start wide:</strong> Begin with an overview, then zoom in for details</li>
                  <li><strong>Use landmarks:</strong> Place important nodes as navigation reference points</li>
                  <li><strong>Organize by zones:</strong> Group related content in distinct canvas areas</li>
                  <li><strong>Save positions:</strong> Your current view is saved with the project</li>
                </ul>
              </div>
            )}
            {guidePage === 'analysis' && (
              <div className="modal-section">
                <div className="field-label">Network Analysis and Insights</div>
                <p>The Analysis tool provides real-time insights about your network structure, helping you understand patterns, identify important nodes, and optimize your system design.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Opening Analysis</div>
                <ul>
                  <li><strong>Access:</strong> Click the Analysis button in the top-right corner</li>
                  <li><strong>Side panel:</strong> Opens a detailed panel on the right side of the screen</li>
                  <li><strong>Real-time updates:</strong> Metrics update automatically as you modify your network</li>
                  <li><strong>Sections:</strong> Organized into System, Structure, Completeness, and Organization</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>System Overview</div>
                <ul>
                  <li><strong>Total counts:</strong> Nodes, connections, colors, and sticky notes</li>
                  <li><strong>Network density:</strong> How connected your network is (percentage of possible connections)</li>
                  <li><strong>Most connected node:</strong> The hub with the highest number of connections</li>
                  <li><strong>Visual metrics:</strong> Clean cards showing key numbers at a glance</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Structure Analysis</div>
                <ul>
                  <li><strong>Top 5 connected nodes:</strong> Ranking of most important hubs with connection counts</li>
                  <li><strong>Hub identification:</strong> Nodes with 3+ connections highlighted as network hubs</li>
                  <li><strong>Isolated nodes:</strong> Warning about nodes without any connections</li>
                  <li><strong>Click to highlight:</strong> Click any node in the list to highlight it on canvas</li>
                  <li><strong>Insights:</strong> Automated observations about network structure</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Organization Analysis</div>
                <ul>
                  <li><strong>Top 10 tags:</strong> Most frequently used tags across your network</li>
                  <li><strong>Tag distribution:</strong> How well tags are spread across nodes</li>
                  <li><strong>Color analysis:</strong> Usage statistics for each color in your network</li>
                  <li><strong>Topic mapping:</strong> Automatic assignment of colors to their most common tag</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Color-Topic Assignment</div>
                <ul>
                  <li><strong>Automatic detection:</strong> Colors automatically mapped to their most common tag</li>
                  <li><strong>Manual override:</strong> Select different topics from dropdown or enter custom ones</li>
                  <li><strong>Export legend:</strong> Color assignments included in image exports</li>
                  <li><strong>Clear assignments:</strong> Reset to automatic detection anytime</li>
                  <li><strong>Consistency help:</strong> Ensures coherent color coding across your network</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Using Insights</div>
                <ul>
                  <li><strong>Network optimization:</strong> Identify nodes that need more connections</li>
                  <li><strong>Information architecture:</strong> See which topics dominate your system</li>
                  <li><strong>Visual balance:</strong> Check if colors and tags are well distributed</li>
                  <li><strong>Hub strategy:</strong> Understand which nodes are most central</li>
                  <li><strong>Documentation gaps:</strong> Find nodes missing descriptions or tags</li>
                </ul>
              </div>
            )}
            {guidePage === 'io' && (
              <div className="modal-section">
                <div className="field-label">Save, Open, and Export</div>
                <p>Preserve your work and share your networks with flexible save and export options. All your effort is protected and portable.</p>
                
                <div className="field-label" style={{ marginTop: 20 }}>Saving Your Work</div>
                <ul>
                  <li><strong>Save button:</strong> Click Save in the top-right corner to generate a backup code</li>
                  <li><strong>Complete capture:</strong> Includes all nodes, links, custom keywords, notes, colors, pan, and zoom state</li>
                  <li><strong>Compact format:</strong> Efficient JSON encoding keeps codes manageable</li>
                  <li><strong>Copy to clipboard:</strong> Generated code automatically selected for easy copying</li>
                  <li><strong>Version safe:</strong> Codes work across different versions of Circuitboard</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Opening Saved Work</div>
                <ul>
                  <li><strong>Open button:</strong> Click Open and paste your saved code</li>
                  <li><strong>Complete restoration:</strong> Recreates the exact state when you saved</li>
                  <li><strong>Position preserved:</strong> Canvas view returns to saved pan and zoom</li>
                  <li><strong>Error handling:</strong> Invalid codes show clear error messages</li>
                  <li><strong>Merge-friendly:</strong> Can open into existing networks (coming soon)</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Exporting Images</div>
                <ul>
                  <li><strong>PNG export:</strong> High-DPI image files perfect for presentations</li>
                  <li><strong>Current view:</strong> Exports exactly what you see (your current pan/zoom)</li>
                  <li><strong>Smart legends:</strong> Color-topic assignments automatically included</li>
                  <li><strong>Auto-zoom:</strong> System optimally frames content with legends</li>
                  <li><strong>High quality:</strong> 2x resolution for crisp printing and displays</li>
                  <li><strong>Timestamped files:</strong> Automatic naming with date and time</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Export with Color Legends</div>
                <ul>
                  <li><strong>Automatic legends:</strong> When color-topic assignments exist, legends appear on exports</li>
                  <li><strong>Smart positioning:</strong> Legend placed in corner without covering content</li>
                  <li><strong>Intelligent zoom:</strong> Canvas auto-adjusts to fit both network and legend</li>
                  <li><strong>Clean formatting:</strong> Professional legend styling for presentations</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>Best Practices</div>
                <ul>
                  <li><strong>Regular saves:</strong> Save after major changes or before experiments</li>
                  <li><strong>Descriptive storage:</strong> Keep save codes with project names and dates</li>
                  <li><strong>Export staging:</strong> Position your view before export for best framing</li>
                  <li><strong>Multiple formats:</strong> Save codes for editing, images for sharing</li>
                  <li><strong>Version control:</strong> Keep multiple save points for complex projects</li>
                </ul>

                <div className="field-label" style={{ marginTop: 20 }}>File Management</div>
                <ul>
                  <li><strong>No accounts needed:</strong> Everything works locally in your browser</li>
                  <li><strong>Privacy first:</strong> Your data never leaves your device</li>
                  <li><strong>Cross-device:</strong> Copy codes to move work between devices</li>
                  <li><strong>Collaboration:</strong> Share save codes with teammates</li>
                </ul>
              </div>
            )}
            {guidePage === 'workflows' && (
            <div className="modal-section">
              <div className="field-label">Workflows and Advanced Tips</div>
              <p>Master these proven techniques for creating clear, effective network diagrams that communicate complex systems beautifully.</p>
              
              <div className="field-label" style={{ marginTop: 20 }}>Getting Started Workflow</div>
              <ol>
                <li><strong>Define your purpose:</strong> Know what story your network should tell</li>
                <li><strong>Start with key nodes:</strong> Add the 3-5 most important elements first</li>
                <li><strong>Establish hierarchy:</strong> Use size and color to show importance</li>
                <li><strong>Connect core relationships:</strong> Link the most critical connections</li>
                <li><strong>Expand systematically:</strong> Add supporting nodes and details</li>
                <li><strong>Refine and analyze:</strong> Use analysis tools to verify structure</li>
              </ol>

              <div className="field-label" style={{ marginTop: 20 }}>Visual Design Principles</div>
              <ul>
                <li><strong>Hierarchy through size:</strong> Important nodes should be 80-120px, details 40-60px</li>
                <li><strong>Color consistency:</strong> Same color = same category, avoid too many bright colors</li>
                <li><strong>Strategic spacing:</strong> Leave room between related groups for visual breathing</li>
                <li><strong>Link clarity:</strong> Use curved links in dense areas to reduce visual tangles</li>
                <li><strong>Directional flow:</strong> Consistent arrow directions help show system flow</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Content Strategy</div>
              <ul>
                <li><strong>Node naming:</strong> Use noun phrases, keep names under 3 words when possible</li>
                <li><strong>Description economy:</strong> 1-2 sentences max, focus on key context</li>
                <li><strong>Tag vocabulary:</strong> Establish consistent tags early (technology, process, team, critical)</li>
                <li><strong>Link semantics:</strong> Prefer keywords and short custom keywords over long paragraphs</li>
                <li><strong>Note placement:</strong> Use sticky notes for context that doesn't fit in nodes</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Layout Strategies</div>
              <ul>
                <li><strong>Hub and spoke:</strong> Central important nodes with related elements around them</li>
                <li><strong>Flow diagrams:</strong> Left-to-right or top-to-bottom process flows</li>
                <li><strong>Clustered groups:</strong> Related nodes grouped together with internal connections</li>
                <li><strong>Layered hierarchy:</strong> Important nodes at top, supporting details below</li>
                <li><strong>Grid alignment:</strong> Use the subtle grid to align related elements</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Collaboration Workflows</div>
              <ul>
                <li><strong>Share early drafts:</strong> Use save codes to get feedback on structure</li>
                <li><strong>Version control:</strong> Save before major changes, keep multiple checkpoints</li>
                <li><strong>Review sessions:</strong> Export images for presentations and reviews</li>
                <li><strong>Incremental building:</strong> Add detail progressively based on team input</li>
                <li><strong>Documentation integration:</strong> Use as visual summaries of larger documents</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Analysis-Driven Improvement</div>
              <ul>
                <li><strong>Monitor connection balance:</strong> Check for isolated nodes and over-connected hubs</li>
                <li><strong>Tag distribution:</strong> Ensure good spread of categories across your network</li>
                <li><strong>Color-topic alignment:</strong> Use analysis to verify consistent color coding</li>
                <li><strong>Network density:</strong> Aim for 15-25% density for optimal comprehension</li>
                <li><strong>Hub identification:</strong> Ensure important hubs are visually prominent</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Common Use Cases</div>
              <ul>
                <li><strong>System architecture:</strong> Show component relationships and data flow</li>
                <li><strong>Process mapping:</strong> Document workflow steps and decision points</li>
                <li><strong>Stakeholder networks:</strong> Map relationships between people and teams</li>
                <li><strong>Knowledge mapping:</strong> Connect concepts and learning dependencies</li>
                <li><strong>Project planning:</strong> Show task dependencies and resource allocation</li>
                <li><strong>Problem analysis:</strong> Map causes, effects, and intervention points</li>
              </ul>

              <div className="field-label" style={{ marginTop: 20 }}>Performance Tips</div>
              <ul>
                <li><strong>Large networks:</strong> Keep networks under 50 nodes for optimal performance</li>
                <li><strong>Complex connections:</strong> Use curved links judiciously in very dense areas</li>
                <li><strong>Export optimization:</strong> Position view carefully before exporting large diagrams</li>
                <li><strong>Browser performance:</strong> Modern browsers work best, save regularly</li>
              </ul>
            </div>
            )}
            </div>
          </div>
        </div>
      )}

      {showUpdates && (
        <div className="modal-overlay" onClick={() => setShowUpdates(false)}>
          <div className="modal guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Updates & Version History</h3>
              <button className="close-btn" onClick={() => setShowUpdates(false)} aria-label="Close">×</button>
            </div>
            <div className="updates-content">
              
              {/* Version 1.4.0 - Latest */}
              <div className="version-card latest">
                <div className="version-header">
                  <div className="version-number">v1.4.0</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="version-badge">Latest</div>
                    <div className="version-date">September 2, 2025</div>
                  </div>
                </div>
                <div className="version-features">
                  <h4>New Features</h4>
                  <ul>
                    <li><strong>Custom System Names:</strong> Click on "Circuitboard" to rename your system - custom names appear as headers in PNG exports for professional branding</li>
                    <li><strong>Enhanced Save System:</strong> Save codes now preserve your custom system name and all color-topic assignments for complete project restoration</li>
                    <li><strong>Navigation Controls:</strong> New center button returns to origin (0,0) with one click, plus live coordinate display showing your current position</li>
                    <li><strong>Smart Tag Input:</strong> Fixed comma handling - you can now type tags naturally with "tag1, tag2, tag3" without input interference</li>
                    <li><strong>Improved Node Spawning:</strong> New nodes always appear in center of current viewport, not canvas center, for better workflow</li>
                  </ul>
                  <h4>Quality of Life</h4>
                  <ul>
                    <li><strong>Professional Exports:</strong> Custom system names appear as prominent headers in PNG exports with professional styling</li>
                    <li><strong>Complete State Persistence:</strong> Everything including names, colors, and topic assignments survives save/load cycles</li>
                    <li><strong>Spatial Awareness:</strong> Live X,Y coordinates help you navigate large diagrams across the 9x canvas area</li>
                    <li><strong>Intuitive Controls:</strong> Center button and coordinate display positioned for easy access without cluttering interface</li>
                    <li><strong>Backward Compatibility:</strong> New v2 save format works with all existing v1 save codes</li>
                  </ul>
                  <h4>Bug Fixes</h4>
                  <ul>
                    <li><strong>Tag Input:</strong> Fixed comma handling issue that prevented proper tag separation during typing</li>
                    <li><strong>Export Positioning:</strong> System name now appears as proper header instead of center overlay in exports</li>
                    <li><strong>State Management:</strong> Custom names and assignments properly cleared when resetting canvas</li>
                  </ul>
                </div>
              </div>

              {/* Version 1.3.0 */}
              <div className="version-card">
                <div className="version-header">
                  <div className="version-number">v1.3.0</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="version-date">August 30, 2025</div>
                  </div>
                </div>
                <div className="version-features">
                  <h4>New Features</h4>
                  <ul>
                    <li><strong>Canvas Boundaries:</strong> Limited infinite scrolling to a manageable 9x screen area for better navigation control</li>
                    <li><strong>Interactive Minimap:</strong> Smart minimap appears when dragging canvas, showing your current viewport position within the total canvas area</li>
                    <li><strong>Enhanced Background Animation:</strong> Dot pattern background now moves smoothly with canvas panning for seamless navigation feel</li>
                    <li><strong>Spatial Awareness:</strong> Blue viewport indicator on minimap shows exactly which portion of the canvas is currently visible</li>
                  </ul>
                  <h4>Improvements</h4>
                  <ul>
                    <li><strong>Navigation UX:</strong> No more getting lost in infinite space - clear boundaries and position feedback</li>
                    <li><strong>Visual Feedback:</strong> Real-time minimap only appears when needed, keeping interface clean</li>
                    <li><strong>Performance:</strong> Constrained canvas area reduces memory usage and improves rendering performance</li>
                  </ul>
                </div>
              </div>

              {/* Version 1.2.0 */}
              <div className="version-card">
                <div className="version-header">
                  <div className="version-number">v1.2.0</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="version-date">August 27, 2025</div>
                  </div>
                </div>
                <div className="version-features">
                  <h4>New Features</h4>
                  <ul>
                    <li><strong>Copy to Clipboard:</strong> One-click copy button in save modal for easy code sharing</li>
                    <li><strong>Contact & Feedback:</strong> Built-in contact form for feature requests, bug reports, and feedback with Web3Forms integration</li>
                    <li><strong>Enhanced Contact Form:</strong> Improved styling with better visual hierarchy, focus states, and responsive design</li>
                    <li><strong>Consistent Icon Design:</strong> All interface icons now use matching stroke-based design for visual consistency</li>
                  </ul>
                  <h4>Improvements</h4>
                  <ul>
                    <li><strong>User Experience:</strong> Streamlined save workflow with instant clipboard access</li>
                    <li><strong>Visual Polish:</strong> Enhanced form styling with gradient backgrounds and smooth transitions</li>
                    <li><strong>Accessibility:</strong> Better focus indicators and form validation feedback</li>
                  </ul>
                </div>
              </div>

              {/* Version 1.1.0 */}
              <div className="version-card">
                <div className="version-header">
                  <div className="version-number">v1.1.0</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="version-date">August 25, 2025</div>
                  </div>
                </div>
                <div className="version-features">
                  <h4>New Features</h4>
                  <ul>
                    <li><strong>Analysis Tool:</strong> Comprehensive insights panel with system metrics, connection analysis, tag distribution, and network structure insights</li>
                    <li><strong>Color-to-Topic Assignment:</strong> Automatic color categorization with manual override capability - colors automatically detect their most common tag, or you can assign custom topics</li>
                    <li><strong>Enhanced Export:</strong> Image exports now include color legend showing topic assignments with intelligent auto-zoom to fit content</li>
                    <li><strong>Delete Connections:</strong> Added delete button directly in the arrow menu for easy connection removal</li>
                    <li><strong>UI Improvements:</strong> Better terminology ("Custom keywords" instead of "Notes"), cleaner interface, and improved user experience</li>
                    <li><strong>Comprehensive Guide:</strong> Complete documentation with detailed workflows and best practices</li>
                  </ul>
                </div>
              </div>

              {/* Version 1.0.0 - Initial Release */}
              <div className="version-card">
                <div className="version-header">
                  <div className="version-number">v1.0.0</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="version-date">August 22, 2025</div>
                  </div>
                </div>
                <div className="version-features">
                  <h4>Initial Release - Core Features</h4>
                  <ul>
                    <li><strong>Node System:</strong> Create, drag, resize, and edit nodes with name, color, size, description, and tags</li>
                    <li><strong>Connection System:</strong> Create links between nodes with direction arrows (→/←), curved/straight styles, and relationship keywords</li>
                    <li><strong>Sticky Notes:</strong> Add resizable notes with full Markdown support and live preview</li>
                    <li><strong>Canvas Navigation:</strong> Infinite canvas with pan and zoom controls, smooth interactions</li>
                    <li><strong>Save & Open:</strong> Export complete scenes to compact codes and restore them exactly</li>
                    <li><strong>Image Export:</strong> Download high-DPI PNG images of your current canvas view</li>
                    <li><strong>Color Tools:</strong> Built-in color palette with custom color picker support</li>
                    <li><strong>Trash Zone:</strong> Drag-and-drop deletion for quick cleanup of nodes and notes</li>
                    <li><strong>Interactive UI:</strong> Double-click editing, hover states, and intuitive controls</li>
                    <li><strong>Documentation:</strong> Built-in guide and help system for all features</li>
                    <li><strong>Dark Mode:</strong> Automatic dark/light theme support based on system preferences</li>
                    <li><strong>Performance:</strong> Optimized rendering for smooth experience with complex networks</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showContact && (
        <div className="modal-overlay" onClick={() => setShowContact(false)}>
          <div className="modal contact-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact & Feedback</h3>
              <button className="close-btn" onClick={() => setShowContact(false)} aria-label="Close">×</button>
            </div>
            
            {contactSubmitted ? (
              <div className="modal-section" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '24px', marginBottom: '16px' }}>✓</div>
                <h4 style={{ margin: '0 0 12px 0', color: '#10b981' }}>Message Sent!</h4>
                <p style={{ margin: 0, color: '#6b7280' }}>
                  Thank you for your feedback. I'll get back to you soon!
                </p>
              </div>
            ) : (
              <form onSubmit={submitContactForm}>
                <div className="modal-section">
                  <div className="intro-text">
                    <p>
                      Have a feature idea, found a bug, or want to share feedback? I'd love to hear from you!
                    </p>
                  </div>
                  
                  <div className="form-grid">
                    <div className="field-group">
                      <label className="field-label">Your Name</label>
                      <input
                        type="text"
                        className="text-input"
                        required
                        value={contactForm.name}
                        onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter your name"
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Email Address</label>
                      <input
                        type="email"
                        className="text-input"
                        required
                        value={contactForm.email}
                        onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Feedback Type</label>
                    <select
                      className="text-input"
                      value={contactForm.type}
                      onChange={(e) => setContactForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="feature">Feature Request</option>
                      <option value="bug">Bug Report</option>
                      <option value="feedback">General Feedback</option>
                      <option value="question">Question</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Message</label>
                    <textarea
                      className="textarea-input"
                      required
                      rows={5}
                      value={contactForm.message}
                      onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Tell me more about your idea, issue, or feedback..."
                      style={{ minHeight: '120px' }}
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => setShowContact(false)}
                      disabled={contactSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="action-btn btn-blue"
                      disabled={contactSubmitting || !contactForm.name || !contactForm.email || !contactForm.message}
                    >
                      {contactSubmitting ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </div>
              </form>
            )}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label">Copy this code</label>
                <button 
                  className={`action-btn ${copySuccess ? 'btn-green' : 'btn-blue'}`}
                  onClick={copySaveCode}
                  style={{ padding: '6px 12px', fontSize: '13px' }}
                >
                  {copySuccess ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
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
        <button 
          className={`zoom-btn undo-btn ${historyIndex < 0 ? 'disabled' : ''}`} 
          onClick={undo} 
          disabled={historyIndex < 0}
          aria-label="Undo last action" 
          title="Undo last action"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
        </button>
        <button className="zoom-btn" onClick={zoomOut} aria-label="Zoom out">-</button>
        <div className="zoom-level">{Math.round(zoom * 100)}%</div>
        <button className="zoom-btn" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button className="zoom-btn center-btn" onClick={centerView} aria-label="Center view" title="Back to center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2"/>
            <path d="M8 1v6M8 9v6M1 8h6M9 8h6"/>
          </svg>
        </button>
      </div>

      {/* Coordinate display */}
      <div className="coordinate-display">
        <div className="coordinate-item">
          <span className="coordinate-label">X:</span>
          <span className="coordinate-value">{Math.round(-pan.x)}</span>
        </div>
        <div className="coordinate-item">
          <span className="coordinate-label">Y:</span>
          <span className="coordinate-value">{Math.round(-pan.y)}</span>
        </div>
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

      {/* Analysis Panel */}
      {showAnalysisPanel && (
        <>
          <div className="analysis-overlay" onClick={() => setShowAnalysisPanel(false)} />
          <div className="analysis-panel">
            <div className="analysis-header">
              <h3>System Analysis</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="action-btn" onClick={exportAnalysis} title="Export detailed analysis report">
                  Export Report
                </button>
                <button className="close-btn" onClick={() => setShowAnalysisPanel(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <div className="analysis-content">
              {analysisData.system.isEmpty ? (
                <div className="empty-state">
                  <div className="empty-state-icon">◯</div>
                  <h4>No Elements to Analyze</h4>
                  <p>Start building your system by adding nodes and connections to see meaningful insights here.</p>
                </div>
              ) : (
                <>
                  {/* System Overview */}
                  <div className="analysis-section">
                    <button 
                      className="section-header"
                      onClick={() => toggleAnalysisSection('system')}
                    >
                      <span>System Overview</span>
                      <span className={`section-toggle ${expandedAnalysisSections.has('system') ? 'expanded' : ''}`}>
                        {expandedAnalysisSections.has('system') ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedAnalysisSections.has('system') && (
                      <div className="section-content">
                        <div className="metric-grid">
                          <div className="metric-card">
                            <div className="metric-value">{analysisData.system.totalNodes}</div>
                            <div className="metric-label">Total Nodes</div>
                          </div>
                          <div className="metric-card">
                            <div className="metric-value">{analysisData.system.totalConnections}</div>
                            <div className="metric-label">Total Connections</div>
                          </div>
                          <div className="metric-card">
                            <div className="metric-value">{analysisData.system.totalColors}</div>
                            <div className="metric-label">Colors Used</div>
                          </div>
                          <div className="metric-card">
                            <div className="metric-value">{analysisData.system.networkDensity}%</div>
                            <div className="metric-label">Network Density</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top Connected Nodes */}
                  <div className="analysis-section">
                    <button 
                      className="section-header"
                      onClick={() => toggleAnalysisSection('structure')}
                    >
                      <span>Most Connected Nodes</span>
                      <span className={`section-toggle ${expandedAnalysisSections.has('structure') ? 'expanded' : ''}`}>
                        {expandedAnalysisSections.has('structure') ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedAnalysisSections.has('structure') && (
                      <div className="section-content">
                        {analysisData.structure.top5Connected && analysisData.structure.top5Connected.length > 0 ? (
                          <div className="top-connected-list">
                            {analysisData.structure.top5Connected.map((node, index) => (
                              <div key={node.nodeId} className="connected-node-item" onClick={() => highlightNode(node.nodeId)}>
                                <div className="rank-badge">{index + 1}</div>
                                <div className="node-info">
                                  <div className="node-name">{node.title}</div>
                                  <div className="node-connections">{node.count} connections</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="no-connections">
                            No nodes have connections yet. Start linking nodes to see connection rankings.
                          </div>
                        )}

                        {analysisData.structure.isolatedCount && analysisData.structure.isolatedCount > 0 && (
                          <div className="warning-indicator">
                            {analysisData.structure.isolatedCount} isolated nodes need connections
                          </div>
                        )}

                        {analysisData.structure.insights.length > 0 && (
                          <div className="insights-list">
                            {analysisData.structure.insights.map((insight, index) => (
                              <div key={index} className="insight-item">
                                {insight}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Completeness Analysis */}
                  <div className="analysis-section">
                    <button 
                      className="section-header"
                      onClick={() => toggleAnalysisSection('completeness')}
                    >
                      <span>Documentation Quality</span>
                      <span className={`section-toggle ${expandedAnalysisSections.has('completeness') ? 'expanded' : ''}`}>
                        {expandedAnalysisSections.has('completeness') ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedAnalysisSections.has('completeness') && (
                      <div className="section-content">
                        <div className="completeness-score">
                          <div className="score-circle">
                            <div className="score-value">{analysisData.completeness.score}%</div>
                            <div className="score-label">Overall Score</div>
                          </div>
                        </div>

                        <div className="completeness-breakdown">
                          <div className="breakdown-item">
                            <span>Description Coverage</span>
                            <div className="breakdown-bar">
                              <div className="breakdown-fill" style={{ width: `${analysisData.completeness.descriptionCompleteness}%` }} />
                              <span className="breakdown-value">{analysisData.completeness.descriptionCompleteness}%</span>
                            </div>
                          </div>
                          <div className="breakdown-item">
                            <span>Tag Coverage</span>
                            <div className="breakdown-bar">
                              <div className="breakdown-fill" style={{ width: `${analysisData.completeness.tagCompleteness}%` }} />
                              <span className="breakdown-value">{analysisData.completeness.tagCompleteness}%</span>
                            </div>
                          </div>
                          <div className="breakdown-item">
                            <span>Note Utilization</span>
                            <div className="breakdown-bar">
                              <div className="breakdown-fill" style={{ width: `${analysisData.completeness.noteUtilization}%` }} />
                              <span className="breakdown-value">{analysisData.completeness.noteUtilization}%</span>
                            </div>
                          </div>
                        </div>

                        {analysisData.completeness.insights.length > 0 && (
                          <div className="insights-list">
                            {analysisData.completeness.insights.map((insight, index) => (
                              <div key={index} className="insight-item">
                                {insight}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tags Analysis */}
                  <div className="analysis-section">
                    <button 
                      className="section-header"
                      onClick={() => toggleAnalysisSection('organization')}
                    >
                      <span>Most Common Tags</span>
                      <span className={`section-toggle ${expandedAnalysisSections.has('organization') ? 'expanded' : ''}`}>
                        {expandedAnalysisSections.has('organization') ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedAnalysisSections.has('organization') && (
                      <div className="section-content">
                        {analysisData.organization.top10Tags && analysisData.organization.top10Tags.length > 0 ? (
                          <div className="top-tags-list">
                            {analysisData.organization.top10Tags.map(({ tag, count }, index) => (
                              <div key={index} className="tag-rank-item">
                                <div className="rank-badge">{index + 1}</div>
                                <div className="tag-info">
                                  <div className="tag-name">{tag}</div>
                                  <div className="tag-count">{count} nodes</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="no-tags">
                            No tags found. Add tags to your nodes to see tag distribution.
                          </div>
                        )}

                        {/* Color Analysis with Topic Assignment */}
                        {analysisData.organization.topColors && analysisData.organization.topColors.length > 0 && (
                          <div className="color-analysis-section">
                            <div className="subsection-title">Color-to-Topic Assignment</div>
                            <div className="color-assignment-list">
                              {analysisData.organization.topColors.map(({ color, count, percentage }, index) => {
                                const currentTopic = getTopicForColor(color)
                                const isManuallyAssigned = colorTopicAssignments[color] !== undefined
                                const allTags = [...new Set(nodes.flatMap(n => n.tags))].sort()
                                
                                return (
                                  <div key={index} className="color-assignment-item">
                                    <div className="assignment-color-sample" style={{ backgroundColor: color }} />
                                    <div className="assignment-content">
                                      <div className="color-header">
                                        <div className="color-details">
                                          <div className="color-name">{color}</div>
                                          <div className="color-stats">{count} nodes ({percentage}%)</div>
                                        </div>
                                      </div>
                                      
                                      <div className="topic-assignment">
                                        <select 
                                          className="topic-select"
                                          value={currentTopic || ''}
                                          onChange={(e) => {
                                            if (e.target.value === '') {
                                              removeColorAssignment(color)
                                            } else {
                                              assignColorToTopic(color, e.target.value)
                                            }
                                          }}
                                        >
                                          <option value="">{currentTopic ? 'Use automatic assignment' : 'No topic assigned'}</option>
                                          {allTags.map(tag => (
                                            <option key={tag} value={tag}>{tag}</option>
                                          ))}
                                          <option value="__custom__">Custom topic...</option>
                                        </select>
                                        
                                        <input
                                          type="text"
                                          className="custom-topic-input"
                                          placeholder="Or enter custom topic"
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              const value = (e.target as HTMLInputElement).value.trim()
                                              if (value) {
                                                assignColorToTopic(color, value)
                                                ;(e.target as HTMLInputElement).value = ''
                                              }
                                            }
                                          }}
                                        />
                                      </div>
                                      
                                      {currentTopic && (
                                        <div className="topic-display">
                                          <strong>{currentTopic}</strong>
                                          {isManuallyAssigned && (
                                            <button 
                                              className="remove-assignment-btn"
                                              onClick={() => removeColorAssignment(color)}
                                              title="Clear manual assignment"
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            
                            <div className="assignment-help">
                              <div className="help-text">
                                Colors are automatically assigned to their most common tag. 
                                You can override this by selecting a different topic or entering a custom one.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* AI chat removed */}

      {/* Minimap */}
      {showMinimap && (
        <div className="minimap">
          <div className="minimap-content">
            <div className="minimap-canvas">
              <div 
                className="minimap-viewport"
                style={{
                  left: `${((-pan.x - CANVAS_BOUNDS.minX) / (CANVAS_BOUNDS.maxX - CANVAS_BOUNDS.minX)) * 100}%`,
                  top: `${((-pan.y - CANVAS_BOUNDS.minY) / (CANVAS_BOUNDS.maxY - CANVAS_BOUNDS.minY)) * 100}%`,
                  width: `${(window.innerWidth / zoom / (CANVAS_BOUNDS.maxX - CANVAS_BOUNDS.minX)) * 100}%`,
                  height: `${(window.innerHeight / zoom / (CANVAS_BOUNDS.maxY - CANVAS_BOUNDS.minY)) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

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
