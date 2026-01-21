import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    refreshToken?: string
    user?: {
      id: number
      email: string
      name: string
      is_active: boolean
      is_admin: boolean
      email_verified: boolean
      created_at: string
      updated_at?: string
    }
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    user?: {
      id: number
      email: string
      name: string
      is_active: boolean
      is_admin: boolean
      email_verified: boolean
      created_at: string
      updated_at?: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    user?: {
      id: number
      email: string
      name: string
      is_active: boolean
      is_admin: boolean
      email_verified: boolean
      created_at: string
      updated_at?: string
    }
  }
}
