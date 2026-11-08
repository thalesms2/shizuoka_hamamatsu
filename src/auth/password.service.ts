import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH).toString('hex');
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

    return `scrypt:${salt}:${derived.toString('hex')}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    const [algorithm, salt, key] = hash.split(':');

    if (algorithm !== 'scrypt' || !salt || !key) {
      return false;
    }

    const expected = Buffer.from(key, 'hex');

    if (expected.length !== KEY_LENGTH) {
      return false;
    }

    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

    return timingSafeEqual(derived, expected);
  }
}
