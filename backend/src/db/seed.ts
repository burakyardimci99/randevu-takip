/**
 * Seed data: 10 oda + 18 kullanıcı + 2 admin + ~30 booking + sosyal engagement.
 *
 * Güvenlik:
 * - Argon2id ile password hashing (app_security.md §7).
 * - Demo credential'lar sadece DEV ortamında; prod'da bunlar yer almaz.
 *
 * Demo amaçlıdır — Vercel canlı demo için sahnelenmiş veri (Kuveyt Türk AI Lab
 * vibe coding atmosferi).
 */
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { getDb } from './schema';

/* ============================================================
 * 1) ODALAR
 * ============================================================ */

interface RoomSeed {
  code: string;
  district: string;
  neighborhood: string;
  capacity: number;
  theme: string;
  description: string;
}

const ROOMS: RoomSeed[] = [
  { code: 'KT-01', district: 'Kadıköy',      neighborhood: 'Moda',           capacity: 6, theme: 'robot',   description: 'Doğal ışıklı, sessiz pod. Küçük ekip çalışmaları için ideal.' },
  { code: 'KT-02', district: 'Beşiktaş',     neighborhood: 'Bebek',          capacity: 4, theme: 'pc',      description: 'Butik toplantı odası, video konferans donanımlı.' },
  { code: 'KT-03', district: 'Şişli',        neighborhood: 'Nişantaşı',      capacity: 8, theme: 'neural',  description: 'Geniş workshop odası, üç adet beyaz tahta ve sunum ekranı.' },
  { code: 'KT-04', district: 'Üsküdar',      neighborhood: 'Kuzguncuk',      capacity: 4, theme: 'chatbot', description: 'Sessiz odaklanma odası, telefon kabinli bireysel çalışma.' },
  { code: 'KT-05', district: 'Sarıyer',      neighborhood: 'Tarabya',        capacity: 6, theme: 'data',    description: 'Premium toplantı odası, hibrit sunum altyapılı.' },
  { code: 'KT-06', district: 'Beyoğlu',      neighborhood: 'Cihangir',       capacity: 4, theme: 'brain',   description: 'Tasarım odaklı stüdyo, akıllı tahta ile prototipleme.' },
  { code: 'KT-07', district: 'Beykoz',       neighborhood: 'Anadolu Hisarı', capacity: 6, theme: 'code',    description: 'Hibrit toplantı odası, 4K kamera ve dizi mikrofon.' },
  { code: 'KT-08', district: 'Bakırköy',     neighborhood: 'Yeşilköy',       capacity: 8, theme: 'cloud',   description: 'Geniş ekip odası, U masa düzeni ve büyük sunum ekranı.' },
  { code: 'KT-09', district: 'Eyüp',         neighborhood: 'Pierre Loti',    capacity: 4, theme: 'vector',  description: 'Yüksek konsantrasyon pod, ses yalıtımlı.' },
  { code: 'KT-10', district: 'Maltepe',      neighborhood: 'Cevizli',        capacity: 6, theme: 'agent',   description: 'AI deney odası, GPU iş istasyonlu masa.' },
];

/* ============================================================
 * 2) KULLANICILAR — 18 kişi (zengin profil)
 * ============================================================ */

interface DemoUserSeed {
  email: string;
  password: string;
  fullName: string;
  department?: string;
  title?: string;
  manager?: string;
  bio?: string;
}

const DEMO_USERS: DemoUserSeed[] = [
  { email: 'user@klab.test',          password: 'Demo1234!Pass',    fullName: 'Demo Kullanıcı',  department: 'AI Lab',                title: 'Demo Hesabı',                manager: 'AI Lab Yöneticisi', bio: 'Demo kullanıcı — sistemi keşfetmek için.' },
  { email: 'ayse.yilmaz@klab.test',   password: 'Ayse1234!Pass',    fullName: 'Ayşe Yılmaz',     department: 'Veri Bilimleri',         title: 'Kıdemli Veri Bilimcisi',     manager: 'Cem Aslan',         bio: 'NLP & öneri sistemleri üzerine çalışıyor; LangChain ve Hugging Face ekosisteminde yetkin.' },
  { email: 'mehmet.demir@klab.test',  password: 'Mehmet1234!',      fullName: 'Mehmet Demir',    department: 'Bireysel Bankacılık',    title: 'Ürün Yöneticisi',            manager: 'Pınar Korkmaz',     bio: 'Müşteri deneyimi ve dijital onboarding ürünlerini yönetiyor.' },
  { email: 'zeynep.kaya@klab.test',   password: 'Zeynep1234!Pass',  fullName: 'Zeynep Kaya',     department: 'Risk Yönetimi',          title: 'Risk Analisti',              manager: 'Tolga Aydın',       bio: 'Kredi risk modellemesi ve dolandırıcılık tespiti odaklı.' },
  { email: 'emre.aksoy@klab.test',    password: 'Emre1234!Pass',    fullName: 'Emre Aksoy',      department: 'BT Operasyonları',       title: 'DevOps Mühendisi',           manager: 'Berk Erdoğan',      bio: 'Kubernetes, AWS ve CI/CD pipeline tasarımı.' },
  { email: 'selin.dogan@klab.test',   password: 'Selin1234!Pass',   fullName: 'Selin Doğan',     department: 'Müşteri Deneyimi',       title: 'UX Tasarımcısı',             manager: 'Pınar Korkmaz',     bio: 'Mobil bankacılık akışlarını araştırıyor; Figma + kullanıcı testleri.' },
  { email: 'burak.sahin@klab.test',   password: 'Burak1234!Pass',   fullName: 'Burak Şahin',     department: 'AI Lab',                 title: 'ML Mühendisi',               manager: 'Cem Aslan',         bio: 'LLM fine-tuning ve RAG mimarileri.' },
  { email: 'defne.arslan@klab.test',  password: 'Defne1234!Pass',   fullName: 'Defne Arslan',    department: 'Yatırım Bankacılığı',    title: 'Kantitatif Analist',         manager: 'Tolga Aydın',       bio: 'Sayısal portföy optimizasyonu, time-series forecasting.' },
  { email: 'kerem.ozturk@klab.test',  password: 'Kerem1234!Pass',   fullName: 'Kerem Öztürk',    department: 'Bireysel Bankacılık',    title: 'Yazılım Geliştirici',        manager: 'Pınar Korkmaz',     bio: 'React + Next.js, müşteri portalı geliştiriyor.' },
  { email: 'elif.celik@klab.test',    password: 'Elif1234!Pass',    fullName: 'Elif Çelik',      department: 'Veri Bilimleri',         title: 'Veri Mühendisi',             manager: 'Cem Aslan',         bio: 'Streaming pipeline\'lar (Kafka + Flink), data quality.' },
  { email: 'furkan.polat@klab.test',  password: 'Furkan1234!Pass',  fullName: 'Furkan Polat',    department: 'AI Lab',                 title: 'Computer Vision Mühendisi',  manager: 'Cem Aslan',         bio: 'OCR, doküman anlama, YOLO & DETR modelleri.' },
  { email: 'naz.yildiz@klab.test',    password: 'Naz1234!PassWord', fullName: 'Naz Yıldız',      department: 'Müşteri Deneyimi',       title: 'Servis Tasarımcısı',         manager: 'Pınar Korkmaz',     bio: 'End-to-end müşteri yolculuğu, journey map\'leme.' },
  { email: 'onur.acar@klab.test',     password: 'Onur1234!Pass',    fullName: 'Onur Acar',       department: 'Kurumsal Bankacılık',    title: 'Çözüm Mimarı',               manager: 'Berk Erdoğan',      bio: 'API entegrasyonları, açık bankacılık.' },
  { email: 'begum.kilic@klab.test',   password: 'Begum1234!Pass',   fullName: 'Begüm Kılıç',     department: 'AI Lab',                 title: 'Yazılım Geliştirici',        manager: 'Cem Aslan',         bio: 'FastAPI + PostgreSQL backend\'leri.' },
  { email: 'tolga.aydin@klab.test',   password: 'Tolga1234!Pass',   fullName: 'Tolga Aydın',     department: 'Risk Yönetimi',          title: 'Risk Direktörü',             manager: 'Pınar Korkmaz',     bio: 'Tüm risk modellerinin yönetimi.' },
  { email: 'pinar.korkmaz@klab.test', password: 'Pinar1234!Pass',   fullName: 'Pınar Korkmaz',   department: 'Müşteri Deneyimi',       title: 'Müdür',                      manager: 'Cem Aslan',         bio: 'Müşteri deneyimi grubunun yöneticisi.' },
  { email: 'cem.aslan@klab.test',     password: 'Cem1234!PassWord', fullName: 'Cem Aslan',       department: 'AI Lab',                 title: 'AI Lab Direktörü',           manager: '—',                 bio: 'AI Lab kurucusu, ML ve veri stratejisi.' },
  { email: 'berk.erdogan@klab.test',  password: 'Berk1234!Pass',    fullName: 'Berk Erdoğan',    department: 'BT Operasyonları',       title: 'BT Müdürü',                  manager: 'Cem Aslan',         bio: 'Bulut altyapısı ve siber güvenlik.' },
];

/* ============================================================
 * 3) ADMINLER — 2 kişi
 * ============================================================ */

interface DemoAdminSeed {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'super_admin';
}

const DEMO_ADMINS: DemoAdminSeed[] = [
  { email: 'admin@klab.test',     password: 'Admin1234!Pass',  fullName: 'Demo Admin',          role: 'super_admin' },
  { email: 'ai.admin@klab.test',  password: 'AILab1234!Pass',  fullName: 'AI Lab Yöneticisi',   role: 'admin' },
];

/* ============================================================
 * 4) BOOKING'LER — ~30 proje (vibe coding projeleri)
 * ============================================================ */

type BookingStatus = 'pending' | 'approved' | 'rejected' | 'feedback_requested';

interface BookingSeed {
  /** Kullanıcı email — sahibi belirler. */
  userEmail: string;
  /** Oda kodu — KT-01..KT-10. */
  roomCode: string;
  periodMonths: 1 | 2 | 3;
  /** YYYY-MM-DD — başlangıç. */
  startDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
  status: BookingStatus;
  adminFeedback?: string;
  /** Highlighted (envanterde öne çıkar). */
  highlight?: boolean;
}

/**
 * Tarih hesap yardımcısı — bugünden offset gün uzaklıkta YYYY-MM-DD üretir.
 * Demo verisi: bazı booking'ler geçmişte (tamamlanmış), bazıları aktif,
 * bazıları gelecekte (ileride başlayacak).
 */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const BOOKINGS: BookingSeed[] = [
  // ---------- APPROVED (ortaya çıkar) ----------
  {
    userEmail: 'ayse.yilmaz@klab.test', roomCode: 'KT-03', periodMonths: 3, startDate: dayOffset(-90),
    projectName: 'AI Müşteri Hizmetleri Asistanı',
    projectDescription: 'Türkçe LLM tabanlı, müşteri taleplerini sınıflandırıp uygun aksiyon öneren chatbot. Bankacılık terimleriyle fine-tune edildi, RAG ile politika döküman desteği. Pilot ekiplerin destek sürelerini %35 düşürdü.',
    helpNeeded: 'Türkçe LLM\'ye bankacılık jargonu için fine-tune dataset hazırlanmasında yardım. KVKK uyumluluğu için PII scrubber.',
    technologies: ['Python', 'PyTorch', 'Hugging Face', 'LangChain', 'FastAPI', 'PostgreSQL'],
    status: 'approved',
    highlight: true,
  },
  {
    userEmail: 'furkan.polat@klab.test', roomCode: 'KT-10', periodMonths: 2, startDate: dayOffset(-60),
    projectName: 'Faturadan Otomatik Gider Tanıma (OCR)',
    projectDescription: 'Mobil bankacılık kullanıcılarının fotoğrafladığı faturalardan tutar, KDV, tedarikçi adını otomatik çıkaran OCR+NER pipeline\'ı. Türkçe fatura formatlarına özel data augmentation.',
    helpNeeded: 'Türkçe fatura verisi etiketlemek için anotatör desteği. Edge cihazda inference optimizasyonu.',
    technologies: ['Python', 'PyTorch', 'OpenCV', 'EasyOCR', 'spaCy', 'Docker'],
    status: 'approved',
    highlight: true,
  },
  {
    userEmail: 'zeynep.kaya@klab.test', roomCode: 'KT-05', periodMonths: 3, startDate: dayOffset(-75),
    projectName: 'Gerçek Zamanlı Dolandırıcılık Tespiti',
    projectDescription: 'EFT/havale işlemlerinde 50ms altında karar veren XGBoost + autoencoder ensemble modeli. Açıklanabilir AI (SHAP) ile risk analistlerine gerekçe sunar.',
    helpNeeded: 'Üretim ortamına geçişte düşük latency için ONNX/Triton optimizasyonu.',
    technologies: ['Python', 'XGBoost', 'PyTorch', 'Apache Kafka', 'Redis', 'ONNX', 'Streamlit'],
    status: 'approved',
    highlight: true,
  },
  {
    userEmail: 'burak.sahin@klab.test', roomCode: 'KT-06', periodMonths: 2, startDate: dayOffset(-45),
    projectName: 'Bankacılık Sesli Asistan',
    projectDescription: 'Mobil uygulamadan sesli komutla bakiye, kart limiti, son işlemler sorgulama. Whisper STT + özel intent classifier + TTS.',
    helpNeeded: 'Türkçe konuşma dilinde özel komutların (yöresel ifadeler) tanınması.',
    technologies: ['Python', 'OpenAI Whisper', 'PyTorch', 'FastAPI', 'WebSocket', 'React Native'],
    status: 'approved',
  },
  {
    userEmail: 'defne.arslan@klab.test', roomCode: 'KT-02', periodMonths: 1, startDate: dayOffset(-30),
    projectName: 'Doğal Dil ile SQL Sorguları',
    projectDescription: 'Analistlerin "Geçen ay İstanbul\'da en yüksek hacimli 10 kurumsal müşteri" gibi sorularını otomatik SQL\'e çeviren araç. Schema-aware prompt + safety guardrails.',
    helpNeeded: 'Üretim DB\'sine güvenli erişim için row-level security pattern\'i.',
    technologies: ['Python', 'OpenAI API', 'LangChain', 'PostgreSQL', 'Next.js', 'TypeScript'],
    status: 'approved',
    highlight: true,
  },
  {
    userEmail: 'elif.celik@klab.test', roomCode: 'KT-08', periodMonths: 3, startDate: dayOffset(-100),
    projectName: 'Sözleşme Sınıflandırma & Riskli Madde Tespiti',
    projectDescription: 'Kurumsal kredi sözleşmelerini otomatik kategorize edip yüksek riskli maddeleri (cezai şart, fesih, gizlilik ihlali) işaretler. Embedding tabanlı benzerlik araması.',
    helpNeeded: 'Hukuk ekibiyle birlikte etiketleme rehberi geliştirme.',
    technologies: ['Python', 'sentence-transformers', 'spaCy', 'FastAPI', 'PostgreSQL pgvector'],
    status: 'approved',
  },
  {
    userEmail: 'kerem.ozturk@klab.test', roomCode: 'KT-01', periodMonths: 2, startDate: dayOffset(-50),
    projectName: 'Kişiye Özel Ürün Önerisi (Recommender)',
    projectDescription: 'Müşterinin işlem geçmişi + demografik veri + segment bilgisinden kredi kartı, mevduat, yatırım ürünü önerisi. Hybrid collaborative + content-based.',
    helpNeeded: 'Cold-start probleminde (yeni müşteri) feature engineering.',
    technologies: ['Python', 'TensorFlow Recommenders', 'BigQuery', 'Airflow', 'Streamlit'],
    status: 'approved',
  },
  {
    userEmail: 'begum.kilic@klab.test', roomCode: 'KT-07', periodMonths: 1, startDate: dayOffset(-25),
    projectName: 'Anomali Tespit Dashboard\'u',
    projectDescription: 'Şube işlem hacimlerinde anormal düşüş/yükselişleri saniyeler içinde yakalayıp Slack\'e alert atan dashboard. Isolation Forest + LSTM autoencoder.',
    helpNeeded: 'False positive oranını düşürmek için adaptif threshold.',
    technologies: ['Python', 'scikit-learn', 'TensorFlow', 'Grafana', 'Prometheus', 'FastAPI'],
    status: 'approved',
  },
  {
    userEmail: 'onur.acar@klab.test', roomCode: 'KT-04', periodMonths: 1, startDate: dayOffset(-20),
    projectName: 'Açık Bankacılık API Sözleşme Analizörü',
    projectDescription: 'Üçüncü taraf fintech\'lerle yapılan API sözleşmelerini otomatik analiz edip uyumluluk kontrol listesi çıkarır. PSD2/KVKK kontrolü.',
    helpNeeded: 'Hukuk ve compliance ekiplerinden domain insight.',
    technologies: ['Python', 'OpenAI API', 'spaCy', 'Streamlit', 'PostgreSQL'],
    status: 'approved',
  },
  {
    userEmail: 'naz.yildiz@klab.test', roomCode: 'KT-06', periodMonths: 2, startDate: dayOffset(-80),
    projectName: 'Müşteri Yolculuğu Görselleştirici',
    projectDescription: 'Anonim event verisinden müşterilerin ürün adoption yolculuğunu sankey diyagramı + heatmap olarak gösteren analitik araç.',
    helpNeeded: 'Frontend\'de büyük graph render performansı.',
    technologies: ['TypeScript', 'D3.js', 'React', 'Next.js', 'ClickHouse'],
    status: 'approved',
  },
  {
    userEmail: 'selin.dogan@klab.test', roomCode: 'KT-09', periodMonths: 1, startDate: dayOffset(-15),
    projectName: 'Mobil Onboarding UX Test Asistanı',
    projectDescription: 'Yeni müşteri onboarding adımlarında kullanıcı davranışını analiz eden, drop-off noktalarına müdahale öneren tool. Heatmap + session replay.',
    helpNeeded: 'KVKK uyumlu session recording (PII otomatik maskeleme).',
    technologies: ['TypeScript', 'React', 'PostHog', 'PostgreSQL'],
    status: 'approved',
  },
  {
    userEmail: 'emre.aksoy@klab.test', roomCode: 'KT-08', periodMonths: 2, startDate: dayOffset(-70),
    projectName: 'Akıllı Sözleşme Audit Aracı',
    projectDescription: 'Solidity sözleşmelerini statik analiz + LLM ile inceleyip yaygın güvenlik açıklarını (reentrancy, integer overflow) raporlayan CI/CD entegre tool.',
    helpNeeded: 'Cardano/Tezos için destek genişletme.',
    technologies: ['Python', 'Slither', 'OpenAI API', 'GitHub Actions', 'Docker'],
    status: 'approved',
  },
  {
    userEmail: 'ayse.yilmaz@klab.test', roomCode: 'KT-05', periodMonths: 1, startDate: dayOffset(-10),
    projectName: 'Gerçek Zamanlı Türkçe Toplantı Çevirisi',
    projectDescription: 'Uluslararası iş ortakları ile yapılan toplantılarda canlı Türkçe-İngilizce çift yönlü çeviri + kalıcı transcript. Edge cihazda çalışır.',
    helpNeeded: 'Bankacılık terimleri için özel sözlük entegrasyonu.',
    technologies: ['Python', 'OpenAI Whisper', 'NLLB', 'WebRTC', 'React'],
    status: 'approved',
  },
  {
    userEmail: 'furkan.polat@klab.test', roomCode: 'KT-03', periodMonths: 2, startDate: dayOffset(-110),
    projectName: 'Bilgi Grafiği ile Kurumsal Arama',
    projectDescription: 'Banka içi dökümanları, e-postaları, wiki sayfalarını semantic search + knowledge graph ile birleştiren kurumsal arama motoru.',
    helpNeeded: 'Authorization layer (hangi çalışan hangi dökümana erişebilir).',
    technologies: ['Python', 'Neo4j', 'sentence-transformers', 'Elasticsearch', 'Next.js'],
    status: 'approved',
  },
  {
    userEmail: 'mehmet.demir@klab.test', roomCode: 'KT-10', periodMonths: 1, startDate: dayOffset(-5),
    projectName: 'Pazarlama Görsel Üretici',
    projectDescription: 'Şubeler için yerel kampanya görselleri (Stable Diffusion + LoRA fine-tune) üreten araç. Marka kurallarına uygun, hızlı iterasyon.',
    helpNeeded: 'Marka rehberini görsel prompt\'a çevirmek için template sistemi.',
    technologies: ['Python', 'Stable Diffusion', 'PyTorch', 'Streamlit', 'AWS S3'],
    status: 'approved',
  },
  {
    userEmail: 'zeynep.kaya@klab.test', roomCode: 'KT-07', periodMonths: 1, startDate: dayOffset(-35),
    projectName: 'Müşteri Şikayet Duygu Analizi',
    projectDescription: 'Sosyal medya ve şikayet kanallarındaki yorumları gerçek zamanlı analiz edip kritik vakaları öncelikli kuyruğa atan duygu analizi sistemi.',
    helpNeeded: 'İronik / sarkastik Türkçe ifadelerde model performansı.',
    technologies: ['Python', 'BERTurk', 'FastAPI', 'Redis', 'React'],
    status: 'approved',
  },

  // ---------- PENDING (admin onay bekliyor) ----------
  {
    userEmail: 'kerem.ozturk@klab.test', roomCode: 'KT-04', periodMonths: 1, startDate: dayOffset(15),
    projectName: 'Sentetik KYC Veri Üretici',
    projectDescription: 'KVKK uyumlu test ortamı için sentetik müşteri verisi üreten araç. Differential privacy + GAN tabanlı.',
    helpNeeded: 'Gerçek dağılıma yakınlık testleri için istatistiksel doğrulama framework\'ü.',
    technologies: ['Python', 'PyTorch', 'SDV (Synthetic Data Vault)', 'Streamlit'],
    status: 'pending',
  },
  {
    userEmail: 'defne.arslan@klab.test', roomCode: 'KT-03', periodMonths: 2, startDate: dayOffset(20),
    projectName: 'Şube Trafiği Saatlik Tahmin Modeli',
    projectDescription: 'Şube ziyaretçi yoğunluğunu saat bazında tahmin edip kasiyer planlamasına input veren time-series modeli.',
    helpNeeded: 'Tatil/özel gün etkisini modellemek için harici takvim entegrasyonu.',
    technologies: ['Python', 'Prophet', 'LightGBM', 'Airflow', 'PostgreSQL'],
    status: 'pending',
  },
  {
    userEmail: 'naz.yildiz@klab.test', roomCode: 'KT-02', periodMonths: 1, startDate: dayOffset(7),
    projectName: 'Erişilebilirlik Otomatik Test Aracı',
    projectDescription: 'Mobil uygulama ekranlarını WCAG 2.1 AA uyumluluğu için otomatik test eden tool. Renk kontrastı, dokunma alanı, screen reader uyumu.',
    helpNeeded: 'Görme engelli kullanıcılarla yapılacak kullanılabilirlik testlerinin organizasyonu.',
    technologies: ['TypeScript', 'Playwright', 'axe-core', 'React Native'],
    status: 'pending',
  },
  {
    userEmail: 'onur.acar@klab.test', roomCode: 'KT-09', periodMonths: 1, startDate: dayOffset(10),
    projectName: 'API Performans Anomali Dedektörü',
    projectDescription: 'Açık bankacılık API\'larının yanıt sürelerini izleyip anomalileri tespit edip otomatik incident açan tool.',
    helpNeeded: 'PagerDuty entegrasyonu ve incident playbook standardı.',
    technologies: ['Python', 'Prometheus', 'Grafana', 'scikit-learn'],
    status: 'pending',
  },

  // ---------- FEEDBACK REQUESTED (kullanıcı revize etmeli) ----------
  {
    userEmail: 'elif.celik@klab.test', roomCode: 'KT-01', periodMonths: 2, startDate: dayOffset(30),
    projectName: 'Federated Learning Pilot Çalışması',
    projectDescription: 'Müşteri verisini şube dışına çıkarmadan model eğitimini sağlayan federated learning altyapısı pilotu.',
    helpNeeded: 'Pilot için seçilecek 3 şube ve KVKK görüşü.',
    technologies: ['Python', 'PyTorch', 'Flower', 'Docker', 'Kubernetes'],
    status: 'feedback_requested',
    adminFeedback: 'Konsept çok değerli. Lütfen pilot kapsamını ve KPI\'ları daha somut yazınız — hangi metrikle başarı ölçülecek? KVKK ekibiyle ön görüşmenizi tamamlayıp sonucu paylaşabilir misiniz?',
  },
  {
    userEmail: 'burak.sahin@klab.test', roomCode: 'KT-06', periodMonths: 3, startDate: dayOffset(40),
    projectName: 'Çoklu Modlu Belge Anlama Sistemi',
    projectDescription: 'Form + tablo + el yazısı + imza içeren karmaşık dökümanları tek modelde anlama (LayoutLM tabanlı).',
    helpNeeded: 'Eğitim verisi için yıllık 10K döküman erişim izni.',
    technologies: ['Python', 'PyTorch', 'LayoutLM', 'Donut', 'FastAPI'],
    status: 'feedback_requested',
    adminFeedback: 'Veri erişim talebinizi compliance ekibine yönlendiriyorum. Eğitim verisinin nasıl anonimleştirileceğini açıklayan ek bir tasarım dökümanı bekliyorum.',
  },
  {
    userEmail: 'mehmet.demir@klab.test', roomCode: 'KT-08', periodMonths: 1, startDate: dayOffset(12),
    projectName: 'A/B Test Otomasyon Platformu',
    projectDescription: 'Pazarlama ve ürün ekiplerinin self-service A/B test çalıştırabileceği platform.',
    helpNeeded: 'İstatistiksel power hesaplama yardımcısı.',
    technologies: ['TypeScript', 'Next.js', 'PostgreSQL', 'Redis'],
    status: 'feedback_requested',
    adminFeedback: 'Bu zaten Müşteri Deneyimi ekibinin yol haritasında. Onlarla görüşüp birleştirme veya alternatif kapsam belirleyebilir misiniz?',
  },

  // ---------- REJECTED (reddedilmiş) ----------
  {
    userEmail: 'onur.acar@klab.test', roomCode: 'KT-05', periodMonths: 3, startDate: dayOffset(60),
    projectName: 'Kripto Para Alım-Satım Botu',
    projectDescription: 'Bankanın kendi portföyüyle algoritmik kripto trading yapan bot prototipi.',
    helpNeeded: 'Düzenleyici kurum onay süreci.',
    technologies: ['Python', 'CCXT', 'TensorFlow'],
    status: 'rejected',
    adminFeedback: 'Mevcut düzenleyici çerçeve gereği kurum portföyü ile spekülatif kripto işlemi yapılamaz. Lütfen bu kapsamı kapatın; piyasa risk analizi yönünde alternatif fikirlere açığız.',
  },
  {
    userEmail: 'emre.aksoy@klab.test', roomCode: 'KT-10', periodMonths: 2, startDate: dayOffset(80),
    projectName: 'Şube Kamera Yüz Tanıma Pilotu',
    projectDescription: 'Şube içi güvenlik kamerasından yüz tanıma ile VIP müşteri tespiti.',
    helpNeeded: 'Hukuk + KVKK görüşü.',
    technologies: ['Python', 'OpenCV', 'FaceNet'],
    status: 'rejected',
    adminFeedback: 'KVKK ve biyometrik veri işleme açısından yüksek riskli; mevcut framework içinde uygulanabilir değil. Müşteri onayı + alternatif kanal (mobil uygulama) yaklaşımı önerilir.',
  },
];

/* ============================================================
 * 5) ARGON2 OPSİYONLARI
 * ============================================================ */

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
};

/* ============================================================
 * 6) SEED FONKSİYONLARI
 * ============================================================ */

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

  const txn = db.transaction((rooms: RoomSeed[]) => {
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

  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existing.count >= DEMO_USERS.length) {
    console.log(`[SEED] User'lar zaten yüklü (${existing.count}), atlanıyor.`);
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, department, title, manager, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of DEMO_USERS) {
    const hash = await argon2.hash(u.password, ARGON2_OPTIONS);
    insert.run(nanoid(), u.email, hash, u.fullName, u.department ?? null, u.title ?? null, u.manager ?? null, u.bio ?? null);
  }
  console.log(`[SEED] ${DEMO_USERS.length} user eklendi.`);
}

export async function seedAdmins(): Promise<void> {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as count FROM admins').get() as { count: number };
  if (existing.count >= DEMO_ADMINS.length) {
    console.log(`[SEED] Admin'ler zaten yüklü (${existing.count}), atlanıyor.`);
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO admins (id, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const a of DEMO_ADMINS) {
    const hash = await argon2.hash(a.password, ARGON2_OPTIONS);
    insert.run(nanoid(), a.email, hash, a.fullName, a.role);
  }
  console.log(`[SEED] ${DEMO_ADMINS.length} admin eklendi.`);
}

export async function seedBookings(): Promise<void> {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as count FROM bookings').get() as { count: number };
  if (existing.count > 0) {
    console.log(`[SEED] Booking'ler zaten yüklü (${existing.count}), atlanıyor.`);
    return;
  }

  // Lookup tablolarını çek
  const users = db.prepare('SELECT id, email FROM users').all() as Array<{ id: string; email: string }>;
  const rooms = db.prepare('SELECT id, code FROM rooms').all() as Array<{ id: string; code: string }>;
  const admins = db.prepare('SELECT id FROM admins WHERE role = ?').all('super_admin') as Array<{ id: string }>;
  const reviewerId = admins[0]?.id ?? null;

  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  const roomByCode = new Map(rooms.map((r) => [r.code, r.id]));

  const insert = db.prepare(`
    INSERT INTO bookings (
      id, user_id, room_id, period_months, start_date, end_date,
      project_name, project_description, help_needed, technologies,
      status, admin_feedback, reviewed_by, reviewed_at,
      showcase_visible, showcase_highlight,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const b of BOOKINGS) {
    const userId = userByEmail.get(b.userEmail);
    const roomId = roomByCode.get(b.roomCode);
    if (!userId || !roomId) {
      console.warn(`[SEED] Booking atlandı (user veya oda bulunamadı): ${b.projectName}`);
      continue;
    }

    // end_date = start_date + periodMonths
    const start = new Date(b.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + b.periodMonths);
    const endDate = end.toISOString().split('T')[0];

    // Admin'in review yaptığı tarih = approve/reject ise start_date - 2 gün, feedback ise start_date - 1 gün
    const isReviewed = b.status !== 'pending';
    const reviewedAt = isReviewed
      ? new Date(start.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Approve edilmiş booking'ler envanterde görünür
    const showcaseVisible = b.status === 'approved' ? 1 : 0;
    const highlight = b.highlight && b.status === 'approved' ? 1 : 0;

    insert.run(
      nanoid(),
      userId,
      roomId,
      b.periodMonths,
      b.startDate,
      endDate,
      b.projectName,
      b.projectDescription,
      b.helpNeeded,
      JSON.stringify(b.technologies),
      b.status,
      b.adminFeedback ?? null,
      isReviewed ? reviewerId : null,
      reviewedAt,
      showcaseVisible,
      highlight,
      // created_at = start_date - 3 gün (talep oluşturulma zamanı)
      new Date(start.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      reviewedAt ?? new Date(start.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    );
    inserted++;
  }

  console.log(`[SEED] ${inserted} booking eklendi (yaklaşık ${BOOKINGS.filter((b) => b.status === 'approved').length} approved, ${BOOKINGS.filter((b) => b.status === 'pending').length} pending, ${BOOKINGS.filter((b) => b.status === 'feedback_requested').length} feedback, ${BOOKINGS.filter((b) => b.status === 'rejected').length} rejected).`);
}

export async function seedShowcaseEngagement(): Promise<void> {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as count FROM showcase_likes').get() as { count: number };
  if (existing.count > 0) {
    console.log(`[SEED] Showcase engagement zaten yüklü (${existing.count}), atlanıyor.`);
    return;
  }

  // Approved booking'leri ve user'ları çek
  const approved = db.prepare(`SELECT id FROM bookings WHERE status = 'approved' AND showcase_visible = 1`).all() as Array<{ id: string }>;
  const users = db.prepare('SELECT id, full_name FROM users').all() as Array<{ id: string; full_name: string }>;
  if (approved.length === 0 || users.length === 0) return;

  const likeInsert = db.prepare(`INSERT OR IGNORE INTO showcase_likes (id, booking_id, user_id) VALUES (?, ?, ?)`);
  const commentInsert = db.prepare(`INSERT INTO showcase_comments (id, booking_id, user_id, user_full_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

  const commentTemplates = [
    'Süper iş, denedik biz de — ekip çok beğendi!',
    'Bu fikir gerçekten ihtiyacımız olan şeydi.',
    'Tebrikler, mimari kararlar çok net.',
    'Demo\'yu izledik, çok etkileyici.',
    'Bizim ekiple ortak bir POC yapabilir miyiz?',
    'Veri pipeline\'ı için iletişime geçelim mi?',
    'Çok temiz bir çözüm, gerçekten.',
    'Bu hangi konferansta sunulacak?',
  ];

  let likeCount = 0;
  let commentCount = 0;

  for (const booking of approved) {
    // Her approved booking için 2-6 random like
    const likeUsers = users.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 5));
    for (const u of likeUsers) {
      const r = likeInsert.run(nanoid(), booking.id, u.id);
      if (r.changes > 0) likeCount++;
    }
    // Her approved booking için 1-3 random comment
    const commentUsers = users.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
    for (const u of commentUsers) {
      const body = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
      const daysAgo = Math.floor(Math.random() * 14);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      commentInsert.run(nanoid(), booking.id, u.id, u.full_name, body, createdAt);
      commentCount++;
    }
  }

  console.log(`[SEED] ${likeCount} like + ${commentCount} yorum eklendi.`);
}

/* ============================================================
 * LİSANS TALEPLERİ — demo verisi
 * ============================================================ */

interface LicenseRequestSeed {
  userEmail: string;
  licenseKey: string;
  licenseName: string;
  vendor?: string | null;
  category?: string | null;
  reason: string;
  durationMonths: 1 | 3 | 6 | 12;
  status: 'pending' | 'approved' | 'rejected' | 'feedback_requested';
  adminFeedback?: string;
  daysAgoCreated?: number; // default 7
}

const LICENSE_REQUESTS: LicenseRequestSeed[] = [
  // Approved
  {
    userEmail: 'ayse.yilmaz@klab.test',
    licenseKey: 'claude code',
    licenseName: 'Claude Code',
    vendor: 'Anthropic',
    category: 'AI Assistant',
    reason: 'NLP pilot ekibindeki günlük kod üretimi için Claude Code kullanmam gerekiyor. Mevcut LangChain pipeline\'larına entegre edip prototip hızını 2-3x artırmayı hedefliyorum.',
    durationMonths: 12,
    status: 'approved',
    adminFeedback: 'IT ekibi lisans atadı. Faturalandırma AI Lab cost center\'a.',
    daysAgoCreated: 25,
  },
  {
    userEmail: 'furkan.polat@klab.test',
    licenseKey: 'cursor',
    licenseName: 'Cursor',
    vendor: 'Cursor',
    category: 'IDE',
    reason: 'Computer Vision çalışmalarında PyTorch + OpenCV kod yazımı için Cursor\'ın AI tab completion özelliği kritik. VSCode\'a geçişten sonra verimlilik %40 arttı.',
    durationMonths: 12,
    status: 'approved',
    daysAgoCreated: 60,
  },
  {
    userEmail: 'burak.sahin@klab.test',
    licenseKey: 'claude',
    licenseName: 'Claude',
    vendor: 'Anthropic',
    category: 'AI Assistant',
    reason: 'RAG ve LLM fine-tuning araştırması için Claude Pro\'ya ihtiyacım var. Uzun context (200K) ve yüksek kalite çıktı kritik.',
    durationMonths: 6,
    status: 'approved',
    daysAgoCreated: 40,
  },
  {
    userEmail: 'kerem.ozturk@klab.test',
    licenseKey: 'github copilot',
    licenseName: 'GitHub Copilot',
    vendor: 'GitHub',
    category: 'AI Assistant',
    reason: 'Müşteri portalı React + Next.js geliştirme için Copilot kullanıyorum, tab completion günlük 2-3 saat zaman kazandırıyor.',
    durationMonths: 12,
    status: 'approved',
    daysAgoCreated: 90,
  },

  // Pending (admin onayı bekliyor)
  {
    userEmail: 'zeynep.kaya@klab.test',
    licenseKey: 'cursor',
    licenseName: 'Cursor',
    vendor: 'Cursor',
    category: 'IDE',
    reason: 'Risk model geliştirme için Cursor ile XGBoost + autoencoder pipelinelarını daha hızlı iterate edebilirim. Mevcut PyCharm setup\'ım yavaş.',
    durationMonths: 6,
    status: 'pending',
    daysAgoCreated: 3,
  },
  {
    userEmail: 'defne.arslan@klab.test',
    licenseKey: 'custom',
    licenseName: 'Antigravity',
    vendor: 'Antigravity Labs',
    category: 'Diğer',
    reason: 'Google\'ın yeni Antigravity araç setini Quant analiz çalışmalarında denemek istiyorum — multi-agent kod yazımı banka modeli simülasyonlarında değerli olabilir.',
    durationMonths: 3,
    status: 'pending',
    daysAgoCreated: 2,
  },
  {
    userEmail: 'elif.celik@klab.test',
    licenseKey: 'jetbrains',
    licenseName: 'JetBrains All',
    vendor: 'JetBrains',
    category: 'IDE',
    reason: 'Veri pipeline\'ı (Kafka + Flink) için tüm JetBrains paketine ihtiyacım var — özellikle DataGrip ve IntelliJ Ultimate kombinasyonu Scala/Java jobs için kritik.',
    durationMonths: 12,
    status: 'pending',
    daysAgoCreated: 5,
  },
  {
    userEmail: 'naz.yildiz@klab.test',
    licenseKey: 'custom',
    licenseName: 'Figma Organization',
    vendor: 'Figma',
    category: 'Diğer',
    reason: 'Servis tasarım çalışmaları için ekip lisansı; mevcut Pro plan tek kullanıcı için yetiyor ama 5 kişilik tasarım ekibine ölçeklenmemiz lazım.',
    durationMonths: 12,
    status: 'pending',
    daysAgoCreated: 1,
  },

  // Feedback requested (kullanıcı revize etmeli)
  {
    userEmail: 'emre.aksoy@klab.test',
    licenseKey: 'azure',
    licenseName: 'Azure OpenAI',
    vendor: 'Microsoft',
    category: 'Cloud',
    reason: 'DevOps pipeline\'larında AI destekli log analizi için Azure OpenAI istiyorum.',
    durationMonths: 12,
    status: 'feedback_requested',
    adminFeedback: 'Azure OpenAI lisansı yüksek bütçeli — KVKK uyumluluk, veri lokasyonu ve maliyet projeksiyonu (3-6-12 ay) içeren detaylı bir gerekçe paylaşır mısın? Türkiye region kullanılabiliyor mu?',
    daysAgoCreated: 10,
  },
  {
    userEmail: 'onur.acar@klab.test',
    licenseKey: 'openai',
    licenseName: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'API',
    reason: 'Açık bankacılık API sözleşmelerini otomatik analiz etmek için OpenAI API kotası istiyorum.',
    durationMonths: 6,
    status: 'feedback_requested',
    adminFeedback: 'Müşteri verisi içerebilecek sözleşmeler için OpenAI yerine Azure OpenAI (enterprise data residency garantili) öneriyoruz. Bu alternatifi de değerlendirip tercihini iletir misin?',
    daysAgoCreated: 7,
  },

  // Rejected
  {
    userEmail: 'mehmet.demir@klab.test',
    licenseKey: 'custom',
    licenseName: 'Midjourney',
    vendor: 'Midjourney Inc.',
    category: 'Diğer',
    reason: 'Pazarlama materyali için AI görsel üretici.',
    durationMonths: 3,
    status: 'rejected',
    adminFeedback: 'Marka uyumluluğu açısından Midjourney prompt akışı kurumsal denetime kapalı — mevcut Stable Diffusion + brand-LoRA setup\'ımızı kullanmanı öneriyoruz (Furkan ekibi destek olabilir).',
    daysAgoCreated: 20,
  },
  {
    userEmail: 'begum.kilic@klab.test',
    licenseKey: 'custom',
    licenseName: 'Replit Teams',
    vendor: 'Replit',
    category: 'Diğer',
    reason: 'Hızlı prototipleme için cloud IDE.',
    durationMonths: 6,
    status: 'rejected',
    adminFeedback: 'Replit cloud üzerinde kod barındırılması bilgi güvenliği politikası gereği uygun değil. Yerel geliştirme için JetBrains veya VSCode tercih edilmeli.',
    daysAgoCreated: 15,
  },
];

export async function seedLicenseRequests(): Promise<void> {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM license_requests').get() as { count: number };
  if (existing.count > 0) {
    console.log(`[SEED] Lisans talepleri zaten yüklü (${existing.count}), atlanıyor.`);
    return;
  }

  const users = db.prepare('SELECT id, email FROM users').all() as Array<{ id: string; email: string }>;
  const admins = db.prepare('SELECT id FROM admins WHERE role = ?').all('super_admin') as Array<{ id: string }>;
  const reviewerId = admins[0]?.id ?? null;
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));

  const insert = db.prepare(`
    INSERT INTO license_requests (
      id, user_id, license_key, license_name, vendor, category,
      reason, duration_months, status, admin_feedback,
      reviewed_by, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const r of LICENSE_REQUESTS) {
    const userId = userByEmail.get(r.userEmail);
    if (!userId) {
      console.warn(`[SEED] Lisans talebi atlandı (user yok): ${r.userEmail}`);
      continue;
    }

    const daysAgo = r.daysAgoCreated ?? 7;
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const isReviewed = r.status !== 'pending';
    const reviewedAt = isReviewed
      ? new Date(Date.now() - Math.max(0, daysAgo - 2) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    insert.run(
      nanoid(),
      userId,
      r.licenseKey,
      r.licenseName,
      r.vendor ?? null,
      r.category ?? null,
      r.reason,
      r.durationMonths,
      r.status,
      r.adminFeedback ?? null,
      isReviewed ? reviewerId : null,
      reviewedAt,
      createdAt,
      reviewedAt ?? createdAt
    );
    count++;
  }

  console.log(`[SEED] ${count} lisans talebi eklendi (${LICENSE_REQUESTS.filter((r) => r.status === 'approved').length} approved, ${LICENSE_REQUESTS.filter((r) => r.status === 'pending').length} pending, ${LICENSE_REQUESTS.filter((r) => r.status === 'feedback_requested').length} feedback, ${LICENSE_REQUESTS.filter((r) => r.status === 'rejected').length} rejected).`);
}

export async function runSeed(): Promise<void> {
  await seedRooms();
  await seedUsers();
  await seedAdmins();
  await seedBookings();
  await seedShowcaseEngagement();
  await seedLicenseRequests();
}
