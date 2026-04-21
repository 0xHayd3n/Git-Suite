// Fixture — imitates a real MCP server file. NOT imported by the app.
const server = {} as any

server.registerTool('search_docs', {
  description: 'Search documentation by keyword.',
  inputSchema: {},
})

server.registerTool('list_files', {
  description: 'List files in a directory.',
})

server.registerTool("get_pr", { description: "Fetch a pull request by number." })
