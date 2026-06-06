import crypto from 'node:crypto'
import { env } from '../env.js'

function getCredentialScope(dateStr: string, region: string) {
  return `${dateStr}/${region}/s3/aws4_request`
}

export function getPresignedUrl(options: {
  method: 'GET' | 'PUT'
  bucket: string
  key: string
  expiresInSeconds?: number
}): string {
  const endpoint = env.S3_ENDPOINT || 'http://localhost:9000'
  const accessKey = env.AWS_ACCESS_KEY_ID || 'ctm_admin'
  const secretKey = env.AWS_SECRET_ACCESS_KEY || 'ctm_minio_pass'
  const region = env.AWS_REGION || 'us-east-1'
  const expires = options.expiresInSeconds ?? 900 // 15 mins default

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z'
  const datestamp = amzDate.substring(0, 8)

  const urlObj = new URL(endpoint)
  const host = urlObj.host
  const path = `/${options.bucket}/${options.key}`
  
  const queryParams = new URLSearchParams()
  queryParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  queryParams.set('X-Amz-Credential', `${accessKey}/${getCredentialScope(datestamp, region)}`)
  queryParams.set('X-Amz-Date', amzDate)
  queryParams.set('X-Amz-Expires', String(expires))
  queryParams.set('X-Amz-SignedHeaders', 'host')

  // Sorted query parameters
  const sortedQuery = Array.from(queryParams.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalRequest = [
    options.method,
    path,
    sortedQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const hashedCanonicalRequest = crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    getCredentialScope(datestamp, region),
    hashedCanonicalRequest
  ].join('\n')

  // Signing key derivation
  const sign = (key: crypto.BinaryLike | crypto.KeyObject, val: string) => {
    return crypto.createHmac('sha256', key).update(val).digest()
  }

  const kDate = sign(`AWS4${secretKey}`, datestamp)
  const kRegion = sign(kDate, region)
  const kService = sign(kRegion, 's3')
  const kSigning = sign(kService, 'aws4_request')

  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex')

  return `${endpoint}${path}?${sortedQuery}&X-Amz-Signature=${signature}`
}
