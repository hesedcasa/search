import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'

import {type CommandEmbedder} from '../search-logic.js'

export type ModelLoadProgress = {
  file?: string
  loaded?: number
  model?: string
  name?: string
  progress?: number
  status: string
  task?: string
  total?: number
}

type FeatureExtractionPipeline = (
  text: string | string[],
  options: {normalize: boolean; pooling: 'mean'},
) => Promise<{data: Float32Array | number[]; dims: number[]}>

type TransformersModule = {
  pipeline(
    task: 'feature-extraction',
    model: string,
    options?: {progress_callback?: (progress: ModelLoadProgress) => void},
  ): Promise<unknown>
}

type TransformersPipelineOptions = {
  progress_callback?: (progress: ModelLoadProgress) => void
}

const MINILM_MODEL = 'Xenova/paraphrase-MiniLM-L3-v2'
const MODEL_CACHE_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx']
// eslint-disable-next-line no-new-func
const importTransformers = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<TransformersModule>
const require = createRequire(import.meta.url)

export class MiniLMCommandEmbedder implements CommandEmbedder {
  private extractorPromise: Promise<FeatureExtractionPipeline> | undefined

  constructor(private readonly options: {onLoadProgress?: (progress: ModelLoadProgress) => void} = {}) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const extractor = await this.getExtractor()
    const output = await extractor(texts, {normalize: true, pooling: 'mean'})
    return tensorToRows(output.data, output.dims)
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    this.extractorPromise ??= importTransformers('@huggingface/transformers').then(async ({pipeline}) => {
      const pipelineOptions: TransformersPipelineOptions = {}
      // eslint-disable-next-line camelcase
      pipelineOptions.progress_callback = this.options.onLoadProgress
      const extractor = await pipeline('feature-extraction', MINILM_MODEL, pipelineOptions)
      return extractor as FeatureExtractionPipeline
    })

    return this.extractorPromise
  }
}

export function isMiniLMModelCached(): boolean {
  const cachePath = getMiniLMModelCachePath()
  return MODEL_CACHE_FILES.every((file) => existsSync(path.join(cachePath, file)))
}

export function getMiniLMModelCachePath(): string {
  const entrypointPath = require.resolve('@huggingface/transformers')
  const packagePath = path.dirname(path.dirname(entrypointPath))
  return path.join(packagePath, '.cache', ...MINILM_MODEL.split('/'))
}

function tensorToRows(data: Float32Array | number[], dims: number[]): number[][] {
  const rows = dims[0] ?? 0
  const columns = dims[1] ?? data.length

  return Array.from({length: rows}, (_, row) => {
    const rowData = data.slice(row * columns, (row + 1) * columns)
    return Array.isArray(rowData) ? rowData : [...rowData]
  })
}
