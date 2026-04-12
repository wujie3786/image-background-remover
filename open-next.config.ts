import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({
  cloudflare: {
    useWorkerdCondition: true,
  },
})
