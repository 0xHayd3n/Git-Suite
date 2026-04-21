import { describe, it, expect } from 'vitest'
import { frameworkExtractor } from './framework'

describe('frameworkExtractor.getFilesToFetch', () => {
  it('fetches middleware and route files', () => {
    const tree = ['src/middleware/auth.ts', 'src/routes/api.ts', 'src/config/app.ts', 'src/index.ts']
    const result = frameworkExtractor.getFilesToFetch(tree, { ecosystem: 'node' })
    expect(result).toContain('src/middleware/auth.ts')
    expect(result).toContain('src/routes/api.ts')
    expect(result).toContain('src/config/app.ts')
  })
})

describe('frameworkExtractor.extract', () => {
  it('extracts Express middleware and routes', () => {
    const files = new Map([
      ['src/app.ts', `
app.use(cors())
app.use(express.json())
app.use('/api', apiRouter)
router.get('/users', getUsers)
router.post('/users', createUser)
router.delete('/users/:id', deleteUser)
`],
    ])
    const result = frameworkExtractor.extract(files, { ecosystem: 'node' })
    expect(result.plugins).toBeDefined()
    expect(result.plugins!.length).toBeGreaterThan(0)
    expect(result.plugins!.find(p => p.name === 'cors')).toBeDefined()
  })

  it('extracts FastAPI routes', () => {
    const files = new Map([
      ['main.py', `
@app.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"item_id": item_id}

@app.post("/items/")
async def create_item(item: Item):
    return item
`],
    ])
    const result = frameworkExtractor.extract(files, { ecosystem: 'python' })
    expect(result.plugins).toBeDefined()
    expect(result.plugins!.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty for unrecognized patterns', () => {
    const files = new Map([['main.ts', 'console.log("hello")']])
    const result = frameworkExtractor.extract(files, { ecosystem: 'node' })
    expect(result.plugins ?? []).toEqual([])
  })
})
