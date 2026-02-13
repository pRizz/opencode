import { beforeEach, describe, expect, test } from "bun:test"
import { UserSession } from "../../src/session/user-session"

// UUID regex pattern for validation
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe("UserSession", () => {
  // Clean up sessions between tests by removing all known sessions
  beforeEach(() => {
    // Remove any sessions that might exist from previous tests
    // We do this by creating sessions with known usernames and removing them
    UserSession.removeAllForUser("testuser")
    UserSession.removeAllForUser("otheruser")
  })

  describe("create", () => {
    test("returns session with valid UUID id", () => {
      const session = UserSession.create("testuser")

      expect(session.id).toMatch(uuidPattern)
    })

    test("returns session with provided username", () => {
      const session = UserSession.create("testuser")

      expect(session.username).toBe("testuser")
    })

    test("sets createdAt and lastAccessTime to current time", () => {
      const before = Date.now()
      const session = UserSession.create("testuser")
      const after = Date.now()

      expect(session.createdAt).toBeGreaterThanOrEqual(before)
      expect(session.createdAt).toBeLessThanOrEqual(after)
      expect(session.lastAccessTime).toBe(session.createdAt)
    })

    test("stores userAgent when provided", () => {
      const session = UserSession.create("testuser", "Mozilla/5.0 Test Browser")

      expect(session.userAgent).toBe("Mozilla/5.0 Test Browser")
    })

    test("userAgent is undefined when not provided", () => {
      const session = UserSession.create("testuser")

      expect(session.userAgent).toBeUndefined()
    })

    test("session is retrievable via get after creation", () => {
      const session = UserSession.create("testuser")

      const retrieved = UserSession.get(session.id)
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(session.id)
      expect(retrieved?.username).toBe(session.username)
    })

    test("stores UNIX user info when provided", () => {
      const userInfo = {
        uid: 1001,
        gid: 1001,
        home: "/home/testuser",
        shell: "/bin/bash",
      }

      const session = UserSession.create("testuser", undefined, userInfo)

      expect(session.uid).toBe(1001)
      expect(session.gid).toBe(1001)
      expect(session.home).toBe("/home/testuser")
      expect(session.shell).toBe("/bin/bash")
    })

    test("UNIX user info is undefined when not provided", () => {
      const session = UserSession.create("testuser")

      expect(session.uid).toBeUndefined()
      expect(session.gid).toBeUndefined()
      expect(session.home).toBeUndefined()
      expect(session.shell).toBeUndefined()
    })

    test("stores both userAgent and userInfo when both provided", () => {
      const userInfo = {
        uid: 501,
        gid: 20,
        home: "/Users/testuser",
        shell: "/bin/zsh",
      }

      const session = UserSession.create("testuser", "Test Browser/1.0", userInfo)

      expect(session.userAgent).toBe("Test Browser/1.0")
      expect(session.uid).toBe(501)
      expect(session.gid).toBe(20)
      expect(session.home).toBe("/Users/testuser")
      expect(session.shell).toBe("/bin/zsh")
    })
  })

  describe("get", () => {
    test("returns session when it exists", () => {
      const session = UserSession.create("testuser")

      const retrieved = UserSession.get(session.id)

      expect(retrieved).toEqual(session)
    })

    test("returns undefined for non-existent session ID", () => {
      const result = UserSession.get("nonexistent-session-id")

      expect(result).toBeUndefined()
    })
  })

  describe("touch", () => {
    test("returns true and updates lastAccessTime for existing session", async () => {
      const session = UserSession.create("testuser")
      const originalTime = session.lastAccessTime

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const result = UserSession.touch(session.id)

      expect(result).toBe(true)
      const updated = UserSession.get(session.id)
      expect(updated?.lastAccessTime).toBeGreaterThan(originalTime)
    })

    test("returns false for non-existent session", () => {
      const result = UserSession.touch("nonexistent-session-id")

      expect(result).toBe(false)
    })

    test("does not affect other session fields", async () => {
      const session = UserSession.create("testuser", "Test Agent")

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10))
      UserSession.touch(session.id)

      const updated = UserSession.get(session.id)
      expect(updated?.id).toBe(session.id)
      expect(updated?.username).toBe(session.username)
      expect(updated?.createdAt).toBe(session.createdAt)
      expect(updated?.userAgent).toBe(session.userAgent)
    })
  })

  describe("remove", () => {
    test("returns true and removes session when exists", () => {
      const session = UserSession.create("testuser")

      const result = UserSession.remove(session.id)

      expect(result).toBe(true)
    })

    test("returns false for non-existent session", () => {
      const result = UserSession.remove("nonexistent-session-id")

      expect(result).toBe(false)
    })

    test("session not retrievable after removal", () => {
      const session = UserSession.create("testuser")
      UserSession.remove(session.id)

      const retrieved = UserSession.get(session.id)

      expect(retrieved).toBeUndefined()
    })
  })

  describe("removeAllForUser", () => {
    test("removes all sessions for the specified username", () => {
      const session1 = UserSession.create("testuser")
      const session2 = UserSession.create("testuser")
      const session3 = UserSession.create("testuser")

      UserSession.removeAllForUser("testuser")

      expect(UserSession.get(session1.id)).toBeUndefined()
      expect(UserSession.get(session2.id)).toBeUndefined()
      expect(UserSession.get(session3.id)).toBeUndefined()
    })

    test("returns count of removed sessions", () => {
      UserSession.create("testuser")
      UserSession.create("testuser")
      UserSession.create("testuser")

      const count = UserSession.removeAllForUser("testuser")

      expect(count).toBe(3)
    })

    test("returns 0 for user with no sessions", () => {
      const count = UserSession.removeAllForUser("userwithoutsessions")

      expect(count).toBe(0)
    })

    test("does not affect sessions for other users", () => {
      const testSession = UserSession.create("testuser")
      const otherSession = UserSession.create("otheruser")

      UserSession.removeAllForUser("testuser")

      expect(UserSession.get(testSession.id)).toBeUndefined()
      expect(UserSession.get(otherSession.id)).toBeDefined()
      expect(UserSession.get(otherSession.id)?.username).toBe("otheruser")
    })
  })

  describe("totp session helpers", () => {
    test("setTotpSetupSecret updates canonical and legacy secret fields", () => {
      const session = UserSession.create("testuser")

      const result = UserSession.setTotpSetupSecret(session.id, "SECRET123")

      expect(result).toBe(true)
      const updated = UserSession.get(session.id)
      expect(updated?.totpSetupSecret).toBe("SECRET123")
      expect(updated?.twoFactorSetupSecret).toBe("SECRET123")
    })

    test("clearTotpSetupSecret clears canonical and legacy secret fields", () => {
      const session = UserSession.create("testuser")
      UserSession.setTotpSetupSecret(session.id, "SECRET123")

      const result = UserSession.clearTotpSetupSecret(session.id)

      expect(result).toBe(true)
      const updated = UserSession.get(session.id)
      expect(updated?.totpSetupSecret).toBeUndefined()
      expect(updated?.twoFactorSetupSecret).toBeUndefined()
    })

    test("clearTotpPending clears canonical and legacy pending flags", () => {
      const session = UserSession.create("testuser")
      const stored = UserSession.get(session.id)
      if (!stored) throw new Error("Expected stored session to exist")
      stored.totpPending = true
      stored.twoFactorPending = true

      const result = UserSession.clearTotpPending(session.id)

      expect(result).toBe(true)
      const updated = UserSession.get(session.id)
      expect(updated?.totpPending).toBe(false)
      expect(updated?.twoFactorPending).toBe(false)
    })

    test("legacy two-factor secret helper aliases remain functional", () => {
      const session = UserSession.create("testuser")

      const setResult = UserSession.setTwoFactorSetupSecret(session.id, "SECRET123")
      expect(setResult).toBe(true)
      const afterSet = UserSession.get(session.id)
      expect(afterSet?.totpSetupSecret).toBe("SECRET123")
      expect(afterSet?.twoFactorSetupSecret).toBe("SECRET123")

      const clearResult = UserSession.clearTwoFactorSetupSecret(session.id)
      expect(clearResult).toBe(true)
      const afterClear = UserSession.get(session.id)
      expect(afterClear?.totpSetupSecret).toBeUndefined()
      expect(afterClear?.twoFactorSetupSecret).toBeUndefined()
    })
  })
})
