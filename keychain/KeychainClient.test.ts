import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HiveSdkError } from "../types/index";
import { KeychainClient } from "./KeychainClient";
import type { HiveKeychainApi, KeychainResponse } from "./types";

interface CapturedSignIn {
  account: string;
  message: string;
  keyType: string;
}

let capturedSignIns: CapturedSignIn[] = [];

function installKeychain(response: KeychainResponse = { success: true, result: "SIG_K1_123" }) {
  const api: HiveKeychainApi = {
    requestCustomJson: () => undefined,
    requestSignBuffer: (account, message, keyType, callback) => {
      capturedSignIns.push({ account, message, keyType });
      callback(response);
    },
  };
  (globalThis as { window?: unknown }).window = { hive_keychain: api };
}

describe("KeychainClient.requestSignIn", () => {
  beforeEach(() => {
    capturedSignIns = [];
    installKeychain();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it("requests a posting signature for the sign-in challenge", async () => {
    const client = new KeychainClient();
    const result = await client.requestSignIn({
      username: "alice",
      message: "Sign in nonce: abc123",
    });

    expect(result.success).toBe(true);
    expect(result.username).toBe("alice");
    expect(result.message).toBe("Sign in nonce: abc123");
    expect(result.authority).toBe("posting");
    expect(result.signature).toBe("SIG_K1_123");
    expect(capturedSignIns).toEqual([
      { account: "alice", message: "Sign in nonce: abc123", keyType: "Posting" },
    ]);
  });

  it("supports active authority signatures", async () => {
    const client = new KeychainClient();
    await client.requestSignIn({
      username: "alice",
      message: "Admin sign-in nonce: xyz789",
      authority: "active",
    });

    expect(capturedSignIns).toEqual([
      { account: "alice", message: "Admin sign-in nonce: xyz789", keyType: "Active" },
    ]);
  });

  it("extracts signatures from object responses", async () => {
    installKeychain({ success: true, result: { signature: "SIG_K1_OBJECT" } });
    const client = new KeychainClient();
    const result = await client.requestSignIn({ username: "alice", message: "nonce" });

    expect(result.signature).toBe("SIG_K1_OBJECT");
  });

  it("calls requestSignBuffer with the Keychain object as its context", async () => {
    let calledWithKeychainContext = false;
    const api: HiveKeychainApi = {
      requestCustomJson: () => undefined,
      requestSignBuffer(account, message, keyType, callback) {
        calledWithKeychainContext = this === api;
        capturedSignIns.push({ account, message, keyType });
        callback({ success: true, result: "SIG_K1_BOUND" });
      },
    };
    (globalThis as { window?: unknown }).window = { hive_keychain: api };

    const client = new KeychainClient();
    const result = await client.requestSignIn({ username: "alice", message: "nonce" });

    expect(calledWithKeychainContext).toBe(true);
    expect(result.signature).toBe("SIG_K1_BOUND");
  });

  it("requires a sign-in message before opening Keychain", async () => {
    const client = new KeychainClient();
    await expect(client.requestSignIn({ username: "alice", message: "" })).rejects.toThrow(
      HiveSdkError,
    );
    expect(capturedSignIns).toHaveLength(0);
  });

  it("maps a user cancellation to KEYCHAIN_REJECTED", async () => {
    installKeychain({ success: false, message: "Request was canceled by the user." });
    const client = new KeychainClient();

    await expect(
      client.requestSignIn({ username: "alice", message: "Sign in nonce: abc123" }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_REJECTED" });
  });

  it("throws KEYCHAIN_UNAVAILABLE when requestSignBuffer is missing", async () => {
    const api: HiveKeychainApi = { requestCustomJson: () => undefined };
    (globalThis as { window?: unknown }).window = { hive_keychain: api };
    const client = new KeychainClient();

    await expect(
      client.requestSignIn({ username: "alice", message: "Sign in nonce: abc123" }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_UNAVAILABLE" });
  });
});