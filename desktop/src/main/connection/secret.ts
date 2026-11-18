import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import type { CredentialCipher } from "../session/device-credential";

/**
 * Password for the remote Octop instance.
 *
 * Ciphertext goes to ``desktop-remote-login.json`` only when the OS keychain
 * works. Otherwise the password stays in memory for this launch. The connection
 * file and the desktop log never receive it.
 */

export const REMOTE_LOGIN_FILE = "desktop-remote-login.json";
const FILE_MODE = 0o600;

interface StoredPassword {
  v: 1;
  encrypted: true;
  secret: string;
}

export class RemotePasswordStore {
  private readonly path: string;
  private readonly cipher: CredentialCipher;
  private inMemory: string | null = null;

  constructor(home: string, cipher: CredentialCipher) {
    this.path = join(home, REMOTE_LOGIN_FILE);
    this.cipher = cipher;
  }

  get filePath(): string {
    return this.path;
  }

  async read(): Promise<string | null> {
    if (this.inMemory !== null) return this.inMemory;
    let raw: string;
    try {
      raw = await fs.readFile(this.path, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredPassword>;
      if (parsed.encrypted !== true || typeof parsed.secret !== "string" || !parsed.secret) return null;
      if (!(await this.cipher.available())) return null;
      const plain = await this.cipher.decrypt(parsed.secret);
      return plain.length > 0 ? plain : null;
    } catch {
      return null;
    }
  }

  /**
   * Remember the password. Returns false when nothing was written because this
   * host has no keychain; the value is then kept in memory only.
   */
  async write(password: string): Promise<boolean> {
    if (!(await this.cipher.available())) {
      this.inMemory = password;
      await fs.rm(this.path, { force: true });
      return false;
    }
    const payload: StoredPassword = {
      v: 1,
      encrypted: true,
      secret: await this.cipher.encrypt(password),
    };
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, `${JSON.stringify(payload, null, 2)}\n`, { mode: FILE_MODE });
    await fs.chmod(this.path, FILE_MODE);
    this.inMemory = null;
    return true;
  }

  async clear(): Promise<void> {
    this.inMemory = null;
    await fs.rm(this.path, { force: true });
  }
}
