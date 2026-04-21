import type { CreateTemplate } from '../../src/types/create'

export const TEMPLATES: CreateTemplate[] = [
  {
    id: 'mcp-server',
    name: 'MCP Server Starter',
    description: 'Expose tools, resources, and prompts to any MCP client.',
    toolType: 'mcp',
    gradient: ['#1a2a4a', '#0f1520'],
    emoji: '🔌',
  },
  {
    id: '3d-web-app',
    name: '3D Interactive App',
    description: 'Browser-based 3D with Three.js, physics, and shaders.',
    toolType: 'webapp',
    gradient: ['#1a1a3a', '#0f0f20'],
    emoji: '🎮',
  },
  {
    id: 'cli-tool',
    name: 'CLI Tool',
    description: 'Terminal utility, cross-platform, ships as a binary.',
    toolType: 'cli',
    gradient: ['#1a2a1a', '#0f150f'],
    emoji: '⚡',
  },
  {
    id: 'desktop-widget',
    name: 'Desktop Widget',
    description: 'Always-on-top Electron overlay, cross-platform.',
    toolType: 'widget',
    gradient: ['#2a1a1a', '#150f0f'],
    emoji: '🖥️',
  },
  {
    id: 'data-dashboard',
    name: 'Data Dashboard',
    description: 'Charts and tables connected to any API or dataset.',
    toolType: 'webapp',
    gradient: ['#1a2a2a', '#0f1515'],
    emoji: '📊',
  },
  {
    id: 'blank',
    name: 'Start from scratch',
    description: 'Blank canvas, no template.',
    toolType: 'blank',
    gradient: ['#111122', '#0a0a15'],
    emoji: '+',
  },
]
