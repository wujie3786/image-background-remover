export interface RemoveBgResponse {
  data: {
    result_b64?: string
    image?: string
  }
  errors: Array<{
    title: string
    detail: string
  }>
}
