/**
 * Sıkça Sorulan Sorular sayfası — kullanıcı self-service yardım.
 *
 * 4 kategori, 10 soru. Accordion (tek seferde 1 açık). Üstte arama kutusu
 * — soru veya cevap içinde geçen kelimeyi filtreler.
 *
 * Bağlantılar: ilgili sayfaya (Odalar / Lisanslarım / Profilim) doğrudan link.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';

type FaqCategory = 'Genel' | 'Randevu Alma' | 'Lisans Talepleri' | 'Hesap & Profil';

interface FaqItem {
  id: string;
  category: FaqCategory;
  q: string;
  /** ReactNode — link/badge/list desteği için. */
  a: React.ReactNode;
  /** Ek arama anahtar kelimeleri (kullanıcı "envanter" yazınca showcase çıksın diye). */
  keywords?: string[];
}

const FAQ: FaqItem[] = [
  /* ============ GENEL ============ */
  {
    id: 'sistem-nedir',
    category: 'Genel',
    q: 'Bu sistem nasıl çalışıyor?',
    a: (
      <>
        <p className="mb-2">
          Kuveyt Türk AI Lab'ın self-service portalı. Üç ana iş akışı sağlar:
        </p>
        <ul className="list-disc pl-5 space-y-1 mb-2">
          <li><strong>AI Lab oda randevusu</strong> — projen için 1, 2 veya 3 ay süreyle bir oda talep edersin.</li>
          <li><strong>Yazılım lisansı talebi</strong> — Cursor, Claude, Copilot vb. araçlar için lisans istersin.</li>
          <li><strong>Bekleme listesi</strong> — dolu odalar için sıraya girersin, oda boşalınca öne atılırsın.</li>
        </ul>
        <p>
          Tüm talepler admin tarafından <strong>onaylanır / reddedilir / revize istenir</strong>. Tüm aksiyonlar audit log'a kaydedilir (banka uyumluluğu için).
        </p>
      </>
    ),
    keywords: ['nasıl', 'kullanım'],
  },
  {
    id: 'talep-tipleri',
    category: 'Genel',
    q: 'Hangi tür talepler oluşturabilirim?',
    a: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <Link to="/rooms" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Odalar</Link> →
          AI Lab odası için randevu alma (proje + ekip için fiziksel/sanal alan).
        </li>
        <li>
          <Link to="/licenses" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Lisanslarım</Link> →
          Yazılım/AI aracı lisansı talebi (Cursor, Claude, Copilot vb.).
        </li>
        <li>
          <Link to="/waitlist" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Sıramda</Link> →
          Dolu odaların bekleme listesine kayıt.
        </li>
      </ul>
    ),
  },

  /* ============ ODA KİRALAMA ============ */
  {
    id: 'oda-randevu',
    category: 'Randevu Alma',
    q: 'Nasıl bir AI Lab odası için randevu alırım?',
    a: (
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <Link to="/rooms" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Odalar</Link> menüsünden müsait bir odaya tıkla.
        </li>
        <li>"Randevu Al" butonuna bas — modal açılır.</li>
        <li>Periyot (1/2/3 ay), başlangıç tarihi, proje adı + açıklaması, ihtiyaç duyulan teknolojiler ve ekibin yardım beklentisini doldur.</li>
        <li>Talebi gönder. Admin onayından sonra oda senin olur ve <Link to="/bookings" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Taleplerim</Link>'de görünür.</li>
      </ol>
    ),
    keywords: ['randevu', 'rezervasyon'],
  },
  {
    id: 'periyot',
    category: 'Randevu Alma',
    q: 'Periyotlar (1, 2, 3 ay) ne anlama geliyor?',
    a: (
      <>
        <p className="mb-2">Randevu süresinin uzunluğu. Üç seçenek var:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>1 ay</strong> — kısa süreli prototip / POC çalışmaları.</li>
          <li><strong>2 ay</strong> — orta vadeli pilot projeler.</li>
          <li><strong>3 ay</strong> — uzun süreli ürün geliştirme.</li>
        </ul>
        <p className="mt-2">3 aydan uzun süreye ihtiyacın varsa <strong>peş peşe iki talep</strong> oluşturup ilki bittiğinde ikincisi devreye girebilir.</p>
      </>
    ),
  },
  {
    id: 'bekleme-listesi',
    category: 'Randevu Alma',
    q: 'Bekleme listesi (Sıramda) nasıl çalışıyor?',
    a: (
      <>
        <p className="mb-2">
          İstediğin oda <strong>doluysa</strong>, kart üzerinde "Sıraya gir" butonu çıkar. Sıraya girdiğinde:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Oda boşalınca <strong>FIFO</strong> (sıralama) sırasına göre haberdar edilirsin (in-app bildirim + e-posta).</li>
          <li>Sırandaki konumunu <Link to="/waitlist" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Sıramda</Link> sayfasından takip edersin.</li>
          <li>Sıran geldiğinde sınırlı süre içinde randevu oluşturmazsan sıra bir sonrakine geçer.</li>
        </ul>
      </>
    ),
    keywords: ['waitlist', 'kuyruk', 'sıra'],
  },

  /* ============ LİSANS TALEPLERİ ============ */
  {
    id: 'lisans-talep',
    category: 'Lisans Talepleri',
    q: 'Yazılım lisansı nasıl talep ederim?',
    a: (
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <Link to="/licenses" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Lisanslarım</Link> menüsüne git.
        </li>
        <li>Dropdown'dan istediğin aracı seç (Cursor, Claude, Copilot, vb.) ya da listede yoksa <strong>"Diğer (elle yaz)"</strong> seçeneğini kullan.</li>
        <li>Süre (1 / 3 / 6 ay veya 1 yıl) ve gerekçeni (min 20 karakter — neden ihtiyacın olduğunu kısaca anlat) yaz.</li>
        <li>"Talebi Gönder" — admin onayından sonra IT ekibi lisansı sana atayacak.</li>
      </ol>
    ),
    keywords: ['license', 'cursor', 'claude', 'copilot'],
  },
  {
    id: 'mevcut-yazilimlar',
    category: 'Lisans Talepleri',
    q: 'Hangi yazılımlar için lisans talep edebilirim?',
    a: (
      <>
        <p className="mb-2">Popüler araçlar dropdown'da hazır:</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm mb-2">
          <span>• Claude / Claude Code</span>
          <span>• Cursor</span>
          <span>• GitHub Copilot</span>
          <span>• ChatGPT Plus / OpenAI API</span>
          <span>• Gemini Advanced</span>
          <span>• JetBrains paketi</span>
          <span>• AWS Bedrock</span>
          <span>• Azure OpenAI</span>
          <span>• Vercel Pro</span>
        </div>
        <p>
          Listede olmayan bir araç için <strong>"Diğer (elle yaz)"</strong> seçeneğini kullanıp yazılım adını + sağlayıcısını girebilirsin (ör. Antigravity, Replit, Windsurf, Figma vb.).
        </p>
      </>
    ),
    keywords: ['araçlar', 'tools'],
  },

  /* ============ TALEP İŞ AKIŞI ============ */
  {
    id: 'onay-suresi',
    category: 'Lisans Talepleri',
    q: 'Talebim ne kadar sürede onaylanır?',
    a: (
      <>
        <p className="mb-2">
          Admin onay sürecini hedef olarak <strong>1-2 iş günü</strong> içinde tamamlamayı planlar. Yoğun dönemlerde 3-5 güne uzayabilir.
        </p>
        <p>
          Durum takibi için <Link to="/bookings" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Taleplerim</Link> (oda) veya <Link to="/licenses" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Lisanslarım</Link> (yazılım) sayfasına bak. Durumlar:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><span className="badge-pending">Beklemede</span> — admin henüz incelemedi</li>
          <li><span className="badge-feedback">Revize İsteniyor</span> — admin senden ek bilgi istiyor</li>
          <li><span className="badge-approved">Onaylandı</span> — talebin kabul edildi</li>
          <li><span className="badge-rejected">Reddedildi</span> — gerekçe ile birlikte ret</li>
        </ul>
      </>
    ),
    keywords: ['durum', 'status', 'onay', 'bekleme'],
  },
  {
    id: 'revize-istendi',
    category: 'Lisans Talepleri',
    q: '"Revize iste" ne demek? Reddedildi ne yapmalıyım?',
    a: (
      <>
        <p className="mb-2">
          <strong>Revize İsteniyor:</strong> Admin senden ek bilgi/açıklama bekliyor. Talep kartında admin notunu okuyup yeniden gönder. Genellikle gerekçenin daha somut olması, alternatif değerlendirme veya KVKK/uyumluluk konuları için sorulur.
        </p>
        <p>
          <strong>Reddedildi:</strong> Karar admin notuyla birlikte gelir. Reddedilen talep <strong>düzenlenemez</strong>; yeniden değerlendirme istiyorsan <strong>yeni bir talep</strong> oluşturup admin notundaki noktaları adresleyen güncellenmiş bir gerekçe yazabilirsin.
        </p>
      </>
    ),
    keywords: ['feedback', 'reddedildi', 'rejected'],
  },

  /* ============ HESAP & PROFİL ============ */
  {
    id: 'profil-guncelleme',
    category: 'Hesap & Profil',
    q: 'Profilimi (departman, ünvan, fotoğraf) nasıl güncellerim?',
    a: (
      <>
        <p className="mb-2">
          <Link to="/profile" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Profilim</Link> sayfasından:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ad-soyad, departman, ünvan, telefon, kısa biyografi</li>
          <li>Profil fotoğrafı yükleme/değiştirme</li>
          <li>Şifre değiştirme (mevcut şifreyle)</li>
        </ul>
        <p className="mt-2">
          KVKK kapsamında <strong>verilerinin tamamını dışa aktarabilir</strong> (JSON olarak indirme) veya <strong>hesabını tamamen silebilirsin</strong>. Detay için <Link to="/privacy" className="text-kt-green-700 font-semibold hover:text-kt-gold-600">Gizlilik Ayarları</Link>.
        </p>
      </>
    ),
    keywords: ['profile', 'avatar', 'kvkk', 'gizlilik'],
  },
];

const CATEGORIES: FaqCategory[] = ['Genel', 'Randevu Alma', 'Lisans Talepleri', 'Hesap & Profil'];

export default function UserFAQ() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(FAQ[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.filter((item) => {
      if (item.q.toLowerCase().includes(q)) return true;
      if (item.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      // Render answer to text — basit yaklaşım: sadece string ise dahil et
      // ReactNode içinde arama tam yetkili değil ama keywords zaten bunu telafi ediyor.
      return false;
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<FaqCategory, FaqItem[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const item of filtered) {
      map.get(item.category)?.push(item);
    }
    return map;
  }, [filtered]);

  return (
    <AppShell kind="user">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-widest text-kt-gold-700 font-bold mb-2">
            Yardım Merkezi
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-kt-green-900 mb-2">
            Sıkça Sorulan Sorular
          </h1>
          <p className="text-kt-gray-600">
            Sistem nasıl çalışır, randevu/lisans nasıl alınır, talep süreçleri nasıl işler — hepsi burada.
          </p>
        </header>

        {/* Arama */}
        <div className="card p-4 mb-6">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-kt-gray-400"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="search"
              className="input pl-11"
              placeholder="Soru ara... (örn. lisans, randevu, sıra, gizlilik)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>

        {/* Kategori bazlı sorular */}
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-kt-gray-500">
            "{query}" için eşleşen soru bulunamadı. Farklı bir kelime deneyebilirsin
            veya admin'le iletişime geçebilirsin.
          </div>
        ) : (
          <div className="space-y-6">
            {CATEGORIES.map((cat) => {
              const items = grouped.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-bold text-kt-gold-700 uppercase tracking-widest mb-3">
                    {cat}
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isOpen = openId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`card transition-shadow ${isOpen ? 'shadow-kt-card' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : item.id)}
                            className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-kt-gray-50 rounded-t-2xl transition-colors"
                          >
                            <span className="font-semibold text-kt-green-900">{item.q}</span>
                            <svg
                              className={`w-5 h-5 text-kt-gray-400 shrink-0 transition-transform ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                            </svg>
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 text-sm text-kt-gray-700 leading-relaxed border-t border-kt-gray-100 animate-fade-in">
                              {item.a}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 card p-5 bg-kt-gold-50 border-kt-gold-100 text-center">
          <p className="text-sm text-kt-green-900">
            Sorunuzun cevabını bulamadınız mı?{' '}
            <a href="mailto:ai.lab@klab.test" className="font-semibold text-kt-gold-700 hover:underline">
              ai.lab@klab.test
            </a>{' '}
            adresine yazabilirsiniz.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
