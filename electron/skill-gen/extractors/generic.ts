import type { Extractor } from '../types'
import { libraryExtractor } from './library'
import { cliToolExtractor } from './cli-tool'

export const genericExtractor: Extractor = {
  getFilesToFetch(fileTree, manifest) {
    const libFiles = libraryExtractor.getFilesToFetch(fileTree, manifest)
    const cliFiles = cliToolExtractor.getFilesToFetch(fileTree, manifest)
    const unique = [...new Set([...libFiles, ...cliFiles])]
    return unique.slice(0, 15)
  },

  extract(files, manifest) {
    const libResult = libraryExtractor.extract(files, manifest)
    const cliResult = cliToolExtractor.extract(files, manifest)
    return {
      ...libResult,
      ...cliResult,
      exports: libResult.exports ?? cliResult.exports,
      commands: cliResult.commands ?? libResult.commands,
    }
  },
}
