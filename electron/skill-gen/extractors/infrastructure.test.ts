import { describe, it, expect } from 'vitest'
import { infrastructureExtractor } from './infrastructure'

describe('infrastructureExtractor.getFilesToFetch', () => {
  it('fetches terraform and helm files', () => {
    const tree = ['main.tf', 'variables.tf', 'values.yaml', 'Chart.yaml', 'src/index.ts']
    const result = infrastructureExtractor.getFilesToFetch(tree, { ecosystem: 'unknown' })
    expect(result).toContain('main.tf')
    expect(result).toContain('variables.tf')
    expect(result).toContain('values.yaml')
  })
})

describe('infrastructureExtractor.extract', () => {
  it('extracts Terraform variables and resources', () => {
    const files = new Map([
      ['variables.tf', `
variable "region" {
  type    = string
  default = "us-east-1"
  description = "AWS region"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}
`],
      ['main.tf', `
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = var.instance_type
}

resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
}
`],
    ])
    const result = infrastructureExtractor.extract(files, { ecosystem: 'unknown' })
    expect(result.configSchema).toBeDefined()
    expect(result.configSchema!.find(c => c.key === 'region')).toBeDefined()
    expect(result.resources).toBeDefined()
    expect(result.resources!.find(r => r.name === 'web' && r.type === 'aws_instance')).toBeDefined()
  })

  it('returns empty for non-infra files', () => {
    const files = new Map([['index.ts', 'console.log("hello")']])
    const result = infrastructureExtractor.extract(files, { ecosystem: 'unknown' })
    expect(result.resources ?? []).toEqual([])
    expect(result.configSchema ?? []).toEqual([])
  })

  it('extracts Helm values from values.yaml', () => {
    const files = new Map([
      ['values.yaml', `
replicaCount: 3
image:
  repository: nginx
  tag: latest
service:
  type: ClusterIP
  port: 80
`],
    ])
    const result = infrastructureExtractor.extract(files, { ecosystem: 'unknown' })
    expect(result.configSchema).toBeDefined()
    expect(result.configSchema!.find(c => c.key === 'replicaCount')).toBeDefined()
  })
})
