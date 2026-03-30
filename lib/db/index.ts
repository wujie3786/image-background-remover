import { drizzle } from 'drizzle-orm/d1'
import { users, sessions } from './schema'

export { users, sessions }

export function getDb(d1: D1Database) {
  return drizzle(d1, { users, sessions })
}
