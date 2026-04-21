import type { Extractor, RepoType } from '../types'
import { libraryExtractor } from './library'
import { cliToolExtractor } from './cli-tool'
import { frameworkExtractor } from './framework'
import { componentLibraryExtractor } from './component-library'
import { monorepoExtractor } from './monorepo'
import { infrastructureExtractor } from './infrastructure'
import { genericExtractor } from './generic'

const extractors: Record<RepoType, Extractor> = {
  library: libraryExtractor,
  'cli-tool': cliToolExtractor,
  framework: frameworkExtractor,
  'component-library': componentLibraryExtractor,
  monorepo: monorepoExtractor,
  infrastructure: infrastructureExtractor,
  generic: genericExtractor,
}

export function getExtractor(type: RepoType): Extractor {
  return extractors[type]
}
