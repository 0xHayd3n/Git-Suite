import { describe, it, expect } from 'vitest'
import { cliToolExtractor } from './cli-tool'
import type { ManifestInfo } from '../types'

describe('cliToolExtractor.getFilesToFetch', () => {
  it('fetches bin entry point from manifest', () => {
    const manifest: ManifestInfo = { ecosystem: 'node', bin: { 'my-cli': './bin/cli.js' } }
    const tree = ['bin/cli.js', 'src/commands/init.ts', 'package.json']
    const result = cliToolExtractor.getFilesToFetch(tree, manifest)
    expect(result).toContain('bin/cli.js')
  })

  it('fetches command files from commands/ directory', () => {
    const tree = ['src/commands/init.ts', 'src/commands/build.ts', 'src/commands/test.ts', 'package.json']
    const result = cliToolExtractor.getFilesToFetch(tree, { ecosystem: 'node', bin: 'cli.js' })
    expect(result).toContain('src/commands/init.ts')
    expect(result).toContain('src/commands/build.ts')
  })

  it('fetches main.rs for Rust CLIs', () => {
    const tree = ['src/main.rs', 'src/cli.rs', 'Cargo.toml']
    const result = cliToolExtractor.getFilesToFetch(tree, { ecosystem: 'rust', name: 'rg' })
    expect(result).toContain('src/main.rs')
    expect(result).toContain('src/cli.rs')
  })

  it('fetches root-level commands/ directory files', () => {
    const tree = ['commands/init.ts', 'commands/build.ts', 'package.json']
    const result = cliToolExtractor.getFilesToFetch(tree, { ecosystem: 'node', bin: 'cli.js' })
    expect(result).toContain('commands/init.ts')
    expect(result).toContain('commands/build.ts')
  })
})

describe('cliToolExtractor.extract', () => {
  it('extracts commander.js commands and options', () => {
    const files = new Map([
      ['src/cli.ts', `
import { program } from 'commander'

program
  .name('my-cli')
  .description('A great CLI tool')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize a new project')
  .option('-t, --template <name>', 'Template to use', 'default')
  .option('--no-git', 'Skip git initialization')
  .action(handleInit)

program
  .command('build')
  .description('Build the project')
  .option('-o, --output <dir>', 'Output directory')
  .option('--minify', 'Minify output', false)
  .action(handleBuild)
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'node', name: 'my-cli' })
    expect(result.commands).toBeDefined()
    expect(result.commands!.length).toBeGreaterThanOrEqual(2)
    const init = result.commands!.find(c => c.name === 'init')
    expect(init).toBeDefined()
    expect(init!.description).toBe('Initialize a new project')
    expect(init!.flags.length).toBeGreaterThanOrEqual(2)
    expect(init!.flags.find(f => f.name === '--template')).toBeDefined()
  })

  it('extracts yargs commands', () => {
    const files = new Map([
      ['src/cli.ts', `
yargs
  .command('serve [port]', 'Start the server', (yargs) => {
    return yargs.option('port', { alias: 'p', type: 'number', default: 3000 })
  })
  .command('build', 'Build for production', (yargs) => {
    return yargs.option('outDir', { type: 'string', default: 'dist' })
  })
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    expect(result.commands).toBeDefined()
    const serve = result.commands!.find(c => c.name === 'serve')
    expect(serve).toBeDefined()
  })

  it('extracts clap derive commands from Rust', () => {
    const files = new Map([
      ['src/cli.rs', `
#[derive(Parser)]
#[command(name = "rg", about = "Search files for patterns")]
struct Cli {
    /// The pattern to search for
    pattern: String,

    /// Files or directories to search
    path: Vec<PathBuf>,

    /// Case-insensitive search
    #[arg(short = 'i', long)]
    ignore_case: bool,

    /// Show line numbers
    #[arg(short = 'n', long)]
    line_number: bool,

    /// Number of context lines
    #[arg(short = 'C', long, default_value = "0")]
    context: usize,
}
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'rust', name: 'ripgrep' })
    expect(result.commands).toBeDefined()
    const flags = result.commands![0]?.flags ?? []
    expect(flags.find(f => f.name === '--ignore-case')).toBeDefined()
    expect(flags.find(f => f.name === '--line-number')).toBeDefined()
  })

  it('extracts click commands from Python', () => {
    const files = new Map([
      ['cli.py', `
@click.command()
@click.option('--count', default=1, help='Number of greetings')
@click.option('--name', prompt='Your name', help='Who to greet')
def hello(count, name):
    """Greet someone."""
    for _ in range(count):
        click.echo(f"Hello, {name}!")
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'python', name: 'test' })
    expect(result.commands).toBeDefined()
    const hello = result.commands!.find(c => c.name === 'hello')
    expect(hello).toBeDefined()
    expect(hello!.flags.find(f => f.name === '--count')).toBeDefined()
  })

  it('extracts argparse commands from Python', () => {
    const files = new Map([
      ['cli.py', `
import argparse

parser = argparse.ArgumentParser(description='Process data')
parser.add_argument('--input', type=str, required=True, help='Input file path')
parser.add_argument('--output', type=str, default='out.csv', help='Output file path')
parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose output')

subparsers = parser.add_subparsers()
convert_parser = subparsers.add_parser('convert', help='Convert file format')
convert_parser.add_argument('--format', type=str, default='csv', help='Target format')
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'python', name: 'test' })
    expect(result.commands).toBeDefined()
    expect(result.commands!.length).toBeGreaterThanOrEqual(1)
    const convert = result.commands!.find(c => c.name === 'convert')
    expect(convert).toBeDefined()
    expect(convert!.flags.find(f => f.name === '--format')).toBeDefined()
    // Root flags should not be on the convert command
    expect(convert!.flags.find(f => f.name === '--input')).toBeUndefined()
  })

  it('extracts commander.js commands with double-quoted strings', () => {
    const files = new Map([
      ['src/cli.ts', `
program
  .command("deploy")
  .description("Deploy to production")
  .option("-e, --env <environment>", "Target environment", "staging")
`],
    ])
    const result = cliToolExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    const deploy = result.commands!.find(c => c.name === 'deploy')
    expect(deploy).toBeDefined()
    expect(deploy!.description).toBe('Deploy to production')
    expect(deploy!.flags.find(f => f.name === '--env')).toBeDefined()
  })

  it('returns empty commands for unrecognized patterns', () => {
    const files = new Map([['main.c', 'int main() { return 0; }']])
    const result = cliToolExtractor.extract(files, { ecosystem: 'unknown' })
    expect(result.commands ?? []).toEqual([])
  })
})
