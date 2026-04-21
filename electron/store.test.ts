// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.hoisted ensures these are initialised before vi.mock factories run
const { mockGet, mockSet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  })),
}))

import { getToken, setToken, clearToken, getGitHubUser, setGitHubUser, clearGitHubUser } from './store'

describe('token', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
    mockDelete.mockReset()
  })

  it('getToken reads github.token', () => {
    mockGet.mockReturnValue('tok123')
    expect(getToken()).toBe('tok123')
    expect(mockGet).toHaveBeenCalledWith('github.token')
  })

  it('getToken returns undefined when not set', () => {
    mockGet.mockReturnValue(undefined)
    expect(getToken()).toBeUndefined()
  })

  it('setToken writes github.token', () => {
    setToken('mytoken')
    expect(mockSet).toHaveBeenCalledWith('github.token', 'mytoken')
  })

  it('clearToken deletes github.token', () => {
    clearToken()
    expect(mockDelete).toHaveBeenCalledWith('github.token')
  })
})

describe('gitHubUser', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
    mockDelete.mockReset()
  })

  it('getGitHubUser returns undefined when username not set', () => {
    mockGet.mockReturnValue(undefined)
    expect(getGitHubUser()).toBeUndefined()
    expect(mockGet).toHaveBeenCalledWith('github.username')
  })

  it('getGitHubUser returns username and avatarUrl', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'github.username') return 'alice'
      if (key === 'github.avatarUrl') return 'https://example.com/avatar.png'
    })
    expect(getGitHubUser()).toEqual({ username: 'alice', avatarUrl: 'https://example.com/avatar.png' })
  })

  it('getGitHubUser returns empty string avatarUrl when avatarUrl not stored', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'github.username') return 'alice'
      return undefined
    })
    expect(getGitHubUser()).toEqual({ username: 'alice', avatarUrl: '' })
  })

  it('setGitHubUser writes both keys', () => {
    setGitHubUser('alice', 'https://example.com/avatar.png')
    expect(mockSet).toHaveBeenCalledWith('github.username', 'alice')
    expect(mockSet).toHaveBeenCalledWith('github.avatarUrl', 'https://example.com/avatar.png')
  })

  it('clearGitHubUser deletes both keys', () => {
    clearGitHubUser()
    expect(mockDelete).toHaveBeenCalledWith('github.username')
    expect(mockDelete).toHaveBeenCalledWith('github.avatarUrl')
  })
})
