/**
 * Seed data: 25 İstanbul oda + demo user + demo admin.
 *
 * Güvenlik:
 * - Argon2id ile password hashing (app_security.md §7).
 * - Demo credential'lar sadece DEV ortamında; prod'da bunlar yer almaz.
 */
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { getDb } from './schema';

interface RoomSeed {
  code: string;
  district: string;
  neighborhood: string;
  capacity: number;
  description: string;
}

/**
 * Notlar:
 *  - Tüm odalar AI Lab merkez binasında, aynı kat & blokta yer alır.
 *  - Oda isimleri İstanbul ilçe/mahalle adlarından türetilmiştir (lokasyon değildir).
 *  - district/neighborhood alanları yalnızca isimlendirme amaçlıdır.
 */
/**
 * theme: Her odaya bir AI/tech teması atanır — frontend tematik SVG illustrasyon seçer.
 * Olası temalar: 'robot', 'pc', 'neural', 'chatbot', 'data', 'brain', 'code', 'cloud',
 *               'vector', 'agent'
 */
interface RoomSeedExt extends RoomSeed {
  theme: string;
}

const ROOMS: RoomSeedExt[] = [
  { code: 'KT-01', district: 'Kadıköy',     neighborhood: 'Moda',         capacity: 6, theme: 'robot',   description: 'Doğal ışıklı, sessiz pod. Küçük ekip çalışmaları için ideal.' },
  { code: 'KT-02', district: 'Beşiktaş',    neighborhood: 'Bebek',        capacity: 4, theme: 'pc',      description: 'Butik toplantı odası, video konferans donanımlı.' },
  { code: 'KT-03', district: 'Şişli',       neighborhood: 'Nişantaşı',    capacity: 8, theme: 'neural',  description: 'Geniş workshop odası, üç adet beyaz tahta ve sunum ekranı.' },
  { code: 'KT-04', district: 'Üsküdar',     neighborhood: 'Kuzguncuk',    capacity: 4, theme: 'chatbot', description: 'Sessiz odaklanma odası, telefon kabinli bireysel çalışma.' },
  { code: 'KT-05', district: 'Sarıyer',     neighborhood: 'Tarabya',      capacity: 6, theme: 'data',    description: 'Premium toplantı odası, hibrit sunum altyapılı.' },
  { code: 'KT-06', district: 'Beyoğlu',     neighborhood: 'Cihangir',     capacity: 4, theme: 'brain',   description: 'Tasarım odaklı stüdyo, akıllı tahta ile prototipleme.' },
  { code: 'KT-07', district: 'Beykoz',      neighborhood: 'Anadolu Hisarı', capacity: 6, theme: 'code',  description: 'Hibrit toplantı odası, 4K kamera ve dizi mikrofon.' },
  { code: 'KT-08', district: 'Bakırköy',    neighborhood: 'Yeşilköy',     capacity: 8, theme: 'cloud',   description: 'Geniş ekip odası, U masa düzeni ve büyük sunum ekranı.' },
  { code: 'KT-09', district: 'Eyüp',        neighborhood: 'Pierre Loti',  capacity: 4, theme: 'vector',  description: 'Yüksek konsantrasyon pod, ses yalıtımlı.' },
  { code: 'KT-10', district: 'Maltepe',     neighborhood: 'Cevizli',      capacity: 6, theme: 'agent',   description: 'AI deney odası, GPU iş istasyonlu masa.' },
];

interface DemoUserSeed {
  email: string;
  password: string;
  fullName: string;
}

const DEMO_USERS: DemoUserSeed[] = [
  { email: 'user@klab.test', password: 'Demo1234!Pass', fullName: 'Demo Kullanıcı' },
  { email: 'ayse.yilmaz@klab.test', password: 'Ayse1234!Pass', fullName: 'Ayşe Yılmaz' },
  { email: 'mehmet.demir@klab.test', password: 'Mehmet1234!', fullName: 'Mehmet Demir' },
];

const DEMO_ADMINS: DemoUserSeed[] = [
  { email: 'admin@klab.test', password: 'Admin1234!Pass', fullName: 'Demo Admin' },
];

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
};

export async function seedRooms(): Promise<void> {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM rooms').get() as { count: number };
  if (existing.count >= ROOMS.length) {
    console.log(`[SEED] Odalar zaten yüklü (${existing.count} adet), atlanıyor.`);
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO rooms (id, code, name, district, neighborhood, capacity, description, theme)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction((rooms: RoomSeedExt[]) => {
    for (const room of rooms) {
      const name = `${room.district} · ${room.neighborhood}`;
      insert.run(nanoid(), room.code, name, room.district, room.neighborhood, room.capacity, room.description, room.theme);
    }
  });

  txn(ROOMS);
  console.log(`[SEED] ${ROOMS.length} oda eklendi.`);
}

export async function seedUsers(): Promise<void> {
  const db = getDb();

  const existingUser = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUser.count === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES (?, ?, ?, ?)
    `);
    for (const u of DEMO_USERS) {
      const hash = await argon2.hash(u.password, ARGON2_OPTIONS);
      insertUser.run(nanoid(), u.email, hash, u.fullName);
      console.log(`[SEED] User eklendi: ${u.email}`);
    }
  } else {
    console.log(`[SEED] User'lar zaten yüklü (${existingUser.count}), atlanıyor.`);
  }

  const existingAdmin = db.prepare('SELECT COUNT(*) as count FROM admins').get() as { count: number };
  if (existingAdmin.count === 0) {
    const insertAdmin = db.prepare(`
      INSERT INTO admins (id, email, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, 'super_admin')
    `);
    for (const a of DEMO_ADMINS) {
      const hash = await argon2.hash(a.password, ARGON2_OPTIONS);
      insertAdmin.run(nanoid(), a.email, hash, a.fullName);
      console.log(`[SEED] Admin eklendi: ${a.email}`);
    }
  } else {
    console.log(`[SEED] Admin'ler zaten yüklü (${existingAdmin.count}), atlanıyor.`);
  }
}

export async function runSeed(): Promise<void> {
  await seedRooms();
  await seedUsers();
}
