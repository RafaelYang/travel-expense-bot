/**
 * NextAuth v5 認證設定
 * 
 * 登入方式：Google OAuth（主要）+ LINE Login（連結用）
 * - Google：作為唯一登入入口
 * - LINE：登入後自動綁定 LINE User ID，用於 LINE Bot 推播
 */
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Line from "next-auth/providers/line"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  trustHost: true, // Vercel 反向代理需要

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Line({
      clientId: process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
      // LINE 不一定提供 email，用 sub 作為佔位 email
      async profile(profile) {
        let email = profile.email || null

        if (!email) {
          // 查詢是否已有透過 LINE Messaging API 綁定的使用者
          const existingUser = await prisma.user.findFirst({
            where: { lineUserId: profile.sub },
          })

          if (existingUser?.email) {
            email = existingUser.email
          } else {
            // 佔位 email，後續 Google 登入時會合併
            email = `${profile.sub}@line.travel-expense.app`
          }
        }

        return {
          id: profile.sub,
          name: profile.name,
          email,
          image: profile.picture,
        }
      },
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  session: { strategy: "jwt" },

  // 修正 mobile Safari LINE OAuth 的 Configuration 錯誤
  // iOS Safari redirect 回來時 session cookie 可能被清除
  cookies: {
    pkceCodeVerifier: {
      name: "__Secure-authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
        maxAge: 900,
      },
    },
    state: {
      name: "__Secure-authjs.state",
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
        maxAge: 900,
      },
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async signIn({ user, account }) {
      try {
        // ===== LINE Login 自動綁定 =====
        if (account?.provider === "line") {
          const lineUserId = account.providerAccountId
          const email = user?.email

          if (email) {
            await prisma.user.updateMany({
              where: {
                email,
                lineUserId: null, // 只更新尚未綁定的
              },
              data: {
                lineUserId,
              },
            })
          }
        }

        // ===== Google Login：合併 LINE-first 使用者 =====
        if (account?.provider === "google" && user?.email) {
          const googleEmail = user.email

          // 查找佔位 email 的 LINE 使用者
          const lineAccounts = await prisma.account.findMany({
            where: { provider: "line" },
            include: { user: true },
          })

          for (const lineAccount of lineAccounts) {
            const lineUser = lineAccount.user
            if (lineUser.email?.endsWith("@line.travel-expense.app")) {
              const googleUser = await prisma.user.findUnique({
                where: { email: googleEmail },
              })

              if (googleUser && googleUser.id !== lineUser.id) {
                // 合併：LINE Account → Google User
                await prisma.account.update({
                  where: { id: lineAccount.id },
                  data: { userId: googleUser.id },
                })

                // 搬 lineUserId
                if (lineUser.lineUserId && !googleUser.lineUserId) {
                  await prisma.user.update({
                    where: { id: googleUser.id },
                    data: { lineUserId: lineUser.lineUserId },
                  })
                }

                // 清除佔位使用者
                await prisma.account.deleteMany({
                  where: { userId: lineUser.id },
                })
                await prisma.user.delete({
                  where: { id: lineUser.id },
                })

                console.log(
                  `[Auth] Merged LINE-first user (${lineUser.email}) → Google user (${googleEmail})`
                )
              }
            }
          }
        }
      } catch (error) {
        console.error("[Auth] signIn callback error:", error)
        // 不因綁定失敗阻止登入
      }
      return true
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string
        token.email = user.email
        token.name = user.name
        token.image = user.image as string | null
      }

      // 前端呼叫 updateSession() 時重新讀取
      if (trigger === "update" && token.id) {
        const updatedUser = await prisma.user.findUnique({
          where: { id: token.id as string },
        })
        if (updatedUser) {
          token.name = updatedUser.name
          token.image = updatedUser.image
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.image as string | null
      }
      return session
    },
  },

  debug: process.env.NODE_ENV === "development",
})
