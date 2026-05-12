import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Lightbox } from '../components/Lightbox';

const GALLERY = [
  { src: '/images/a1.jpg', caption: 'Açık çalışma alanı — lounge ve toplantı bölgeleri' },
  { src: '/images/a2.jpg', caption: 'Karşılama lounge ve kafe alanı' },
  { src: '/images/a3.jpg', caption: 'Akıllı bireysel çalışma kapsülleri' },
  { src: '/images/a4.jpg', caption: 'Cam pod ve workstations' },
  { src: '/images/a5.jpg', caption: 'Toplantı odası ve zen köşesi' },
  { src: '/images/a6.jpg', caption: 'Kütüphane ve amfi alanı' },
  { src: '/images/a7.jpg', caption: 'AI tanıtım amfisi' },
];

const PLAN = { src: '/images/plan.jpg', caption: 'AI Lab kat planı' };

export default function Landing() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const allImages = [...GALLERY, PLAN];

  return (
    <div className="min-h-screen bg-kt-cream text-kt-green-900">
      {/* ============== HERO ============== */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/hero.jpg"
            alt="Kuveyt Türk AI Lab"
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-kt-green-900/85 via-kt-green-800/70 to-kt-green-950/90" />
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(200,155,47,0.15) 0%, transparent 50%)',
          }} />
        </div>

        <header className="relative z-10 px-8 pt-16 pb-6 flex justify-center">
          <Logo variant="light" framed size="xl" />
        </header>

        <div className="relative z-10 flex-1 flex items-center justify-center px-8 pb-16">
          <div className="max-w-5xl text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-kt-gold-500/15 text-kt-gold-200 text-sm font-semibold mb-6 border border-kt-gold-500/30 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-kt-gold-400 animate-pulse-gold" />
              Demo Ortam · Kuveyt Türk AI Lab
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 text-balance leading-tight">
              AI Lab <span className="text-kt-gold-400">odalarını</span><br />
              ekibinle birlikte kullan.
            </h1>
            <p className="text-xl text-white/85 max-w-2xl mx-auto text-balance mb-10">
              Merkez binamızdaki 10 oda — İstanbul ilçe ve mahalle isimleriyle adlandırıldı.
              Uygun olanı seç, projenin detaylarını paylaş, kiralama talebini gönder.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-kt-gold-500 hover:bg-kt-gold-400 text-kt-green-900 font-bold shadow-kt-gold hover:shadow-2xl transition-all hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                </svg>
                Giriş Yap
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold border border-white/30 transition-all"
              >
                Kayıt Ol
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM20 8v6m-3-3h6"/>
                </svg>
              </Link>
              <a
                href="#mekan"
                className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-transparent text-white/80 hover:text-white font-semibold transition-all"
              >
                Mekanı keşfet ↓
              </a>
            </div>
          </div>
        </div>

      </section>

      {/* ============== İSTATİSTİKLER ============== */}
      <section className="bg-kt-green-900 text-white py-12 px-8 border-y border-kt-gold-500/20">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { n: '10', t: 'AI Lab odası' },
            { n: '1-3', t: 'Aylık periyot' },
            { n: '4-8', t: 'Kişi kapasitesi' },
            { n: 'RS256', t: 'Güvenli oturum' },
          ].map((f) => (
            <div key={f.t}>
              <div className="text-4xl md:text-5xl font-extrabold text-kt-gold-400 mb-1">{f.n}</div>
              <div className="text-white/70 text-sm uppercase tracking-wider">{f.t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============== MEKANIMIZ GALERI ============== */}
      <section id="mekan" className="py-20 px-8 bg-kt-cream">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-sm font-bold text-kt-gold-700 uppercase tracking-widest mb-3">
              Mekanımız
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-kt-green-900 mb-4 text-balance">
              Tek çatı altında <span className="text-kt-gold-600">10 oda</span>
            </h2>
            <p className="text-lg text-kt-gray-500 max-w-2xl mx-auto">
              Açık çalışma alanları, akıllı kapsüller, toplantı odaları, amfi ve kütüphane —
              hepsi aynı binada, ekiplerin akıcı geçişi için tasarlandı.
            </p>
          </div>

          {/* Gallery grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {GALLERY.map((img, i) => (
              <button
                key={img.src}
                onClick={() => setLightboxIndex(i)}
                className={`group relative overflow-hidden rounded-2xl shadow-kt-soft hover:shadow-kt-card transition-all duration-300 hover:-translate-y-1 ${
                  i === 0 ? 'md:col-span-2 md:row-span-2 aspect-[16/10]' : 'aspect-[4/3]'
                }`}
              >
                <img
                  src={img.src}
                  alt={img.caption}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-kt-green-950/80 via-transparent to-transparent opacity-70 group-hover:opacity-90 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-left">
                  <div className="text-white text-sm font-semibold drop-shadow-lg">{img.caption}</div>
                </div>
                <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {/* Plan section */}
          <div className="bg-white rounded-3xl shadow-kt-soft overflow-hidden border border-kt-gold-100">
            <div className="grid md:grid-cols-5">
              <div className="md:col-span-3 relative aspect-[4/3] md:aspect-auto bg-kt-gray-100 cursor-pointer group" onClick={() => setLightboxIndex(GALLERY.length)}>
                <img
                  src={PLAN.src}
                  alt={PLAN.caption}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-kt-green-950/0 group-hover:bg-kt-green-950/20 transition-colors" />
              </div>
              <div className="md:col-span-2 p-8 md:p-10 flex flex-col justify-center">
                <div className="text-xs font-bold text-kt-gold-700 uppercase tracking-widest mb-2">
                  Kat Planı
                </div>
                <h3 className="text-2xl md:text-3xl font-extrabold text-kt-green-900 mb-4">
                  Tek katta, 10 oda
                </h3>
                <p className="text-kt-gray-500 mb-6 leading-relaxed">
                  Açık merkez bölgenin etrafında kapsüller, toplantı odaları, çalışma istasyonları
                  ve ortak alanlar. Her oda kendi karakterine sahip — adı bir İstanbul mahallesinden
                  esinlenildi.
                </p>
                <button
                  onClick={() => setLightboxIndex(GALLERY.length)}
                  className="btn-secondary self-start"
                >
                  Planı büyüt
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============== CTA ============== */}
      <section className="bg-kt-green-900 py-16 px-8 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4 text-balance">
            Hazırsan, <span className="text-kt-gold-400">odanı seç.</span>
          </h2>
          <p className="text-white/70 mb-8 max-w-xl mx-auto">
            Giriş yap, müsait odalara göz at, projenin detayını paylaş, talebini gönder.
            Admin onayından sonra oda senin.
          </p>
          <div className="flex justify-center">
            <Link to="/login" className="btn-gold inline-flex text-base px-8 py-4">
              Giriş Yap
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-kt-green-950 py-6 px-8 text-center text-white/40 text-xs">
        Kuveyt Türk AI Lab · Demo · Tüm aksiyonlar audit log'a kaydedilir.
      </footer>

      <Lightbox
        images={allImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}
