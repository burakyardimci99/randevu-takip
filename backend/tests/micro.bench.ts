/**
 * Mikro-benchmark'lar (vitest bench) — sıcak saf fonksiyonların throughput'u.
 * Çalıştır: `npm run test:bench`. Bilgilendirme amaçlı (pass/fail yok); regresyon
 * eğilimini izlemek için.
 */
import './setup-env';
import { bench, describe } from 'vitest';
import { maskEmail } from '../src/utils/logger';
import { signAccessToken, verifyAccessToken } from '../src/services/token.service';
import { emailSchema, passwordSchema } from '../src/validators/schemas';

describe('saf fonksiyon benchmark', () => {
  bench('maskEmail', () => {
    maskEmail('ayse.yilmaz@klab.test');
  });

  bench('emailSchema.parse', () => {
    emailSchema.parse('Ayse.Yilmaz@Klab.Test');
  });

  bench('passwordSchema.parse', () => {
    passwordSchema.parse('Guclu1Parola!');
  });
});

describe('JWT benchmark (RS256)', () => {
  const { token } = signAccessToken('user', { sub: 'u1', role: 'user', email: 'u@klab.test' });

  bench('signAccessToken', () => {
    signAccessToken('user', { sub: 'u1', role: 'user', email: 'u@klab.test' });
  });

  bench('verifyAccessToken', () => {
    verifyAccessToken('user', token);
  });
});
