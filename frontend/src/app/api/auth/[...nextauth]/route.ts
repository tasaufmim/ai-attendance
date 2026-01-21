import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { NextAuthOptions } from "next-auth"

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })

          if (!response.ok) {
            return null
          }

          const data = await response.json()

          return {
            id: data.user.id.toString(),
            email: data.user.email,
            name: data.user.name,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            user: data.user,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user) {
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

          // Send Google OAuth data to backend
          const response = await fetch(`${API_URL}/auth/oauth/callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              provider: 'google',
              provider_id: user.id,
              email: user.email!,
              name: user.name!,
              provider_data: {
                picture: (user as any).image,
              }
            }),
          })

          if (response.ok) {
            const data = await response.json()
            token.accessToken = data.access_token
            token.refreshToken = data.refresh_token
            token.user = data.user
          }
        } catch (error) {
          console.error('OAuth callback error:', error)
        }
      }

      if (user && (user as any).accessToken) {
        token.accessToken = (user as any).accessToken
        token.refreshToken = (user as any).refreshToken
        token.user = (user as any).user
      }

      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.refreshToken = token.refreshToken
      session.user = token.user
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
  },
  session: {
    strategy: "jwt",
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
