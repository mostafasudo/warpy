import { jest } from "@jest/globals"

export const mockFetch = (response: Response) =>
  jest
    .spyOn(globalThis as typeof globalThis & { fetch: typeof fetch }, "fetch")
    .mockImplementation(() => Promise.resolve(response))

export const jsonResponse = <T>(payload: T, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as unknown as Response)

export const textResponse = (message: string, status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("not implemented")
    },
    text: async () => message
  } as unknown as Response)
